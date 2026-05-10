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
    batch_no: Optional[str] = None
    manufacture_date: Optional[str] = None
    expiry_date: Optional[str] = None
    barcode: Optional[str] = None


class InboundIn(BaseModel):
    po_number: str
    supplier: str
    expected_date: str
    items: List[InboundItemIn]


class PutawayScanIn(BaseModel):
    barcode: str


class FlowLaneAssignIn(BaseModel):
    sku_id: Optional[str] = None


class ZoneProvisionIn(BaseModel):
    zone_code: str
    zone_name: str
    temperature: float
    rows: List[dict]  # [{row: "A", rack_type: "A", lanes: 13, depth: 4, levels: 4, weight_kg: 8000, lane_start: 26}]


class ZoneCreateIn(BaseModel):
    zone_code: str
    zone_name: str
    temperature: Optional[float] = 22.0


class ZoneEditIn(BaseModel):
    zone_name: str
    temperature: Optional[float] = None


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
            "_id": {"zone": "$zone", "name": "$zone_name", "temp": "$temperature"},
            "capacity": {"$sum": "$capacity"},
            "occupied": {"$sum": "$occupied"},
            "bins": {"$sum": 1},
        }},
        {"$sort": {"_id.zone": 1}},
    ]
    out = []
    async for r in db.locations.aggregate(pipeline):
        out.append({
            "zone": r["_id"]["zone"],
            "name": r["_id"].get("name") or r["_id"]["zone"],
            "temperature": r["_id"].get("temp"),
            "capacity": r["capacity"],
            "occupied": r["occupied"],
            "bins": r["bins"],
        })
    # also include placeholder zones (no bins yet)
    placeholders = await db.zones_meta.find({}, {"_id": 0}).to_list(50)
    for p in placeholders:
        if not any(o["zone"] == p["zone"] for o in out):
            out.append({
                "zone": p["zone"],
                "name": p.get("name", p["zone"]),
                "temperature": p.get("temperature"),
                "capacity": 0,
                "occupied": 0,
                "bins": 0,
                "placeholder": True,
            })
    return out


@api.get("/storage/lanes/{row}/{lane_number}/contents")
async def lane_contents(row: str, lane_number: int, user: dict = Depends(get_user)):
    """Return all bins of a single lane with their pallet contents in one call."""
    bins = await db.locations.find(
        {"row_label": row, "lane_number": lane_number},
        {"_id": 0},
    ).sort([("level", 1), ("position", 1)]).to_list(500)
    bin_ids = [b["id"] for b in bins]
    stock = await db.stock.find({"location_id": {"$in": bin_ids}, "qty": {"$gt": 0}}, {"_id": 0}).to_list(500)
    sku_ids = list({s["sku_id"] for s in stock})
    skus = await db.skus.find({"id": {"$in": sku_ids}}, {"_id": 0, "id": 1, "sku_code": 1, "name": 1, "category": 1}).to_list(500)
    sku_map = {s["id"]: s for s in skus}
    stock_by_loc = {
        s["location_id"]: {
            "sku": sku_map.get(s["sku_id"]),
            "qty": s["qty"],
            "batch_no": s.get("batch_no"),
            "manufacture_date": s.get("manufacture_date"),
            "expiry_date": s.get("expiry_date"),
            "received_date": s.get("received_date"),
        }
        for s in stock
    }
    out = []
    for b in bins:
        out.append({"bin": b, "item": stock_by_loc.get(b["id"])})
    return out


# ---------- Blueprint Upload (AI Parse + Manual Provision) ----------
from fastapi import UploadFile, File, Form


