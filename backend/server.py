from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title="Warehouse Management System API")
api = APIRouter(prefix="/api")

JWT_ALGO = "HS256"


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_pw(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str, ttl_minutes: int = 60 * 24 * 7) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
        "type": "access",
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGO)


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "manager", "operator"] = "operator"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class SkuIn(BaseModel):
    sku_code: str
    name: str
    category: str
    unit: str = "EA"
    unit_price: float = 0.0
    reorder_level: int = 10


class SkuOut(SkuIn):
    id: str
    total_stock: int
    created_at: str


class LocationOut(BaseModel):
    id: str
    code: str
    zone: str
    rack: str
    bin: str
    capacity: int
    occupied: int


class InboundItemIn(BaseModel):
    sku_id: str
    qty: int
    location_id: str


class InboundIn(BaseModel):
    po_number: str
    supplier: str
    expected_date: str
    items: List[InboundItemIn]


class OutboundItemIn(BaseModel):
    sku_id: str
    qty: int


class OutboundIn(BaseModel):
    so_number: str
    customer: str
    items: List[OutboundItemIn]


# ---------- Auth dep ----------
async def get_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_role(*roles: str):
    async def _checker(user: dict = Depends(get_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Forbidden")
        return user

    return _checker


def set_auth_cookie(resp: Response, token: str):
    resp.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


# ---------- Auth Routes ----------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_pw(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"], email)
    set_auth_cookie(response, token)
    return {"id": user["id"], "email": email, "name": user["name"], "role": user["role"], "token": token}


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(user["id"], email)
    set_auth_cookie(response, token)
    return {"id": user["id"], "email": email, "name": user["name"], "role": user["role"], "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_user)):
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


# ---------- Inventory ----------
@api.get("/inventory/skus")
async def list_skus(q: Optional[str] = None, category: Optional[str] = None, user: dict = Depends(get_user)):
    flt = {}
    if q:
        flt["$or"] = [
            {"sku_code": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]
    if category:
        flt["category"] = category
    skus = await db.skus.find(flt, {"_id": 0}).to_list(1000)
    return skus


@api.post("/inventory/skus")
async def create_sku(body: SkuIn, user: dict = Depends(require_role("admin", "manager"))):
    if await db.skus.find_one({"sku_code": body.sku_code}):
        raise HTTPException(400, "SKU already exists")
    sku = body.model_dump()
    sku["id"] = str(uuid.uuid4())
    sku["total_stock"] = 0
    sku["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.skus.insert_one(sku)
    sku.pop("_id", None)
    return sku


@api.put("/inventory/skus/{sku_id}")
async def update_sku(sku_id: str, body: SkuIn, user: dict = Depends(require_role("admin", "manager"))):
    res = await db.skus.update_one({"id": sku_id}, {"$set": body.model_dump()})
    if not res.matched_count:
        raise HTTPException(404, "SKU not found")
    sku = await db.skus.find_one({"id": sku_id}, {"_id": 0})
    return sku


@api.delete("/inventory/skus/{sku_id}")
async def delete_sku(sku_id: str, user: dict = Depends(require_role("admin"))):
    await db.skus.delete_one({"id": sku_id})
    await db.stock.delete_many({"sku_id": sku_id})
    return {"ok": True}


@api.get("/inventory/categories")
async def categories(user: dict = Depends(get_user)):
    cats = await db.skus.distinct("category")
    return cats


@api.get("/inventory/skus/{sku_id}/stock")
async def sku_stock(sku_id: str, user: dict = Depends(get_user)):
    rows = await db.stock.find({"sku_id": sku_id}, {"_id": 0}).to_list(1000)
    out = []
    for r in rows:
        loc = await db.locations.find_one({"id": r["location_id"]}, {"_id": 0})
        if loc:
            out.append({"location": loc, "qty": r["qty"]})
    return out


# ---------- Storage / Locations ----------
@api.get("/storage/locations")
async def list_locations(zone: Optional[str] = None, user: dict = Depends(get_user)):
    flt = {"zone": zone} if zone else {}
    return await db.locations.find(flt, {"_id": 0}).sort([("zone", 1), ("rack", 1), ("bin", 1)]).to_list(2000)


@api.get("/storage/zones")
async def zones(user: dict = Depends(get_user)):
    pipeline = [
        {"$group": {
            "_id": "$zone",
            "capacity": {"$sum": "$capacity"},
            "occupied": {"$sum": "$occupied"},
            "bins": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    out = []
    async for r in db.locations.aggregate(pipeline):
        out.append({"zone": r["_id"], "capacity": r["capacity"], "occupied": r["occupied"], "bins": r["bins"]})
    return out


# ---------- Inbound ----------
@api.get("/inbound")
async def list_inbound(status: Optional[str] = None, user: dict = Depends(get_user)):
    flt = {"status": status} if status else {}
    return await db.inbound.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/inbound")
async def create_inbound(body: InboundIn, user: dict = Depends(require_role("admin", "manager"))):
    doc = {
        "id": str(uuid.uuid4()),
        "po_number": body.po_number,
        "supplier": body.supplier,
        "expected_date": body.expected_date,
        "items": [i.model_dump() for i in body.items],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["name"],
    }
    await db.inbound.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/inbound/{order_id}/receive")
async def receive_inbound(order_id: str, user: dict = Depends(require_role("admin", "manager", "operator"))):
    order = await db.inbound.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Inbound order not found")
    if order["status"] == "completed":
        raise HTTPException(400, "Already completed")
    for item in order["items"]:
        # update stock at location
        await db.stock.update_one(
            {"sku_id": item["sku_id"], "location_id": item["location_id"]},
            {"$inc": {"qty": item["qty"]}},
            upsert=True,
        )
        await db.skus.update_one({"id": item["sku_id"]}, {"$inc": {"total_stock": item["qty"]}})
        await db.locations.update_one({"id": item["location_id"]}, {"$inc": {"occupied": item["qty"]}})
        await db.movements.insert_one({
            "id": str(uuid.uuid4()),
            "type": "in",
            "sku_id": item["sku_id"],
            "location_id": item["location_id"],
            "qty": item["qty"],
            "ref": order["po_number"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    await db.inbound.update_one({"id": order_id}, {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}


# ---------- Outbound ----------
@api.get("/outbound")
async def list_outbound(status: Optional[str] = None, user: dict = Depends(get_user)):
    flt = {"status": status} if status else {}
    return await db.outbound.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/outbound")
async def create_outbound(body: OutboundIn, user: dict = Depends(require_role("admin", "manager"))):
    doc = {
        "id": str(uuid.uuid4()),
        "so_number": body.so_number,
        "customer": body.customer,
        "items": [i.model_dump() for i in body.items],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["name"],
    }
    await db.outbound.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/outbound/{order_id}/advance")
async def advance_outbound(order_id: str, user: dict = Depends(require_role("admin", "manager", "operator"))):
    """Move pick → pack → ship. On ship, deduct stock from any location with qty."""
    order = await db.outbound.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Outbound order not found")
    flow = {"pending": "picking", "picking": "packing", "packing": "shipped"}
    nxt = flow.get(order["status"])
    if not nxt:
        raise HTTPException(400, "Order is already shipped")

    if nxt == "shipped":
        for item in order["items"]:
            remaining = item["qty"]
            stocks = await db.stock.find({"sku_id": item["sku_id"], "qty": {"$gt": 0}}, {"_id": 0}).to_list(100)
            for s in stocks:
                if remaining <= 0:
                    break
                take = min(s["qty"], remaining)
                await db.stock.update_one(
                    {"sku_id": item["sku_id"], "location_id": s["location_id"]},
                    {"$inc": {"qty": -take}},
                )
                await db.locations.update_one({"id": s["location_id"]}, {"$inc": {"occupied": -take}})
                await db.movements.insert_one({
                    "id": str(uuid.uuid4()),
                    "type": "out",
                    "sku_id": item["sku_id"],
                    "location_id": s["location_id"],
                    "qty": take,
                    "ref": order["so_number"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                remaining -= take
            await db.skus.update_one({"id": item["sku_id"]}, {"$inc": {"total_stock": -(item["qty"] - remaining)}})

    await db.outbound.update_one({"id": order_id}, {"$set": {"status": nxt}})
    return {"ok": True, "status": nxt}


# ---------- Dashboard ----------
@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_user)):
    total_skus = await db.skus.count_documents({})
    total_locations = await db.locations.count_documents({})
    skus_cursor = db.skus.find({}, {"_id": 0})
    total_value = 0.0
    low_stock = 0
    out_of_stock = 0
    async for s in skus_cursor:
        total_value += s.get("total_stock", 0) * s.get("unit_price", 0)
        if s.get("total_stock", 0) <= 0:
            out_of_stock += 1
        elif s.get("total_stock", 0) <= s.get("reorder_level", 0):
            low_stock += 1

    today = datetime.now(timezone.utc).date().isoformat()
    inbound_today = await db.movements.count_documents({"type": "in", "timestamp": {"$gte": today}})
    outbound_today = await db.movements.count_documents({"type": "out", "timestamp": {"$gte": today}})

    pending_inbound = await db.inbound.count_documents({"status": "pending"})
    pending_outbound = await db.outbound.count_documents({"status": {"$ne": "shipped"}})

    cap_pipeline = [{"$group": {"_id": None, "cap": {"$sum": "$capacity"}, "occ": {"$sum": "$occupied"}}}]
    cap_doc = None
    async for d in db.locations.aggregate(cap_pipeline):
        cap_doc = d
    utilization = 0
    if cap_doc and cap_doc["cap"]:
        utilization = round((cap_doc["occ"] / cap_doc["cap"]) * 100, 1)

    # Recent movements
    recent = await db.movements.find({}, {"_id": 0}).sort("timestamp", -1).limit(8).to_list(8)
    for m in recent:
        sku = await db.skus.find_one({"id": m["sku_id"]}, {"_id": 0, "sku_code": 1, "name": 1})
        loc = await db.locations.find_one({"id": m["location_id"]}, {"_id": 0, "code": 1})
        m["sku"] = sku
        m["location"] = loc

    return {
        "total_skus": total_skus,
        "total_locations": total_locations,
        "stock_value": round(total_value, 2),
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "inbound_today": inbound_today,
        "outbound_today": outbound_today,
        "pending_inbound": pending_inbound,
        "pending_outbound": pending_outbound,
        "utilization": utilization,
        "recent_movements": recent,
    }


@api.get("/dashboard/movements")
async def movement_trends(days: int = 14, user: dict = Depends(get_user)):
    """Daily inbound vs outbound counts for the last N days."""
    start = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    cur = db.movements.find({"timestamp": {"$gte": start}}, {"_id": 0})
    buckets: dict = {}
    async for m in cur:
        day = m["timestamp"][:10]
        b = buckets.setdefault(day, {"date": day, "inbound": 0, "outbound": 0})
        if m["type"] == "in":
            b["inbound"] += m["qty"]
        else:
            b["outbound"] += m["qty"]
    # fill missing days
    out = []
    for i in range(days, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
        out.append(buckets.get(d, {"date": d, "inbound": 0, "outbound": 0}))
    return out


# ---------- Reports ----------
@api.get("/reports/top-skus")
async def top_skus(limit: int = 10, user: dict = Depends(get_user)):
    pipeline = [
        {"$group": {"_id": "$sku_id", "moved": {"$sum": "$qty"}}},
        {"$sort": {"moved": -1}},
        {"$limit": limit},
    ]
    out = []
    async for r in db.movements.aggregate(pipeline):
        sku = await db.skus.find_one({"id": r["_id"]}, {"_id": 0, "sku_code": 1, "name": 1, "category": 1})
        if sku:
            out.append({"sku": sku, "moved": r["moved"]})
    return out


@api.get("/reports/category-distribution")
async def category_dist(user: dict = Depends(get_user)):
    pipeline = [
        {"$group": {"_id": "$category", "count": {"$sum": 1}, "stock": {"$sum": "$total_stock"}}},
        {"$sort": {"count": -1}},
    ]
    out = []
    async for r in db.skus.aggregate(pipeline):
        out.append({"category": r["_id"], "count": r["count"], "stock": r["stock"]})
    return out


@api.post("/reports/ai-insights")
async def ai_insights(user: dict = Depends(get_user)):
    """Generate AI-powered analysis of warehouse performance via Claude Sonnet 4.5."""
    summary = await dashboard_summary(user)
    top = await top_skus(5, user)
    cats = await category_dist(user)
    low_stock_skus = await db.skus.find(
        {"$expr": {"$lte": ["$total_stock", "$reorder_level"]}}, {"_id": 0, "sku_code": 1, "name": 1, "total_stock": 1, "reorder_level": 1}
    ).limit(10).to_list(10)

    context = f"""
WAREHOUSE PERFORMANCE SNAPSHOT
- Total SKUs: {summary['total_skus']}
- Stock Value: ${summary['stock_value']}
- Low Stock SKUs: {summary['low_stock']}
- Out of Stock: {summary['out_of_stock']}
- Storage Utilization: {summary['utilization']}%
- Pending Inbound: {summary['pending_inbound']}
- Pending Outbound: {summary['pending_outbound']}

LOW STOCK ITEMS NEEDING REORDER:
{chr(10).join([f"  - {s['sku_code']} {s['name']}: {s['total_stock']} on hand (reorder at {s['reorder_level']})" for s in low_stock_skus[:8]])}

TOP MOVING SKUs:
{chr(10).join([f"  - {t['sku']['sku_code']} {t['sku']['name']}: {t['moved']} units moved" for t in top])}

CATEGORY DISTRIBUTION:
{chr(10).join([f"  - {c['category']}: {c['count']} SKUs, {c['stock']} units" for c in cats])}
"""

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"wms-insights-{user['id']}",
            system_message=(
                "You are a senior warehouse operations analyst. Analyze the snapshot and produce a sharp, "
                "tactical report with: 1) a 2-line executive summary, 2) 3 prioritized actionable insights "
                "(with bullet markers '>'), 3) a brief risk assessment. Use crisp, technical language. "
                "Format output as plain text with section headers in CAPS. Keep total under 220 words."
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        msg = UserMessage(text=context)
        response = await chat.send_message(msg)
        return {"insights": response, "generated_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        logging.exception("AI insights failed")
        return {"insights": f"AI service unavailable: {str(e)}", "generated_at": datetime.now(timezone.utc).isoformat()}


# ---------- Seed ----------
async def seed_data():
    # users
    users_seed = [
        ("ADMIN_EMAIL", "ADMIN_PASSWORD", "Admin User", "admin"),
        ("MANAGER_EMAIL", "MANAGER_PASSWORD", "Warehouse Manager", "manager"),
        ("OPERATOR_EMAIL", "OPERATOR_PASSWORD", "Floor Operator", "operator"),
    ]
    for em_key, pw_key, name, role in users_seed:
        em = os.environ.get(em_key, "").lower()
        pw = os.environ.get(pw_key, "")
        if not em:
            continue
        existing = await db.users.find_one({"email": em})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": em, "name": name, "role": role,
                "password_hash": hash_pw(pw),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        elif not verify_pw(pw, existing["password_hash"]):
            await db.users.update_one({"email": em}, {"$set": {"password_hash": hash_pw(pw)}})

    # locations: Zones A-D, Racks 1-5, Bins 1-6
    if await db.locations.count_documents({}) == 0:
        locs = []
        for zone in ["A", "B", "C", "D"]:
            for rack in range(1, 6):
                for bn in range(1, 7):
                    locs.append({
                        "id": str(uuid.uuid4()),
                        "code": f"{zone}-R{rack}-B{bn:02d}",
                        "zone": zone, "rack": str(rack), "bin": f"{bn:02d}",
                        "capacity": 100, "occupied": 0,
                    })
        await db.locations.insert_many(locs)

    # SKUs
    if await db.skus.count_documents({}) == 0:
        catalog = [
            ("SKU-1001-A", "Industrial Bearing 6205", "Components", "EA", 12.50, 50),
            ("SKU-1002-B", "Hydraulic Cylinder 32mm", "Hydraulics", "EA", 145.00, 8),
            ("SKU-1003-C", "PLC Module S7-1200", "Electronics", "EA", 320.00, 5),
            ("SKU-1004-D", "Steel Bracket L-90", "Hardware", "EA", 4.20, 200),
            ("SKU-1005-E", "Servo Motor 400W", "Electronics", "EA", 240.00, 6),
            ("SKU-1006-F", "Conveyor Belt Roll 10m", "Conveyors", "ROLL", 89.90, 20),
            ("SKU-1007-G", "Hex Bolts M8x40 (100pk)", "Hardware", "PK", 8.50, 100),
            ("SKU-1008-H", "Lubricant Oil ISO-VG-46", "Consumables", "L", 5.40, 60),
            ("SKU-1009-I", "Safety Helmet Hi-Vis", "PPE", "EA", 22.00, 40),
            ("SKU-1010-J", "Forklift Battery 48V", "Power", "EA", 1450.00, 3),
            ("SKU-1011-K", "Pneumatic Valve 1/4\"", "Pneumatics", "EA", 18.30, 35),
            ("SKU-1012-L", "Industrial Sensor IR", "Electronics", "EA", 56.00, 15),
            ("SKU-1013-M", "Stretch Wrap Roll", "Packaging", "ROLL", 7.20, 80),
            ("SKU-1014-N", "Carton Box 60x40x30", "Packaging", "EA", 1.80, 500),
            ("SKU-1015-O", "Worklight LED 50W", "Electronics", "EA", 32.00, 25),
            ("SKU-1016-P", "Pallet Jack Manual 2T", "Equipment", "EA", 320.00, 4),
            ("SKU-1017-Q", "Cable AWG-12 100m", "Electronics", "ROLL", 78.00, 12),
            ("SKU-1018-R", "Gear Reducer 1:30", "Mechanical", "EA", 410.00, 5),
            ("SKU-1019-S", "Welding Rod E6013 5kg", "Consumables", "PK", 19.50, 60),
            ("SKU-1020-T", "Hydraulic Hose 1m", "Hydraulics", "EA", 24.00, 45),
            ("SKU-1021-U", "Compressor Oil 5L", "Consumables", "L", 32.00, 30),
            ("SKU-1022-V", "Safety Glasses Pack", "PPE", "PK", 15.00, 50),
            ("SKU-1023-W", "Electric Motor 1.5kW", "Electronics", "EA", 280.00, 7),
            ("SKU-1024-X", "Roller Chain 80-1", "Mechanical", "M", 12.00, 100),
            ("SKU-1025-Y", "Industrial Gloves L", "PPE", "PK", 6.80, 70),
        ]
        skus = []
        for code, name, cat, unit, price, reorder in catalog:
            skus.append({
                "id": str(uuid.uuid4()),
                "sku_code": code, "name": name, "category": cat, "unit": unit,
                "unit_price": price, "reorder_level": reorder,
                "total_stock": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        await db.skus.insert_many(skus)

        # Distribute initial stock to random locations + create movement history
        all_locs = await db.locations.find({}, {"_id": 0}).to_list(2000)
        for sku in skus:
            base_qty = random.randint(15, 180)
            placements = random.sample(all_locs, k=random.randint(1, 3))
            per = base_qty // len(placements)
            for loc in placements:
                qty = per + (base_qty - per * len(placements) if loc is placements[-1] else 0)
                if qty <= 0:
                    continue
                await db.stock.insert_one({"sku_id": sku["id"], "location_id": loc["id"], "qty": qty})
                await db.locations.update_one({"id": loc["id"]}, {"$inc": {"occupied": qty}})
                # historical inbound
                ts = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 13), hours=random.randint(0, 23))
                await db.movements.insert_one({
                    "id": str(uuid.uuid4()),
                    "type": "in",
                    "sku_id": sku["id"],
                    "location_id": loc["id"],
                    "qty": qty,
                    "ref": f"PO-INIT-{random.randint(1000,9999)}",
                    "timestamp": ts.isoformat(),
                })
            await db.skus.update_one({"id": sku["id"]}, {"$set": {"total_stock": base_qty}})

        # historical outbound movements
        skus_db = await db.skus.find({}, {"_id": 0}).to_list(100)
        for _ in range(40):
            sku = random.choice(skus_db)
            stocks = await db.stock.find({"sku_id": sku["id"], "qty": {"$gt": 0}}, {"_id": 0}).to_list(10)
            if not stocks:
                continue
            s = random.choice(stocks)
            qty = random.randint(1, min(10, s["qty"]))
            await db.stock.update_one({"sku_id": sku["id"], "location_id": s["location_id"]}, {"$inc": {"qty": -qty}})
            await db.locations.update_one({"id": s["location_id"]}, {"$inc": {"occupied": -qty}})
            await db.skus.update_one({"id": sku["id"]}, {"$inc": {"total_stock": -qty}})
            ts = datetime.now(timezone.utc) - timedelta(days=random.randint(0, 13), hours=random.randint(0, 23))
            await db.movements.insert_one({
                "id": str(uuid.uuid4()),
                "type": "out",
                "sku_id": sku["id"],
                "location_id": s["location_id"],
                "qty": qty,
                "ref": f"SO-INIT-{random.randint(1000,9999)}",
                "timestamp": ts.isoformat(),
            })

    # Sample inbound orders
    if await db.inbound.count_documents({}) == 0:
        skus_db = await db.skus.find({}, {"_id": 0}).to_list(100)
        locs_db = await db.locations.find({}, {"_id": 0}).to_list(2000)
        suppliers = ["Acme Industrial", "TechSupply Co", "GlobalParts Ltd", "MetroSourcing", "PrimeVendor Inc"]
        for i in range(8):
            picks = random.sample(skus_db, k=random.randint(2, 4))
            items = [{"sku_id": s["id"], "qty": random.randint(20, 80), "location_id": random.choice(locs_db)["id"]} for s in picks]
            await db.inbound.insert_one({
                "id": str(uuid.uuid4()),
                "po_number": f"PO-2026-{1000+i:04d}",
                "supplier": random.choice(suppliers),
                "expected_date": (datetime.now(timezone.utc) + timedelta(days=random.randint(1, 10))).date().isoformat(),
                "items": items,
                "status": random.choice(["pending", "pending", "completed"]),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 5))).isoformat(),
                "created_by": "Admin User",
            })

    # Sample outbound
    if await db.outbound.count_documents({}) == 0:
        skus_db = await db.skus.find({}, {"_id": 0}).to_list(100)
        customers = ["Apex Manufacturing", "Stellar Robotics", "BlueRiver Logistics", "OmegaCorp", "NorthBay Eng"]
        statuses = ["pending", "picking", "packing", "shipped"]
        for i in range(10):
            picks = random.sample(skus_db, k=random.randint(2, 4))
            items = [{"sku_id": s["id"], "qty": random.randint(1, 8)} for s in picks]
            await db.outbound.insert_one({
                "id": str(uuid.uuid4()),
                "so_number": f"SO-2026-{2000+i:04d}",
                "customer": random.choice(customers),
                "items": items,
                "status": random.choice(statuses),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 5))).isoformat(),
                "created_by": "Admin User",
            })


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.skus.create_index("sku_code", unique=True)
    await db.locations.create_index("code", unique=True)
    await db.movements.create_index("timestamp")
    await seed_data()


# ---------- Mount ----------
app.include_router(api)

origins_env = os.environ.get("CORS_ORIGINS", "*")
allowed = [o.strip() for o in origins_env.split(",")] if origins_env != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


@api.get("/")
async def root():
    return {"app": "WMS API", "status": "ok"}