@api.post("/storage/parse-blueprint")
async def parse_blueprint(
    file: UploadFile = File(...),
    user: dict = Depends(require_role("admin", "manager")),
):
    """Use Claude to parse uploaded blueprint PDF and suggest rack configuration."""
    import json as json_lib
    import fitz  # PyMuPDF

    raw = await file.read()
    text = ""
    try:
        doc = fitz.open(stream=raw, filetype="pdf")
        for page in doc:
            text += page.get_text() + "\n"
        doc.close()
    except Exception as e:
        raise HTTPException(400, f"Could not read PDF: {e}")

    if not text.strip():
        raise HTTPException(400, "Could not extract text from blueprint")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"bp-parse-{user['id']}-{uuid.uuid4()}",
            system_message=(
                "You are a warehouse blueprint analyst. Extract rack/lane configuration from the blueprint text "
                "and return STRICT JSON only (no prose, no markdown). Schema: "
                '{"zone_name": "string", "temperature": number_celsius, "rows": ['
                '{"row": "A|B|C|...", "rack_type": "A|B|C", "lanes": int, "lane_start": int, '
                '"levels": int, "depth": int, "weight_kg": int}]}. '
                "If a field is unclear, infer reasonable defaults (levels=4, depth=4, weight_kg=8000). "
                "If the blueprint mentions cold storage temperature use it; otherwise use 22 (ambient)."
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        msg = UserMessage(text=f"BLUEPRINT TEXT:\n\n{text[:8000]}")
        response = await chat.send_message(msg)
        # try to parse JSON from response
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()
        config = json_lib.loads(cleaned)
        return {"config": config, "raw_response": response}
    except json_lib.JSONDecodeError as e:
        return {
            "config": {
                "zone_name": "New Zone",
                "temperature": 22,
                "rows": [{"row": "A", "rack_type": "A", "lanes": 5, "lane_start": 1, "levels": 4, "depth": 4, "weight_kg": 8000}],
            },
            "warning": f"Could not parse AI response as JSON, returning defaults. Raw: {response[:200]}",
        }
    except Exception as e:
        raise HTTPException(500, f"AI parse failed: {e}")


@api.post("/storage/zones/{zone_code}/provision")
async def provision_zone(
    zone_code: str,
    body: ZoneProvisionIn,
    user: dict = Depends(require_role("admin", "manager")),
):
    """Create lanes for a zone from a config (AI-suggested or manually entered)."""
    if zone_code != body.zone_code:
        raise HTTPException(400, "Zone code mismatch")

    # Refuse if zone already has bins
    if await db.locations.count_documents({"zone": zone_code}) > 0:
        raise HTTPException(400, "Zone already provisioned")

    locs = []
    for row_cfg in body.rows:
        row_label = row_cfg["row"]
        rack_type = row_cfg.get("rack_type", "A")
        lanes_count = int(row_cfg["lanes"])
        lane_start = int(row_cfg.get("lane_start", 1))
        levels = int(row_cfg.get("levels", 4))
        depth = int(row_cfg.get("depth", 4))
        weight_kg = int(row_cfg.get("weight_kg", 8000))
        for i in range(lanes_count):
            lane_num = lane_start + i
            for level in range(1, levels + 1):
                for pos in range(1, depth + 1):
                    locs.append({
                        "id": str(uuid.uuid4()),
                        "code": f"{zone_code}-{row_label}-L{lane_num:02d}-LV{level}-P{pos:02d}",
                        "zone": zone_code,
                        "zone_name": body.zone_name,
                        "temperature": body.temperature,
                        "row_label": row_label,
                        "rack_type": rack_type,
                        "lane_number": lane_num,
                        "level": level,
                        "position": pos,
                        "depth": depth,
                        "levels": levels,
                        "weight_capacity_kg": weight_kg,
                        "capacity": 1,
                        "occupied": 0,
                    })

    if locs:
        await db.locations.insert_many(locs)

    # Update zones_meta
    await db.zones_meta.update_one(
        {"zone": zone_code},
        {"$set": {
            "zone": zone_code,
            "name": body.zone_name,
            "temperature": body.temperature,
            "placeholder": False,
        }},
        upsert=True,
    )
    return {"ok": True, "bins_created": len(locs)}


@api.post("/storage/zones")
async def create_zone(
    body: ZoneCreateIn,
    user: dict = Depends(require_role("admin", "manager")),
):
    """Create a new placeholder zone (ready to be provisioned)."""
    code = body.zone_code.strip().upper()
    if not code:
        raise HTTPException(400, "Zone code required")
    existing = await db.zones_meta.find_one({"zone": code})
    if existing:
        raise HTTPException(400, f"Zone {code} already exists")
    await db.zones_meta.insert_one({
        "zone": code,
        "name": body.zone_name.strip() or code,
        "temperature": body.temperature,
        "placeholder": True,
    })
    return {"ok": True, "zone": code}


@api.put("/storage/zones/{zone_code}")
async def edit_zone(
    zone_code: str,
    body: ZoneEditIn,
    user: dict = Depends(require_role("admin", "manager")),
):
    """Edit zone name and/or temperature."""
    update: dict = {"name": body.zone_name.strip()}
    if body.temperature is not None:
        update["temperature"] = body.temperature
    await db.zones_meta.update_one(
        {"zone": zone_code},
        {"$set": update},
        upsert=True,
    )
    # Also update all bin documents so the zone_name stays consistent
    bin_update: dict = {"zone_name": update["name"]}
    if body.temperature is not None:
        bin_update["temperature"] = body.temperature
    await db.locations.update_many({"zone": zone_code}, {"$set": bin_update})
    return {"ok": True}


@api.delete("/storage/zones/{zone_code}")
async def delete_zone(
    zone_code: str,
    user: dict = Depends(require_role("admin")),
):
    """Delete all bins for a zone and remove it from zones_meta entirely."""
    # Safety: check for live stock
    occupied = await db.locations.count_documents({"zone": zone_code, "occupied": {"$gt": 0}})
    if occupied > 0:
        raise HTTPException(
            409,
            f"Zone {zone_code} still has {occupied} occupied slot(s). Clear stock before deleting.",
        )
    deleted = await db.locations.delete_many({"zone": zone_code})
    await db.zones_meta.delete_one({"zone": zone_code})
    return {"ok": True, "bins_deleted": deleted.deleted_count}


# ---------- FEFO ----------
@api.get("/inventory/skus/{sku_id}/pallets")
async def sku_pallets(sku_id: str, user: dict = Depends(get_user)):
    """Return all pallets of a SKU sorted by expiry date ascending (FEFO)."""
    rows = await db.stock.find({"sku_id": sku_id, "qty": {"$gt": 0}}, {"_id": 0}).to_list(500)
    out = []
    for r in rows:
        loc = await db.locations.find_one({"id": r["location_id"]}, {"_id": 0, "code": 1, "zone": 1})
        out.append({
            "location": loc,
            "qty": r["qty"],
            "batch_no": r.get("batch_no"),
            "expiry_date": r.get("expiry_date"),
            "manufacture_date": r.get("manufacture_date"),
            "received_date": r.get("received_date"),
        })
    # FEFO sort: items without expiry go last
    out.sort(key=lambda x: (x.get("expiry_date") is None, x.get("expiry_date") or "9999-99-99"))
    return out


# ---------- Print views (GRN + Pick List) ----------
@api.get("/inbound/{order_id}/grn")
async def inbound_grn(order_id: str, user: dict = Depends(get_user)):
    order = await db.inbound.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Not found")
    enriched = []
    for it in order["items"]:
        sku = await db.skus.find_one({"id": it["sku_id"]}, {"_id": 0, "sku_code": 1, "name": 1, "unit": 1})
        loc = await db.locations.find_one({"id": it["location_id"]}, {"_id": 0, "code": 1})
        enriched.append({**it, "sku": sku, "location": loc})
    order["items"] = enriched
    return order


@api.get("/outbound/{order_id}/picklist")
async def outbound_picklist(order_id: str, user: dict = Depends(get_user)):
    order = await db.outbound.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Not found")
    enriched = []
    for it in order["items"]:
        sku = await db.skus.find_one({"id": it["sku_id"]}, {"_id": 0, "sku_code": 1, "name": 1, "unit": 1})
        # Suggest FEFO pallets to pick
        pallets = await db.stock.find({"sku_id": it["sku_id"], "qty": {"$gt": 0}}, {"_id": 0}).to_list(50)
        pallets.sort(key=lambda x: (x.get("expiry_date") is None, x.get("expiry_date") or "9999"))
        pick_locations = []
        remaining = it["qty"]
        for p in pallets:
            if remaining <= 0:
                break
            loc = await db.locations.find_one({"id": p["location_id"]}, {"_id": 0, "code": 1})
            take = min(p["qty"], remaining)
            pick_locations.append({
                "location": loc,
                "qty": take,
                "batch_no": p.get("batch_no"),
                "expiry_date": p.get("expiry_date"),
            })
            remaining -= take
        enriched.append({**it, "sku": sku, "pick_locations": pick_locations})
    order["items"] = enriched
    return order


@api.get("/storage/lanes")
async def lanes(zone: Optional[str] = None, user: dict = Depends(get_user)):
    """Return racks/lanes for drive-in style visualization."""
    flt = {"zone": zone} if zone else {}
    locs = await db.locations.find(flt, {"_id": 0}).to_list(5000)
    lanes_map: dict = {}
    for l in locs:
        key = (l.get("row_label", "?"), l.get("lane_number", 0))
        lane = lanes_map.setdefault(key, {
            "row": l.get("row_label", "?"),
            "lane_number": l.get("lane_number", 0),
            "rack_type": l.get("rack_type"),
            "levels": l.get("levels", 4),
            "depth": l.get("depth", 0),
            "weight_capacity_kg": l.get("weight_capacity_kg", 0),
            "sku_assignment": l.get("sku_assignment"),
            "bins": [],
        })
        lane["bins"].append({
            "id": l["id"],
            "code": l["code"],
            "level": l.get("level"),
            "position": l.get("position"),
            "occupied": l.get("occupied", 0),
            "capacity": l.get("capacity", 1),
        })
    out = []
    for lane in lanes_map.values():
        lane["bins"].sort(key=lambda b: (b.get("level", 0), b.get("position", 0)))
        lane["total_slots"] = len(lane["bins"])
        lane["filled_slots"] = sum(1 for b in lane["bins"] if b["occupied"] > 0)
        out.append(lane)
    out.sort(key=lambda x: (x["row"], x["lane_number"]))
    return out


@api.get("/storage/flow-lanes")
async def flow_lanes_summary(user: dict = Depends(get_user)):
    """Return all flow_rack lanes across all zones with SKU assignment and fill depth."""
    locs = await db.locations.find({"rack_type": "flow_rack"}, {"_id": 0}).to_list(5000)
    lanes_map: dict = {}
    for l in locs:
        key = (l.get("zone"), l.get("row_label", "?"), l.get("lane_number", 0))
        lane = lanes_map.setdefault(key, {
            "zone": l.get("zone"),
            "zone_name": l.get("zone_name", l.get("zone")),
            "row": l.get("row_label", "?"),
            "lane_number": l.get("lane_number", 0),
            "depth": l.get("depth", 0),
            "levels": l.get("levels", 1),
            "weight_capacity_kg": l.get("weight_capacity_kg", 0),
            "sku_assignment": l.get("sku_assignment"),
            "total_slots": 0,
            "filled_slots": 0,
        })
        lane["total_slots"] += 1
        if l.get("occupied", 0) > 0:
            lane["filled_slots"] += 1
    out = list(lanes_map.values())
    for lane in out:
        if lane.get("sku_assignment"):
            sku = await db.skus.find_one(
                {"id": lane["sku_assignment"]},
                {"_id": 0, "sku_code": 1, "name": 1, "unit": 1},
            )
            lane["sku"] = sku
        else:
            lane["sku"] = None
    out.sort(key=lambda x: (x["zone"], x["row"], x["lane_number"]))
    return out


@api.patch("/storage/lanes/{zone}/{row}/{lane_number}/assign-sku")
async def assign_flow_lane_sku(
    zone: str,
    row: str,
    lane_number: int,
    body: FlowLaneAssignIn,
    user: dict = Depends(require_role("admin", "manager")),
):
    """Assign or clear the dedicated SKU for a flow rack lane."""
    result = await db.locations.update_many(
        {"zone": zone, "row_label": row, "lane_number": lane_number, "rack_type": "flow_rack"},
        {"$set": {"sku_assignment": body.sku_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Flow rack lane not found")
    return {"ok": True, "updated": result.modified_count}


# ════════════════════════════════════════════════════
# SHUTTLE FIFO DEEP LANE — SHUTTLE_ZONE_A only
# All other zones are completely unaffected.
# ════════════════════════════════════════════════════

SHUTTLE_ZONE = "SHUTTLE_ZONE_A"

class ShuttleInboundIn(BaseModel):
    lane_no: int          # 1-7
    level_no: int         # 0-4
    sku_id: str
    batch_no: Optional[str] = None
    manufacture_date: Optional[str] = None
    expiry_date: Optional[str] = None
    pallet_code: Optional[str] = None

class ShuttleOutboundIn(BaseModel):
    lane_no: int
    level_no: int
    ref: Optional[str] = None


def _shuttle_code(lane: int, level: int, depth: int) -> str:
    return f"SZA-{lane:02d}-L{level:02d}-D{depth:02d}"


async def _shuttle_bin(lane: int, level: int, depth: int):
    return await db.locations.find_one(
        {"zone": SHUTTLE_ZONE, "lane_number": lane, "level": level, "position": depth},
        {"_id": 0},
    )


@api.get("/shuttle/summary")
async def shuttle_summary(user: dict = Depends(get_user)):
    """Zone-level capacity and occupancy for SHUTTLE_ZONE_A."""
    total = await db.locations.count_documents({"zone": SHUTTLE_ZONE})
    occupied = await db.locations.count_documents({"zone": SHUTTLE_ZONE, "occupied": {"$gt": 0}})
    return {
        "zone": SHUTTLE_ZONE,
        "zone_name": "Shuttle FIFO — Cold Storage",
        "total_bins": total,
        "occupied_bins": occupied,
        "empty_bins": total - occupied,
        "utilization_pct": round(occupied / total * 100, 1) if total else 0,
        "lanes": 7,
        "levels": 5,
        "depth": 50,
    }


@api.get("/shuttle/lanes")
async def shuttle_lanes(user: dict = Depends(get_user)):
    """Return occupancy summary for every lane×level combination (35 combinations)."""
    locs = await db.locations.find({"zone": SHUTTLE_ZONE}, {"_id": 0}).to_list(2000)
    lane_map: dict = {}
    for l in locs:
        key = (l["lane_number"], l["level"])
        entry = lane_map.setdefault(key, {
            "lane_no": l["lane_number"],
            "level_no": l["level"],
            "total": 0,
            "occupied": 0,
            "last_inbound_depth": 0,
        })
        entry["total"] += 1
        if l.get("occupied", 0) > 0:
            entry["occupied"] += 1
            if l["position"] > entry["last_inbound_depth"]:
                entry["last_inbound_depth"] = l["position"]
    out = sorted(lane_map.values(), key=lambda x: (x["lane_no"], x["level_no"]))
    for e in out:
        e["empty"] = e["total"] - e["occupied"]
        e["utilization_pct"] = round(e["occupied"] / e["total"] * 100, 1) if e["total"] else 0
    return out


@api.get("/shuttle/lanes/{lane_no}/{level_no}")
async def shuttle_lane_detail(lane_no: int, level_no: int, user: dict = Depends(get_user)):
    """Return all 50 depth positions with pallet contents for a specific lane×level."""
    locs = await db.locations.find(
        {"zone": SHUTTLE_ZONE, "lane_number": lane_no, "level": level_no},
        {"_id": 0},
    ).sort("position", 1).to_list(60)

    out = []
    for loc in locs:
        stock = None
        if loc.get("occupied", 0) > 0:
            s = await db.stock.find_one({"location_id": loc["id"], "qty": {"$gt": 0}}, {"_id": 0})
            if s:
                sku = await db.skus.find_one({"id": s["sku_id"]}, {"_id": 0, "sku_code": 1, "name": 1})
                stock = {
                    "sku_id": s["sku_id"],
                    "sku_code": sku["sku_code"] if sku else "?",
                    "sku_name": sku["name"] if sku else "?",
                    "batch_no": s.get("batch_no"),
                    "expiry_date": s.get("expiry_date"),
                    "manufacture_date": s.get("manufacture_date"),
                    "received_date": s.get("received_date"),
                    "pallet_code": s.get("pallet_code"),
                }
        out.append({
            "depth": loc["position"],
            "code": loc["code"],
            "bin_id": loc["id"],
            "occupied": loc.get("occupied", 0) > 0,
            "stock": stock,
        })
    return out


@api.post("/shuttle/inbound")
async def shuttle_inbound(body: ShuttleInboundIn, user: dict = Depends(require_role("admin", "manager", "operator"))):
    """Place a pallet at the deepest available depth position (smart inbound)."""
    # Find deepest occupied position to determine next available
    locs = await db.locations.find(
        {"zone": SHUTTLE_ZONE, "lane_number": body.lane_no, "level": body.level_no},
        {"_id": 0},
    ).sort("position", 1).to_list(60)

    if not locs:
        raise HTTPException(404, f"Lane {body.lane_no} Level {body.level_no} not found in SHUTTLE_ZONE_A")

    # Find deepest occupied, next slot = deepest+1
    occupied_positions = [l["position"] for l in locs if l.get("occupied", 0) > 0]
    if len(occupied_positions) >= 50:
        raise HTTPException(409, f"Lane {body.lane_no} Level {body.level_no} is fully occupied (50/50). No space available.")

    next_depth = (max(occupied_positions) + 1) if occupied_positions else 1

    # Validate no gap (continuity rule)
    target_bin = next(l for l in locs if l["position"] == next_depth)

    # Insert stock record
    now = datetime.now(timezone.utc).isoformat()
    stock_doc = {
        "id": str(uuid.uuid4()),
        "sku_id": body.sku_id,
        "location_id": target_bin["id"],
        "qty": 1,
        "batch_no": body.batch_no,
        "manufacture_date": body.manufacture_date,
        "expiry_date": body.expiry_date,
        "received_date": now,
        "pallet_code": body.pallet_code or f"PLT-SZA-{body.lane_no:02d}{body.level_no:02d}{next_depth:02d}",
    }
    await db.stock.insert_one(stock_doc)
    await db.locations.update_one({"id": target_bin["id"]}, {"$inc": {"occupied": 1}})

    # Log movement
    sku = await db.skus.find_one({"id": body.sku_id}, {"_id": 0, "sku_code": 1})
    await db.shuttle_movements.insert_one({
        "id": str(uuid.uuid4()),
        "lane_no": body.lane_no,
        "level_no": body.level_no,
        "from_depth": None,
        "to_depth": next_depth,
        "pallet_code": stock_doc["pallet_code"],
        "sku_code": sku["sku_code"] if sku else "?",
        "movement_type": "inbound",
        "timestamp": now,
    })

    return {
        "ok": True,
        "lane_no": body.lane_no,
        "level_no": body.level_no,
        "placed_at_depth": next_depth,
        "bin_code": target_bin["code"],
        "pallet_code": stock_doc["pallet_code"],
    }


@api.post("/shuttle/outbound")
async def shuttle_outbound(body: ShuttleOutboundIn, user: dict = Depends(require_role("admin", "manager", "operator"))):
    """
    Dispatch the front pallet (D01) and shift all remaining pallets forward.
    D02→D01, D03→D02, … last_occupied→(last_occupied-1), last_slot→EMPTY.
    FIFO is enforced: cannot dispatch if D01 is empty.
    """
    locs = await db.locations.find(
        {"zone": SHUTTLE_ZONE, "lane_number": body.lane_no, "level": body.level_no},
        {"_id": 0},
    ).sort("position", 1).to_list(60)

    if not locs:
        raise HTTPException(404, f"Lane {body.lane_no} Level {body.level_no} not found")

    loc_by_depth = {l["position"]: l for l in locs}

    # Validate D01 is occupied (FIFO enforcement)
    d01 = loc_by_depth.get(1)
    if not d01 or d01.get("occupied", 0) == 0:
        raise HTTPException(409, "D01 is empty — no pallet to dispatch. FIFO requires picking from D01.")

    # Capture D01 pallet info before dispatch
    d01_stock = await db.stock.find_one({"location_id": d01["id"], "qty": {"$gt": 0}}, {"_id": 0})
    if not d01_stock:
        raise HTTPException(500, "D01 shows occupied but stock record missing — data inconsistency")

    sku = await db.skus.find_one({"id": d01_stock["sku_id"]}, {"_id": 0, "sku_code": 1, "name": 1})
    dispatched = {
        "pallet_code": d01_stock.get("pallet_code"),
        "sku_code": sku["sku_code"] if sku else "?",
        "sku_name": sku["name"] if sku else "?",
        "batch_no": d01_stock.get("batch_no"),
        "expiry_date": d01_stock.get("expiry_date"),
        "received_date": d01_stock.get("received_date"),
        "bin_code": d01["code"],
    }

    # Remove D01 stock record
    await db.stock.delete_one({"location_id": d01["id"], "qty": {"$gt": 0}})
    await db.locations.update_one({"id": d01["id"]}, {"$set": {"occupied": 0}})

    now = datetime.now(timezone.utc).isoformat()
    ref = body.ref or f"SO-SHUTTLE-{body.lane_no:02d}"

    # Log dispatch movement
    await db.shuttle_movements.insert_one({
        "id": str(uuid.uuid4()),
        "lane_no": body.lane_no,
        "level_no": body.level_no,
        "from_depth": 1,
        "to_depth": None,
        "pallet_code": dispatched["pallet_code"],
        "sku_code": dispatched["sku_code"],
        "movement_type": "outbound",
        "ref": ref,
        "timestamp": now,
    })

    # Shuttle shift: move D2→D1, D3→D2, … until last occupied
    occupied_depths = sorted([l["position"] for l in locs if l.get("occupied", 0) > 0])
    # D01 was just cleared, shift from D02 upward
    shifts = 0
    for depth in range(2, 51):
        src = loc_by_depth.get(depth)
        if not src or src.get("occupied", 0) == 0:
            break  # reached empty — no more to shift
        dst = loc_by_depth.get(depth - 1)

        # Move stock record location_id from src → dst
        await db.stock.update_one(
            {"location_id": src["id"], "qty": {"$gt": 0}},
            {"$set": {"location_id": dst["id"]}},
        )
        await db.locations.update_one({"id": dst["id"]}, {"$set": {"occupied": 1}})
        await db.locations.update_one({"id": src["id"]}, {"$set": {"occupied": 0}})

        # Log each shift
        await db.shuttle_movements.insert_one({
            "id": str(uuid.uuid4()),
            "lane_no": body.lane_no,
            "level_no": body.level_no,
            "from_depth": depth,
            "to_depth": depth - 1,
            "pallet_code": None,
            "sku_code": dispatched["sku_code"],
            "movement_type": "shift",
            "ref": ref,
            "timestamp": now,
        })
        shifts += 1

    # Update SKU total_stock
    await db.skus.update_one({"id": d01_stock["sku_id"]}, {"$inc": {"total_stock": -1}})

    return {
        "ok": True,
        "dispatched": dispatched,
        "pallets_shifted": shifts,
        "lane_no": body.lane_no,
        "level_no": body.level_no,
    }


@api.get("/shuttle/movements")
async def shuttle_movement_history(
    lane_no: Optional[int] = None,
    limit: int = 100,
    user: dict = Depends(get_user),
):
    """Return recent shuttle movement history (inbound / outbound / shift)."""
    flt: dict = {"movement_type": {"$ne": "shift"}}  # exclude auto-shifts by default for cleaner log
    if lane_no:
        flt["lane_no"] = lane_no
    docs = await db.shuttle_movements.find(flt, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return docs


# ---------- Inbound ----------
@api.get("/inbound")
async def list_inbound(status: Optional[str] = None, user: dict = Depends(get_user)):
    flt = {"status": status} if status else {}
    return await db.inbound.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/inbound")
async def create_inbound(body: InboundIn, user: dict = Depends(require_role("admin", "manager"))):
    items = []
    for idx, item in enumerate(body.items):
        item_dict = item.model_dump()
        if not item_dict.get("barcode"):
            safe_po = body.po_number.replace(" ", "-").upper()
            item_dict["barcode"] = f"PLT-{safe_po}-P{idx + 1:02d}"
        item_dict["putaway_confirmed"] = False
        item_dict["confirmed_at"] = None
        items.append(item_dict)

    doc = {
        "id": str(uuid.uuid4()),
        "po_number": body.po_number,
        "supplier": body.supplier,
        "expected_date": body.expected_date,
        "items": items,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["name"],
    }
    await db.inbound.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _execute_receive(order: dict) -> None:
    """Shared logic: post stock, movements, and mark order completed."""
    received_at = datetime.now(timezone.utc).isoformat()
    for item in order["items"]:
        await db.stock.update_one(
            {"sku_id": item["sku_id"], "location_id": item["location_id"]},
            {"$inc": {"qty": item["qty"]},
             "$set": {
                 "batch_no": item.get("batch_no"),
                 "manufacture_date": item.get("manufacture_date"),
                 "expiry_date": item.get("expiry_date"),
                 "received_date": received_at,
                 "ref": order["po_number"],
             }},
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
            "batch_no": item.get("batch_no"),
            "expiry_date": item.get("expiry_date"),
            "timestamp": received_at,
        })
    await db.inbound.update_one(
        {"id": order["id"]},
        {"$set": {"status": "completed", "completed_at": received_at}},
    )


@api.post("/inbound/{order_id}/receive")
async def receive_inbound(order_id: str, user: dict = Depends(require_role("admin", "manager", "operator"))):
    order = await db.inbound.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Inbound order not found")
    if order["status"] == "completed":
        raise HTTPException(400, "Already completed")
    await _execute_receive(order)
    return {"ok": True}


@api.post("/inbound/{order_id}/putaway-scan")
async def putaway_scan(order_id: str, body: PutawayScanIn, user: dict = Depends(require_role("admin", "manager", "operator"))):
    """Scan a pallet barcode to confirm putaway. Auto-receives order when all pallets are confirmed."""
    order = await db.inbound.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Inbound order not found")
    if order["status"] == "completed":
        raise HTTPException(400, "Order already completed")

    items = order["items"]
    matched_idx = next(
        (i for i, it in enumerate(items) if it.get("barcode") == body.barcode.strip()),
        None,
    )
    if matched_idx is None:
        raise HTTPException(404, f"Barcode '{body.barcode}' not found in this order")
    if items[matched_idx].get("putaway_confirmed"):
        raise HTTPException(400, "Pallet already confirmed")

    confirmed_at = datetime.now(timezone.utc).isoformat()
    items[matched_idx]["putaway_confirmed"] = True
    items[matched_idx]["confirmed_at"] = confirmed_at
    items[matched_idx]["confirmed_by"] = user["name"]

    await db.inbound.update_one({"id": order_id}, {"$set": {"items": items}})

    all_confirmed = all(it.get("putaway_confirmed") for it in items)
    if all_confirmed:
        order["items"] = items
        await _execute_receive(order)

    return {
        "ok": True,
        "barcode": body.barcode,
        "item_index": matched_idx,
        "all_confirmed": all_confirmed,
    }


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
                "You are a senior cold-chain warehouse operations analyst overseeing a -20°C drive-in racking facility (LIFO). "
                "Analyze the snapshot and produce a sharp, tactical report with: 1) a 2-line executive summary, "
                "2) 3 prioritized actionable insights (with bullet markers '>'), 3) a brief risk assessment "
                "(call out cold-chain compliance, perishability, FIFO violations from LIFO storage). "
                "Use crisp, technical language. Format output as plain text with section headers in CAPS. Keep total under 220 words."
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        msg = UserMessage(text=context)
        response = await chat.send_message(msg)
        return {"insights": response, "generated_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        logging.exception("AI insights failed")
        return {"insights": f"AI service unavailable: {str(e)}", "generated_at": datetime.now(timezone.utc).isoformat()}


SCHEMA_VERSION = 4  # bump to trigger re-seed


# Drive-in rack types per blueprint
RACK_TYPES = {
    "A": {"depth": 4, "levels": 4, "weight_kg": 8000, "lanes": 13},
    "B": {"depth": 3, "levels": 4, "weight_kg": 12000, "lanes": 11},
    "C": {"depth": 5, "levels": 4, "weight_kg": 20000, "lanes": 15},
}

PLACEHOLDER_ZONES = [
    {"zone": "COLD-2", "name": "Cold Storage 2", "temperature": -18, "placeholder": True},
    {"zone": "COLD-3", "name": "Cold Storage 3", "temperature": -22, "placeholder": True},
    {"zone": "AMBIENT", "name": "Ambient Warehouse", "temperature": 22, "placeholder": True},
]


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

    # Schema migration: wipe inventory tables on version bump
    meta = await db.app_meta.find_one({"_id": "schema"})
    current_version = (meta or {}).get("version", 0)
    if current_version < SCHEMA_VERSION:
        await db.locations.delete_many({})
        await db.skus.delete_many({})
        await db.stock.delete_many({})
        await db.movements.delete_many({})
        await db.inbound.delete_many({})
        await db.outbound.delete_many({})
        await db.zones_meta.delete_many({})
        await db.app_meta.update_one(
            {"_id": "schema"}, {"$set": {"version": SCHEMA_VERSION}}, upsert=True
        )

    # Placeholder zones (no bins, just metadata)
    if await db.zones_meta.count_documents({}) == 0:
        await db.zones_meta.insert_many(PLACEHOLDER_ZONES)

    # COLD-1 locations from blueprint
    if await db.locations.count_documents({}) == 0:
        locs = []
        # Lane numbering 26..64 split across rows A, B, C
        # Row A → Type A (lanes 26-38, 13 lanes)
        # Row B → Type B (lanes 39-49, 11 lanes)
        # Row C → Type C (lanes 50-64, 15 lanes)
        plan = [
            ("A", "A", list(range(26, 39))),  # 13 lanes
            ("B", "B", list(range(39, 50))),  # 11 lanes
            ("C", "C", list(range(50, 65))),  # 15 lanes
        ]
        for row_label, rack_type, lane_numbers in plan:
            cfg = RACK_TYPES[rack_type]
            depth = cfg["depth"]
            levels = cfg["levels"]
            weight_kg = cfg["weight_kg"]
            for lane_num in lane_numbers:
                for level in range(1, levels + 1):
                    for pos in range(1, depth + 1):
                        locs.append({
                            "id": str(uuid.uuid4()),
                            "code": f"COLD1-{row_label}-L{lane_num:02d}-LV{level}-P{pos:02d}",
                            "zone": "COLD-1",
                            "zone_name": "Cold Storage 1",
                            "temperature": -20,
                            "row_label": row_label,
                            "rack_type": rack_type,
                            "lane_number": lane_num,
                            "level": level,
                            "position": pos,
                            "depth": depth,
                            "levels": levels,
                            "weight_capacity_kg": weight_kg,
                            "capacity": 1,  # 1 pallet per slot
                            "occupied": 0,
                        })
        await db.locations.insert_many(locs)

    # Cold-storage SKUs (frozen products)
    if await db.skus.count_documents({}) == 0:
        catalog = [
            ("FRZ-MEAT-001", "Frozen Beef Sirloin 20kg", "Frozen Meat", "PLT", 480.00, 4),
            ("FRZ-MEAT-002", "Frozen Chicken Breast 25kg", "Frozen Meat", "PLT", 320.00, 5),
            ("FRZ-MEAT-003", "Frozen Pork Loin 22kg", "Frozen Meat", "PLT", 380.00, 4),
            ("FRZ-MEAT-004", "Frozen Lamb Chops 18kg", "Frozen Meat", "PLT", 540.00, 3),
            ("FRZ-SEAF-001", "Frozen Atlantic Salmon 20kg", "Seafood", "PLT", 720.00, 3),
            ("FRZ-SEAF-002", "Frozen Tiger Prawns 15kg", "Seafood", "PLT", 850.00, 2),
            ("FRZ-SEAF-003", "Frozen Tuna Steaks 18kg", "Seafood", "PLT", 920.00, 3),
            ("FRZ-DAIRY-001", "Frozen Butter Blocks 25kg", "Dairy", "PLT", 220.00, 6),
            ("FRZ-DAIRY-002", "Vanilla Ice Cream Tubs 20L", "Ice Cream", "PLT", 180.00, 8),
            ("FRZ-DAIRY-003", "Chocolate Ice Cream Tubs 20L", "Ice Cream", "PLT", 195.00, 6),
            ("FRZ-DAIRY-004", "Strawberry Ice Cream 20L", "Ice Cream", "PLT", 200.00, 5),
            ("FRZ-VEG-001", "Frozen Mixed Vegetables 15kg", "Vegetables", "PLT", 120.00, 8),
            ("FRZ-VEG-002", "Frozen Sweet Corn 15kg", "Vegetables", "PLT", 95.00, 10),
            ("FRZ-VEG-003", "Frozen Spinach Blocks 12kg", "Vegetables", "PLT", 110.00, 6),
            ("FRZ-VEG-004", "Frozen Green Peas 15kg", "Vegetables", "PLT", 105.00, 8),
            ("FRZ-FRUIT-001", "Frozen Strawberries 12kg", "Fruits", "PLT", 240.00, 5),
            ("FRZ-FRUIT-002", "Frozen Blueberries 10kg", "Fruits", "PLT", 290.00, 4),
            ("FRZ-FRUIT-003", "Frozen Mango Chunks 12kg", "Fruits", "PLT", 220.00, 5),
            ("FRZ-DOUGH-001", "Frozen Pizza Dough Balls", "Bakery", "PLT", 140.00, 6),
            ("FRZ-DOUGH-002", "Frozen Croissant Dough", "Bakery", "PLT", 165.00, 4),
            ("FRZ-READY-001", "Frozen Lasagna Trays", "Ready Meals", "PLT", 280.00, 5),
            ("FRZ-READY-002", "Frozen Chicken Curry Trays", "Ready Meals", "PLT", 260.00, 4),
            ("FRZ-PROC-001", "Frozen Chicken Nuggets 12kg", "Processed", "PLT", 175.00, 8),
            ("FRZ-PROC-002", "Frozen French Fries 15kg", "Processed", "PLT", 130.00, 12),
            ("FRZ-PROC-003", "Frozen Spring Rolls 10kg", "Processed", "PLT", 155.00, 6),
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

        # Distribute initial pallet stock across cold-1 lanes (LIFO from deepest)
        all_locs = await db.locations.find({"zone": "COLD-1"}, {"_id": 0}).to_list(5000)
        # group by lane, sort each lane LIFO (deepest first since drive-in)
        # We simulate ~55-65% utilization
        random.shuffle(all_locs)
        target_fill = int(len(all_locs) * 0.58)
        for i, sku in enumerate(skus):
            pallets = random.randint(8, 28)  # pallets per SKU
            placed = 0
            attempts = 0
            while placed < pallets and attempts < pallets * 2:
                if not all_locs:
                    break
                loc = all_locs.pop()
                if loc["occupied"] >= loc["capacity"]:
                    attempts += 1
                    continue
                await db.stock.insert_one({
                    "sku_id": sku["id"],
                    "location_id": loc["id"],
                    "qty": 1,
                    "batch_no": f"B{random.randint(1000,9999)}-{sku['sku_code'][-3:]}",
                    "manufacture_date": (datetime.now(timezone.utc) - timedelta(days=random.randint(30, 180))).date().isoformat(),
                    "expiry_date": (datetime.now(timezone.utc) + timedelta(days=random.randint(15, 365))).date().isoformat(),
                    "received_date": (datetime.now(timezone.utc) - timedelta(days=random.randint(1, 13))).isoformat(),
                })
                await db.locations.update_one({"id": loc["id"]}, {"$inc": {"occupied": 1}})
                ts = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 13), hours=random.randint(0, 23))
                await db.movements.insert_one({
                    "id": str(uuid.uuid4()),
                    "type": "in",
                    "sku_id": sku["id"],
                    "location_id": loc["id"],
                    "qty": 1,
                    "ref": f"PO-INIT-{random.randint(1000,9999)}",
                    "timestamp": ts.isoformat(),
                })
                placed += 1
                if sum(1 for l in await db.locations.find({"occupied": {"$gt": 0}}).to_list(5000)) >= target_fill:
                    break
            await db.skus.update_one({"id": sku["id"]}, {"$inc": {"total_stock": placed}})

        # historical outbound movements
        skus_db = await db.skus.find({}, {"_id": 0}).to_list(100)
        for _ in range(35):
            sku = random.choice(skus_db)
            stocks = await db.stock.find({"sku_id": sku["id"], "qty": {"$gt": 0}}, {"_id": 0}).to_list(50)
            if not stocks:
                continue
            s = random.choice(stocks)
            qty = 1  # one pallet per movement
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
        # only use unoccupied locations
        free_locs = await db.locations.find({"$expr": {"$lt": ["$occupied", "$capacity"]}}, {"_id": 0}).to_list(5000)
        suppliers = ["Arctic Foods Ltd", "FrostChain Suppliers", "PolarFresh Co", "Glacier Distributors", "IceVault Logistics"]
        for i in range(8):
            picks = random.sample(skus_db, k=random.randint(2, 4))
            items = []
            for s in picks:
                if not free_locs:
                    break
                qty = random.randint(2, 6)
                # need qty distinct locations
                for _ in range(qty):
                    if not free_locs:
                        break
                    loc = free_locs.pop()
                    items.append({"sku_id": s["id"], "qty": 1, "location_id": loc["id"]})
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
        customers = ["Metro Supermarkets", "FreshMart Chain", "ColdLink Retail", "OmegaFoods", "GroceryPro Inc"]
        statuses = ["pending", "picking", "packing", "shipped"]
        for i in range(10):
            picks = random.sample(skus_db, k=random.randint(2, 4))
            items = [{"sku_id": s["id"], "qty": random.randint(1, 4)} for s in picks]
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
