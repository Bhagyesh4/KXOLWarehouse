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
from fastapi import UploadFile, File, Form
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr

import db as _db

# ---------- App ----------
app = FastAPI(title="Warehouse Management System API")
api = APIRouter(prefix="/api")

JWT_ALGO = "HS256"
SHUTTLE_ZONE = "SHUTTLE_ZONE_A"
SCHEMA_VERSION = 5  # bump to wipe + re-seed


# ---------- Helpers ----------
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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _shuttle_code(lane: int, level: int, depth: int) -> str:
    return f"SZA-{lane:02d}-L{level:02d}-D{depth:02d}"


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "manager", "operator"] = "operator"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SkuIn(BaseModel):
    sku_code: str
    name: str
    category: str
    unit: str = "EA"
    unit_price: float = 0.0
    reorder_level: int = 10


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
    rows: List[dict]


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


class StorageLaneInboundIn(BaseModel):
    level: int
    sku_id: str
    batch_no: Optional[str] = None
    manufacture_date: Optional[str] = None
    expiry_date: Optional[str] = None
    pallet_code: Optional[str] = None


class StorageLaneOutboundIn(BaseModel):
    level: int
    ref: Optional[str] = None


class ShuttleInboundIn(BaseModel):
    lane_no: int
    level_no: int
    sku_id: str
    batch_no: Optional[str] = None
    manufacture_date: Optional[str] = None
    expiry_date: Optional[str] = None
    pallet_code: Optional[str] = None


class ShuttleOutboundIn(BaseModel):
    lane_no: int
    level_no: int
    ref: Optional[str] = None


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
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, name, role FROM users WHERE id = $1",
            payload["sub"],
        )
    if not row:
        raise HTTPException(401, "User not found")
    return dict(row)


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


# ─── inbound / outbound assembly helpers ─────────────────────────────────────

async def _assemble_inbound(conn, row) -> dict:
    order = dict(row)
    items = await conn.fetch(
        "SELECT * FROM inbound_items WHERE inbound_id = $1 ORDER BY id", order["id"]
    )
    order["items"] = [dict(it) for it in items]
    return order


async def _assemble_outbound(conn, row) -> dict:
    order = dict(row)
    items = await conn.fetch(
        "SELECT * FROM outbound_items WHERE outbound_id = $1", order["id"]
    )
    order["items"] = [dict(it) for it in items]
    return order


# ---------- Auth Routes ----------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if existing:
            raise HTTPException(400, "Email already registered")
        uid = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
            uid, email, body.name, body.role, hash_pw(body.password), now_iso(),
        )
    token = create_token(uid, email)
    set_auth_cookie(response, token)
    return {"id": uid, "email": email, "name": body.name, "role": body.role, "token": token}


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
    if not row or not verify_pw(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(row["id"], email)
    set_auth_cookie(response, token)
    return {"id": row["id"], "email": email, "name": row["name"], "role": row["role"], "token": token}


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
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        if q and category:
            rows = await conn.fetch(
                "SELECT * FROM skus WHERE category = $1 AND (sku_code ILIKE $2 OR name ILIKE $2) ORDER BY sku_code",
                category, f"%{q}%",
            )
        elif q:
            rows = await conn.fetch(
                "SELECT * FROM skus WHERE sku_code ILIKE $1 OR name ILIKE $1 ORDER BY sku_code",
                f"%{q}%",
            )
        elif category:
            rows = await conn.fetch("SELECT * FROM skus WHERE category = $1 ORDER BY sku_code", category)
        else:
            rows = await conn.fetch("SELECT * FROM skus ORDER BY sku_code")
    return _db.rl(rows)


@api.post("/inventory/skus")
async def create_sku(body: SkuIn, user: dict = Depends(require_role("admin", "manager"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM skus WHERE sku_code = $1", body.sku_code)
        if existing:
            raise HTTPException(400, "SKU already exists")
        sid = str(uuid.uuid4())
        ts = now_iso()
        await conn.execute(
            "INSERT INTO skus (id, sku_code, name, category, unit, unit_price, reorder_level, total_stock, created_at) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            sid, body.sku_code, body.name, body.category, body.unit,
            body.unit_price, body.reorder_level, 0, ts,
        )
    return {**body.model_dump(), "id": sid, "total_stock": 0, "created_at": ts}


@api.put("/inventory/skus/{sku_id}")
async def update_sku(sku_id: str, body: SkuIn, user: dict = Depends(require_role("admin", "manager"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        res = await conn.execute(
            "UPDATE skus SET sku_code=$1, name=$2, category=$3, unit=$4, unit_price=$5, reorder_level=$6 WHERE id=$7",
            body.sku_code, body.name, body.category, body.unit,
            body.unit_price, body.reorder_level, sku_id,
        )
        if res == "UPDATE 0":
            raise HTTPException(404, "SKU not found")
        row = await conn.fetchrow("SELECT * FROM skus WHERE id = $1", sku_id)
    return dict(row)


@api.delete("/inventory/skus/{sku_id}")
async def delete_sku(sku_id: str, user: dict = Depends(require_role("admin"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM stock WHERE sku_id = $1", sku_id)
        await conn.execute("DELETE FROM skus WHERE id = $1", sku_id)
    return {"ok": True}


@api.get("/inventory/categories")
async def categories(user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT DISTINCT category FROM skus ORDER BY category")
    return [r["category"] for r in rows]


@api.get("/inventory/skus/{sku_id}/stock")
async def sku_stock(sku_id: str, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT s.qty, l.* FROM stock s JOIN locations l ON l.id = s.location_id "
            "WHERE s.sku_id = $1 AND s.qty > 0",
            sku_id,
        )
    out = []
    for r in rows:
        d = dict(r)
        out.append({"location": {k: d[k] for k in d if k != "qty"}, "qty": d["qty"]})
    return out


@api.get("/inventory/skus/{sku_id}/pallets")
async def sku_pallets(sku_id: str, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT s.qty, s.batch_no, s.expiry_date, s.manufacture_date, s.received_date, "
            "l.id AS loc_id, l.code AS loc_code, l.zone "
            "FROM stock s JOIN locations l ON l.id = s.location_id "
            "WHERE s.sku_id = $1 AND s.qty > 0",
            sku_id,
        )
    out = [
        {
            "location": {"id": r["loc_id"], "code": r["loc_code"], "zone": r["zone"]},
            "qty": r["qty"],
            "batch_no": r["batch_no"],
            "expiry_date": r["expiry_date"],
            "manufacture_date": r["manufacture_date"],
            "received_date": r["received_date"],
        }
        for r in rows
    ]
    out.sort(key=lambda x: (x.get("expiry_date") is None, x.get("expiry_date") or "9999-99-99"))
    return out


# ---------- Storage / Locations ----------
@api.get("/storage/locations")
async def list_locations(zone: Optional[str] = None, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        if zone:
            rows = await conn.fetch(
                "SELECT * FROM locations WHERE zone = $1 ORDER BY zone, code", zone
            )
        else:
            rows = await conn.fetch("SELECT * FROM locations ORDER BY zone, code")
    return _db.rl(rows)


@api.get("/storage/zones")
async def zones(user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT zone, zone_name, temperature, "
            "SUM(capacity) AS capacity, SUM(occupied) AS occupied, COUNT(*) AS bins "
            "FROM locations GROUP BY zone, zone_name, temperature ORDER BY zone"
        )
        placeholders = await conn.fetch("SELECT * FROM zones_meta ORDER BY zone")
    out = []
    zone_set = set()
    for r in rows:
        out.append({
            "zone": r["zone"],
            "name": r["zone_name"] or r["zone"],
            "temperature": r["temperature"],
            "capacity": r["capacity"],
            "occupied": r["occupied"],
            "bins": r["bins"],
        })
        zone_set.add(r["zone"])
    for p in placeholders:
        if p["zone"] not in zone_set:
            out.append({
                "zone": p["zone"],
                "name": p["name"],
                "temperature": p["temperature"],
                "capacity": 0,
                "occupied": 0,
                "bins": 0,
                "placeholder": True,
            })
    return out


@api.get("/storage/lanes/{row}/{lane_number}/contents")
async def lane_contents(row: str, lane_number: int, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        bins = await conn.fetch(
            "SELECT * FROM locations WHERE row_label = $1 AND lane_number = $2 "
            "ORDER BY level, position",
            row, lane_number,
        )
        bin_ids = [b["id"] for b in bins]
        if not bin_ids:
            return []
        stock_rows = await conn.fetch(
            "SELECT s.*, sk.id AS sk_id, sk.sku_code, sk.name AS sk_name, sk.category "
            "FROM stock s JOIN skus sk ON sk.id = s.sku_id "
            "WHERE s.location_id = ANY($1::text[]) AND s.qty > 0",
            bin_ids,
        )
    stock_map = {}
    for s in stock_rows:
        stock_map[s["location_id"]] = {
            "sku": {"id": s["sk_id"], "sku_code": s["sku_code"], "name": s["sk_name"], "category": s["category"]},
            "qty": s["qty"],
            "batch_no": s["batch_no"],
            "manufacture_date": s["manufacture_date"],
            "expiry_date": s["expiry_date"],
            "received_date": s["received_date"],
            "pallet_code": s["pallet_code"],
        }
    return [{"bin": dict(b), "item": stock_map.get(b["id"])} for b in bins]


@api.get("/storage/bins/{bin_id}/pallet")
async def bin_pallet_detail(bin_id: str, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        loc = await conn.fetchrow("SELECT * FROM locations WHERE id = $1", bin_id)
        if not loc:
            raise HTTPException(404, "Bin not found")
        stock = await conn.fetchrow(
            "SELECT s.*, sk.id AS sk_id, sk.sku_code, sk.name AS sk_name, sk.category, sk.unit "
            "FROM stock s JOIN skus sk ON sk.id = s.sku_id "
            "WHERE s.location_id = $1 AND s.qty > 0",
            bin_id,
        )
    loc_d = dict(loc)
    item = None
    if stock:
        item = {
            "sku": {"id": stock["sk_id"], "sku_code": stock["sku_code"], "name": stock["sk_name"],
                    "category": stock["category"], "unit": stock["unit"]},
            "qty": stock["qty"],
            "batch_no": stock["batch_no"],
            "pallet_code": stock["pallet_code"],
            "manufacture_date": stock["manufacture_date"],
            "expiry_date": stock["expiry_date"],
            "received_date": stock["received_date"],
        }
    return {
        "bin": {k: loc_d[k] for k in ("id", "code", "level", "position", "zone", "row_label",
                                        "lane_number", "weight_capacity_kg", "rack_type")},
        "item": item,
    }


# ---------- Storage Lane Inbound / Outbound (drive-in racks) ----------
@api.post("/storage/lanes/{zone}/{row}/{lane_number}/inbound")
async def storage_lane_inbound(
    zone: str, row: str, lane_number: int,
    body: StorageLaneInboundIn,
    user: dict = Depends(require_role("admin", "manager", "operator")),
):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        bins = await conn.fetch(
            "SELECT * FROM locations WHERE zone=$1 AND row_label=$2 AND lane_number=$3 AND level=$4 ORDER BY position",
            zone, row, lane_number, body.level,
        )
        if not bins:
            raise HTTPException(404, f"Lane {row}-{lane_number} level {body.level} not found in zone {zone}")
        empty = [b for b in bins if b["occupied"] == 0]
        if not empty:
            raise HTTPException(409, f"Lane level {body.level} is fully occupied")
        target = max(empty, key=lambda b: b["position"])
        pallet_code = body.pallet_code or f"PLT-{zone}-{row}{lane_number:02d}L{body.level:02d}P{target['position']:02d}"
        ts = now_iso()
        await conn.execute(
            "INSERT INTO stock (id, sku_id, location_id, qty, batch_no, manufacture_date, expiry_date, received_date, pallet_code) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            str(uuid.uuid4()), body.sku_id, target["id"], 1,
            body.batch_no, body.manufacture_date, body.expiry_date, ts, pallet_code,
        )
        await conn.execute("UPDATE locations SET occupied = occupied + 1 WHERE id = $1", target["id"])
    return {
        "ok": True, "bin_code": target["code"],
        "placed_at_level": body.level, "placed_at_position": target["position"],
        "pallet_code": pallet_code,
    }


@api.post("/storage/lanes/{zone}/{row}/{lane_number}/outbound")
async def storage_lane_outbound(
    zone: str, row: str, lane_number: int,
    body: StorageLaneOutboundIn,
    user: dict = Depends(require_role("admin", "manager", "operator")),
):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        bins = await conn.fetch(
            "SELECT * FROM locations WHERE zone=$1 AND row_label=$2 AND lane_number=$3 AND level=$4 AND occupied > 0 "
            "ORDER BY position",
            zone, row, lane_number, body.level,
        )
        if not bins:
            raise HTTPException(409, f"No pallets in level {body.level} of lane {row}-{lane_number}")
        target = bins[0]
        stock = await conn.fetchrow(
            "SELECT s.*, sk.sku_code, sk.name AS sku_name FROM stock s JOIN skus sk ON sk.id = s.sku_id "
            "WHERE s.location_id = $1 AND s.qty > 0", target["id"]
        )
        if not stock:
            raise HTTPException(500, "Location shows occupied but no stock record")
        dispatched = {
            "pallet_code": stock["pallet_code"], "sku_code": stock["sku_code"],
            "sku_name": stock["sku_name"], "batch_no": stock["batch_no"],
            "expiry_date": stock["expiry_date"], "bin_code": target["code"],
            "level": body.level, "position": target["position"],
        }
        await conn.execute("DELETE FROM stock WHERE location_id = $1 AND qty > 0", target["id"])
        await conn.execute("UPDATE locations SET occupied = 0 WHERE id = $1", target["id"])
    return {"ok": True, "dispatched": dispatched}


# ---------- Blueprint / Zone Provision ----------
@api.post("/storage/parse-blueprint")
async def parse_blueprint(
    file: UploadFile = File(...),
    user: dict = Depends(require_role("admin", "manager")),
):
    import json as json_lib
    import fitz
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
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        config = json_lib.loads(cleaned.strip())
        return {"config": config, "raw_response": response}
    except Exception as e:
        return {
            "config": {"zone_name": "New Zone", "temperature": 22,
                       "rows": [{"row": "A", "rack_type": "A", "lanes": 5, "lane_start": 1, "levels": 4, "depth": 4, "weight_kg": 8000}]},
            "warning": f"AI parse failed, returning defaults: {str(e)[:200]}",
        }


@api.post("/storage/zones/{zone_code}/provision")
async def provision_zone(
    zone_code: str, body: ZoneProvisionIn,
    user: dict = Depends(require_role("admin", "manager")),
):
    if zone_code != body.zone_code:
        raise HTTPException(400, "Zone code mismatch")
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        cnt = await conn.fetchval("SELECT COUNT(*) FROM locations WHERE zone = $1", zone_code)
        if cnt > 0:
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
                        locs.append((
                            str(uuid.uuid4()),
                            f"{zone_code}-{row_label}-L{lane_num:02d}-LV{level}-P{pos:02d}",
                            zone_code, body.zone_name, body.temperature,
                            rack_type, row_label, lane_num, level, pos, depth, levels, weight_kg, 1, 0,
                        ))
        if locs:
            await conn.executemany(
                "INSERT INTO locations (id, code, zone, zone_name, temperature, rack_type, row_label, "
                "lane_number, level, position, depth, levels, weight_capacity_kg, capacity, occupied) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
                locs,
            )
        await conn.execute(
            "INSERT INTO zones_meta (zone, name, temperature, placeholder) VALUES ($1,$2,$3,$4) "
            "ON CONFLICT (zone) DO UPDATE SET name=$2, temperature=$3, placeholder=$4",
            zone_code, body.zone_name, body.temperature, False,
        )
    return {"ok": True, "bins_created": len(locs)}


@api.post("/storage/zones")
async def create_zone(body: ZoneCreateIn, user: dict = Depends(require_role("admin", "manager"))):
    code = body.zone_code.strip().upper()
    if not code:
        raise HTTPException(400, "Zone code required")
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT zone FROM zones_meta WHERE zone = $1", code)
        if existing:
            raise HTTPException(400, f"Zone {code} already exists")
        await conn.execute(
            "INSERT INTO zones_meta (zone, name, temperature, placeholder) VALUES ($1,$2,$3,$4)",
            code, body.zone_name.strip() or code, body.temperature, True,
        )
    return {"ok": True, "zone": code}


@api.put("/storage/zones/{zone_code}")
async def edit_zone(zone_code: str, body: ZoneEditIn, user: dict = Depends(require_role("admin", "manager"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        if body.temperature is not None:
            await conn.execute(
                "INSERT INTO zones_meta (zone, name, temperature, placeholder) VALUES ($1,$2,$3,FALSE) "
                "ON CONFLICT (zone) DO UPDATE SET name=$2, temperature=$3",
                zone_code, body.zone_name.strip(), body.temperature,
            )
            await conn.execute(
                "UPDATE locations SET zone_name=$1, temperature=$2 WHERE zone=$3",
                body.zone_name.strip(), body.temperature, zone_code,
            )
        else:
            await conn.execute(
                "INSERT INTO zones_meta (zone, name, placeholder) VALUES ($1,$2,FALSE) "
                "ON CONFLICT (zone) DO UPDATE SET name=$2",
                zone_code, body.zone_name.strip(),
            )
            await conn.execute(
                "UPDATE locations SET zone_name=$1 WHERE zone=$2",
                body.zone_name.strip(), zone_code,
            )
    return {"ok": True}


@api.delete("/storage/zones/{zone_code}")
async def delete_zone(zone_code: str, user: dict = Depends(require_role("admin"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        occupied = await conn.fetchval(
            "SELECT COUNT(*) FROM locations WHERE zone=$1 AND occupied > 0", zone_code
        )
        if occupied > 0:
            raise HTTPException(409, f"Zone {zone_code} still has {occupied} occupied slot(s). Clear stock before deleting.")
        deleted = await conn.fetchval("SELECT COUNT(*) FROM locations WHERE zone=$1", zone_code)
        await conn.execute("DELETE FROM locations WHERE zone=$1", zone_code)
        await conn.execute("DELETE FROM zones_meta WHERE zone=$1", zone_code)
    return {"ok": True, "bins_deleted": deleted}


# ---------- Storage Lanes ----------
@api.get("/storage/lanes")
async def lanes(zone: Optional[str] = None, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        if zone:
            locs = await conn.fetch("SELECT * FROM locations WHERE zone=$1", zone)
        else:
            locs = await conn.fetch("SELECT * FROM locations")
    lanes_map: dict = {}
    for l in locs:
        row_label = l["row_label"] or "?"
        lane_num = l["lane_number"] or 0
        key = (row_label, lane_num)
        lane = lanes_map.setdefault(key, {
            "row": row_label, "lane_number": lane_num,
            "rack_type": l["rack_type"], "levels": l["levels"] or 4,
            "depth": l["depth"] or 0, "weight_capacity_kg": l["weight_capacity_kg"] or 0,
            "sku_assignment": l["sku_assignment"], "bins": [],
        })
        lane["bins"].append({
            "id": l["id"], "code": l["code"], "level": l["level"],
            "position": l["position"], "occupied": l["occupied"], "capacity": l["capacity"],
        })
    out = []
    for lane in lanes_map.values():
        lane["bins"].sort(key=lambda b: (b.get("level") or 0, b.get("position") or 0))
        lane["total_slots"] = len(lane["bins"])
        lane["filled_slots"] = sum(1 for b in lane["bins"] if (b["occupied"] or 0) > 0)
        out.append(lane)
    out.sort(key=lambda x: (x["row"], x["lane_number"]))
    return out


@api.get("/storage/flow-lanes")
async def flow_lanes_summary(user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        locs = await conn.fetch("SELECT * FROM locations WHERE rack_type = 'flow_rack'")
    lanes_map: dict = {}
    for l in locs:
        key = (l["zone"], l["row_label"] or "?", l["lane_number"] or 0)
        lane = lanes_map.setdefault(key, {
            "zone": l["zone"], "zone_name": l["zone_name"] or l["zone"],
            "row": l["row_label"] or "?", "lane_number": l["lane_number"] or 0,
            "depth": l["depth"] or 0, "levels": l["levels"] or 1,
            "weight_capacity_kg": l["weight_capacity_kg"] or 0,
            "sku_assignment": l["sku_assignment"],
            "total_slots": 0, "filled_slots": 0,
        })
        lane["total_slots"] += 1
        if (l["occupied"] or 0) > 0:
            lane["filled_slots"] += 1
    pool2 = await _db.get_pool()
    out = list(lanes_map.values())
    for lane in out:
        if lane.get("sku_assignment"):
            async with pool2.acquire() as conn:
                sku = await conn.fetchrow(
                    "SELECT sku_code, name, unit FROM skus WHERE id=$1", lane["sku_assignment"]
                )
            lane["sku"] = dict(sku) if sku else None
        else:
            lane["sku"] = None
    out.sort(key=lambda x: (x["zone"], x["row"], x["lane_number"]))
    return out


@api.patch("/storage/lanes/{zone}/{row}/{lane_number}/assign-sku")
async def assign_flow_lane_sku(
    zone: str, row: str, lane_number: int,
    body: FlowLaneAssignIn,
    user: dict = Depends(require_role("admin", "manager")),
):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        res = await conn.execute(
            "UPDATE locations SET sku_assignment=$1 WHERE zone=$2 AND row_label=$3 AND lane_number=$4 AND rack_type='flow_rack'",
            body.sku_id, zone, row, lane_number,
        )
    if res == "UPDATE 0":
        raise HTTPException(404, "Flow rack lane not found")
    return {"ok": True}


# ════════════════════════════════════════════════════
# SHUTTLE FIFO DEEP LANE — SHUTTLE_ZONE_A
# ════════════════════════════════════════════════════

@api.get("/shuttle/summary")
async def shuttle_summary(user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM locations WHERE zone=$1", SHUTTLE_ZONE)
        occupied = await conn.fetchval(
            "SELECT COUNT(*) FROM locations WHERE zone=$1 AND occupied > 0", SHUTTLE_ZONE
        )
    return {
        "zone": SHUTTLE_ZONE, "zone_name": "Shuttle FIFO — Cold Storage",
        "total_bins": total, "occupied_bins": occupied,
        "empty_bins": total - occupied,
        "utilization_pct": round(occupied / total * 100, 1) if total else 0,
        "lanes": 7, "levels": 5, "depth": 50,
    }


@api.get("/shuttle/lanes")
async def shuttle_lanes(user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT lane_number, level, COUNT(*) AS total, SUM(CASE WHEN occupied>0 THEN 1 ELSE 0 END) AS occ, "
            "MAX(CASE WHEN occupied>0 THEN position ELSE 0 END) AS last_depth "
            "FROM locations WHERE zone=$1 GROUP BY lane_number, level ORDER BY lane_number, level",
            SHUTTLE_ZONE,
        )
    out = []
    for r in rows:
        total = r["total"]
        occ = r["occ"]
        out.append({
            "lane_no": r["lane_number"], "level_no": r["level"],
            "total": total, "occupied": occ, "empty": total - occ,
            "last_inbound_depth": r["last_depth"] or 0,
            "utilization_pct": round(occ / total * 100, 1) if total else 0,
        })
    return out


@api.get("/shuttle/lanes/{lane_no}/{level_no}")
async def shuttle_lane_detail(lane_no: int, level_no: int, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        locs = await conn.fetch(
            "SELECT l.*, s.id AS s_id, s.sku_id, s.batch_no, s.expiry_date, s.manufacture_date, "
            "s.received_date, s.pallet_code, sk.sku_code, sk.name AS sk_name "
            "FROM locations l "
            "LEFT JOIN stock s ON s.location_id = l.id AND s.qty > 0 "
            "LEFT JOIN skus sk ON sk.id = s.sku_id "
            "WHERE l.zone=$1 AND l.lane_number=$2 AND l.level=$3 ORDER BY l.position",
            SHUTTLE_ZONE, lane_no, level_no,
        )
    out = []
    for l in locs:
        stock = None
        if l["s_id"]:
            stock = {
                "sku_id": l["sku_id"], "sku_code": l["sku_code"] or "?",
                "sku_name": l["sk_name"] or "?", "batch_no": l["batch_no"],
                "expiry_date": l["expiry_date"], "manufacture_date": l["manufacture_date"],
                "received_date": l["received_date"], "pallet_code": l["pallet_code"],
            }
        out.append({
            "depth": l["position"], "code": l["code"],
            "bin_id": l["id"], "occupied": (l["occupied"] or 0) > 0, "stock": stock,
        })
    return out


@api.post("/shuttle/inbound")
async def shuttle_inbound(body: ShuttleInboundIn, user: dict = Depends(require_role("admin", "manager", "operator"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        locs = await conn.fetch(
            "SELECT * FROM locations WHERE zone=$1 AND lane_number=$2 AND level=$3 ORDER BY position",
            SHUTTLE_ZONE, body.lane_no, body.level_no,
        )
        if not locs:
            raise HTTPException(404, f"Lane {body.lane_no} Level {body.level_no} not found")
        occupied_positions = [l["position"] for l in locs if (l["occupied"] or 0) > 0]
        if len(occupied_positions) >= 50:
            raise HTTPException(409, "Lane is fully occupied (50/50)")
        next_depth = (max(occupied_positions) + 1) if occupied_positions else 1
        target_bin = next(l for l in locs if l["position"] == next_depth)
        ts = now_iso()
        pallet_code = body.pallet_code or f"PLT-SZA-{body.lane_no:02d}{body.level_no:02d}{next_depth:02d}"
        stock_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO stock (id, sku_id, location_id, qty, batch_no, manufacture_date, expiry_date, received_date, pallet_code) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            stock_id, body.sku_id, target_bin["id"], 1,
            body.batch_no, body.manufacture_date, body.expiry_date, ts, pallet_code,
        )
        await conn.execute("UPDATE locations SET occupied = occupied + 1 WHERE id=$1", target_bin["id"])
        sku = await conn.fetchrow("SELECT sku_code FROM skus WHERE id=$1", body.sku_id)
        await conn.execute(
            "INSERT INTO shuttle_movements (id, lane_no, level_no, from_depth, to_depth, pallet_code, sku_code, movement_type, timestamp) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            str(uuid.uuid4()), body.lane_no, body.level_no, None, next_depth,
            pallet_code, sku["sku_code"] if sku else "?", "inbound", ts,
        )
    return {
        "ok": True, "lane_no": body.lane_no, "level_no": body.level_no,
        "placed_at_depth": next_depth, "bin_code": target_bin["code"], "pallet_code": pallet_code,
    }


@api.post("/shuttle/outbound")
async def shuttle_outbound(body: ShuttleOutboundIn, user: dict = Depends(require_role("admin", "manager", "operator"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            locs = await conn.fetch(
                "SELECT * FROM locations WHERE zone=$1 AND lane_number=$2 AND level=$3 ORDER BY position FOR UPDATE",
                SHUTTLE_ZONE, body.lane_no, body.level_no,
            )
            if not locs:
                raise HTTPException(404, f"Lane {body.lane_no} Level {body.level_no} not found")
            loc_by_depth = {l["position"]: l for l in locs}
            d01 = loc_by_depth.get(1)
            if not d01 or (d01["occupied"] or 0) == 0:
                raise HTTPException(409, "D01 is empty — FIFO requires picking from D01")
            d01_stock = await conn.fetchrow(
                "SELECT s.*, sk.sku_code, sk.name AS sku_name FROM stock s JOIN skus sk ON sk.id = s.sku_id "
                "WHERE s.location_id=$1 AND s.qty > 0", d01["id"]
            )
            if not d01_stock:
                raise HTTPException(500, "D01 shows occupied but stock record missing")
            dispatched = {
                "pallet_code": d01_stock["pallet_code"], "sku_code": d01_stock["sku_code"],
                "sku_name": d01_stock["sku_name"], "batch_no": d01_stock["batch_no"],
                "expiry_date": d01_stock["expiry_date"], "received_date": d01_stock["received_date"],
                "bin_code": d01["code"],
            }
            await conn.execute("DELETE FROM stock WHERE location_id=$1 AND qty > 0", d01["id"])
            await conn.execute("UPDATE locations SET occupied=0 WHERE id=$1", d01["id"])
            ts = now_iso()
            ref = body.ref or f"SO-SHUTTLE-{body.lane_no:02d}"
            await conn.execute(
                "INSERT INTO shuttle_movements (id, lane_no, level_no, from_depth, to_depth, pallet_code, sku_code, movement_type, ref, timestamp) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                str(uuid.uuid4()), body.lane_no, body.level_no, 1, None,
                dispatched["pallet_code"], dispatched["sku_code"], "outbound", ref, ts,
            )
            # Shift: D2→D1, D3→D2, …
            shifts = 0
            for depth in range(2, 51):
                src = loc_by_depth.get(depth)
                if not src or (src["occupied"] or 0) == 0:
                    break
                dst = loc_by_depth.get(depth - 1)
                await conn.execute(
                    "UPDATE stock SET location_id=$1 WHERE location_id=$2 AND qty > 0",
                    dst["id"], src["id"],
                )
                await conn.execute("UPDATE locations SET occupied=1 WHERE id=$1", dst["id"])
                await conn.execute("UPDATE locations SET occupied=0 WHERE id=$1", src["id"])
                await conn.execute(
                    "INSERT INTO shuttle_movements (id, lane_no, level_no, from_depth, to_depth, sku_code, movement_type, ref, timestamp) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                    str(uuid.uuid4()), body.lane_no, body.level_no,
                    depth, depth - 1, dispatched["sku_code"], "shift", ref, ts,
                )
                shifts += 1
            await conn.execute(
                "UPDATE skus SET total_stock = total_stock - 1 WHERE id=$1", d01_stock["sku_id"]
            )
    return {
        "ok": True, "dispatched": dispatched,
        "pallets_shifted": shifts, "lane_no": body.lane_no, "level_no": body.level_no,
    }


@api.get("/shuttle/movements")
async def shuttle_movement_history(
    lane_no: Optional[int] = None,
    limit: int = 100,
    user: dict = Depends(get_user),
):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        if lane_no:
            rows = await conn.fetch(
                "SELECT * FROM shuttle_movements WHERE movement_type != 'shift' AND lane_no=$1 "
                "ORDER BY timestamp DESC LIMIT $2", lane_no, limit,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM shuttle_movements WHERE movement_type != 'shift' "
                "ORDER BY timestamp DESC LIMIT $1", limit,
            )
    return _db.rl(rows)


# ---------- Inbound ----------
@api.get("/inbound")
async def list_inbound(status: Optional[str] = None, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        if status:
            orders = await conn.fetch("SELECT * FROM inbound WHERE status=$1 ORDER BY created_at DESC", status)
        else:
            orders = await conn.fetch("SELECT * FROM inbound ORDER BY created_at DESC")
        if not orders:
            return []
        ids = [o["id"] for o in orders]
        items = await conn.fetch(
            "SELECT * FROM inbound_items WHERE inbound_id = ANY($1::text[])", ids
        )
    items_by_order: dict = {}
    for it in items:
        items_by_order.setdefault(it["inbound_id"], []).append(dict(it))
    result = []
    for o in orders:
        d = dict(o)
        d["items"] = items_by_order.get(d["id"], [])
        result.append(d)
    return result


@api.post("/inbound")
async def create_inbound(body: InboundIn, user: dict = Depends(require_role("admin", "manager"))):
    oid = str(uuid.uuid4())
    ts = now_iso()
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO inbound (id, po_number, supplier, expected_date, status, created_at, created_by) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7)",
            oid, body.po_number, body.supplier, body.expected_date, "pending", ts, user["name"],
        )
        item_rows = []
        items_out = []
        for idx, item in enumerate(body.items):
            iid = str(uuid.uuid4())
            barcode = item.barcode or f"PLT-{body.po_number.replace(' ','-').upper()}-P{idx+1:02d}"
            item_rows.append((
                iid, oid, item.sku_id, item.qty, item.location_id, barcode,
                item.batch_no, item.manufacture_date, item.expiry_date, False, None, None,
            ))
            items_out.append({
                "id": iid, "inbound_id": oid, "sku_id": item.sku_id, "qty": item.qty,
                "location_id": item.location_id, "barcode": barcode,
                "batch_no": item.batch_no, "manufacture_date": item.manufacture_date,
                "expiry_date": item.expiry_date, "putaway_confirmed": False,
                "confirmed_at": None, "confirmed_by": None,
            })
        await conn.executemany(
            "INSERT INTO inbound_items (id, inbound_id, sku_id, qty, location_id, barcode, "
            "batch_no, manufacture_date, expiry_date, putaway_confirmed, confirmed_at, confirmed_by) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
            item_rows,
        )
    return {
        "id": oid, "po_number": body.po_number, "supplier": body.supplier,
        "expected_date": body.expected_date, "status": "pending",
        "created_at": ts, "created_by": user["name"], "items": items_out,
    }


async def _execute_receive(conn, order: dict) -> None:
    received_at = now_iso()
    for item in order["items"]:
        existing = await conn.fetchrow(
            "SELECT id, qty FROM stock WHERE sku_id=$1 AND location_id=$2",
            item["sku_id"], item["location_id"],
        )
        if existing:
            await conn.execute(
                "UPDATE stock SET qty=qty+$1, batch_no=$2, manufacture_date=$3, "
                "expiry_date=$4, received_date=$5, ref=$6 WHERE id=$7",
                item["qty"], item.get("batch_no"), item.get("manufacture_date"),
                item.get("expiry_date"), received_at, order["po_number"], existing["id"],
            )
        else:
            await conn.execute(
                "INSERT INTO stock (id, sku_id, location_id, qty, batch_no, manufacture_date, "
                "expiry_date, received_date, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                str(uuid.uuid4()), item["sku_id"], item["location_id"], item["qty"],
                item.get("batch_no"), item.get("manufacture_date"),
                item.get("expiry_date"), received_at, order["po_number"],
            )
        await conn.execute(
            "UPDATE skus SET total_stock = total_stock + $1 WHERE id=$2", item["qty"], item["sku_id"]
        )
        await conn.execute(
            "UPDATE locations SET occupied = occupied + $1 WHERE id=$2", item["qty"], item["location_id"]
        )
        await conn.execute(
            "INSERT INTO movements (id, type, sku_id, location_id, qty, ref, batch_no, expiry_date, timestamp) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            str(uuid.uuid4()), "in", item["sku_id"], item["location_id"], item["qty"],
            order["po_number"], item.get("batch_no"), item.get("expiry_date"), received_at,
        )
    await conn.execute(
        "UPDATE inbound SET status='completed', completed_at=$1 WHERE id=$2",
        received_at, order["id"],
    )


@api.post("/inbound/{order_id}/receive")
async def receive_inbound(order_id: str, user: dict = Depends(require_role("admin", "manager", "operator"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("SELECT * FROM inbound WHERE id=$1", order_id)
            if not row:
                raise HTTPException(404, "Inbound order not found")
            if row["status"] == "completed":
                raise HTTPException(400, "Already completed")
            items = await conn.fetch("SELECT * FROM inbound_items WHERE inbound_id=$1", order_id)
            order = dict(row)
            order["items"] = [dict(it) for it in items]
            await _execute_receive(conn, order)
    return {"ok": True}


@api.post("/inbound/{order_id}/putaway-scan")
async def putaway_scan(order_id: str, body: PutawayScanIn, user: dict = Depends(require_role("admin", "manager", "operator"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("SELECT * FROM inbound WHERE id=$1", order_id)
            if not row:
                raise HTTPException(404, "Inbound order not found")
            if row["status"] == "completed":
                raise HTTPException(400, "Order already completed")
            items = await conn.fetch("SELECT * FROM inbound_items WHERE inbound_id=$1", order_id)
            matched = next((it for it in items if it["barcode"] == body.barcode.strip()), None)
            if not matched:
                raise HTTPException(404, f"Barcode '{body.barcode}' not found in this order")
            if matched["putaway_confirmed"]:
                raise HTTPException(400, "Pallet already confirmed")
            confirmed_at = now_iso()
            await conn.execute(
                "UPDATE inbound_items SET putaway_confirmed=TRUE, confirmed_at=$1, confirmed_by=$2 WHERE id=$3",
                confirmed_at, user["name"], matched["id"],
            )
            all_confirmed = all(
                it["putaway_confirmed"] or it["id"] == matched["id"] for it in items
            )
            if all_confirmed:
                fresh_items = await conn.fetch("SELECT * FROM inbound_items WHERE inbound_id=$1", order_id)
                order = dict(row)
                order["items"] = [dict(it) for it in fresh_items]
                await _execute_receive(conn, order)
    return {
        "ok": True, "barcode": body.barcode,
        "item_index": next(i for i, it in enumerate(items) if it["id"] == matched["id"]),
        "all_confirmed": all_confirmed,
    }


# ---------- GRN / Pick List ----------
@api.get("/inbound/{order_id}/grn")
async def inbound_grn(order_id: str, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM inbound WHERE id=$1", order_id)
        if not row:
            raise HTTPException(404, "Not found")
        items = await conn.fetch("SELECT * FROM inbound_items WHERE inbound_id=$1", order_id)
        enriched = []
        for it in items:
            sku = await conn.fetchrow("SELECT sku_code, name, unit FROM skus WHERE id=$1", it["sku_id"])
            loc = await conn.fetchrow("SELECT code FROM locations WHERE id=$1", it["location_id"])
            enriched.append({**dict(it), "sku": dict(sku) if sku else None, "location": dict(loc) if loc else None})
    order = dict(row)
    order["items"] = enriched
    return order


@api.get("/outbound/{order_id}/picklist")
async def outbound_picklist(order_id: str, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM outbound WHERE id=$1", order_id)
        if not row:
            raise HTTPException(404, "Not found")
        items = await conn.fetch("SELECT * FROM outbound_items WHERE outbound_id=$1", order_id)
        enriched = []
        for it in items:
            sku = await conn.fetchrow("SELECT sku_code, name, unit FROM skus WHERE id=$1", it["sku_id"])
            pallets = await conn.fetch(
                "SELECT * FROM stock WHERE sku_id=$1 AND qty > 0 ORDER BY expiry_date NULLS LAST",
                it["sku_id"],
            )
            pick_locs = []
            remaining = it["qty"]
            for p in pallets:
                if remaining <= 0:
                    break
                loc = await conn.fetchrow("SELECT code FROM locations WHERE id=$1", p["location_id"])
                take = min(p["qty"], remaining)
                pick_locs.append({"location": dict(loc) if loc else None, "qty": take,
                                  "batch_no": p["batch_no"], "expiry_date": p["expiry_date"]})
                remaining -= take
            enriched.append({**dict(it), "sku": dict(sku) if sku else None, "pick_locations": pick_locs})
    order = dict(row)
    order["items"] = enriched
    return order


# ---------- Outbound ----------
@api.get("/outbound")
async def list_outbound(status: Optional[str] = None, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        if status:
            orders = await conn.fetch("SELECT * FROM outbound WHERE status=$1 ORDER BY created_at DESC", status)
        else:
            orders = await conn.fetch("SELECT * FROM outbound ORDER BY created_at DESC")
        if not orders:
            return []
        ids = [o["id"] for o in orders]
        items = await conn.fetch("SELECT * FROM outbound_items WHERE outbound_id = ANY($1::text[])", ids)
    items_by_order: dict = {}
    for it in items:
        items_by_order.setdefault(it["outbound_id"], []).append(dict(it))
    result = []
    for o in orders:
        d = dict(o)
        d["items"] = items_by_order.get(d["id"], [])
        result.append(d)
    return result


@api.post("/outbound")
async def create_outbound(body: OutboundIn, user: dict = Depends(require_role("admin", "manager"))):
    oid = str(uuid.uuid4())
    ts = now_iso()
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO outbound (id, so_number, customer, status, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6)",
            oid, body.so_number, body.customer, "pending", ts, user["name"],
        )
        item_rows = [(str(uuid.uuid4()), oid, it.sku_id, it.qty) for it in body.items]
        await conn.executemany(
            "INSERT INTO outbound_items (id, outbound_id, sku_id, qty) VALUES ($1,$2,$3,$4)", item_rows
        )
    items_out = [{"id": r[0], "outbound_id": oid, "sku_id": r[2], "qty": r[3]} for r in item_rows]
    return {
        "id": oid, "so_number": body.so_number, "customer": body.customer,
        "status": "pending", "created_at": ts, "created_by": user["name"], "items": items_out,
    }


@api.post("/outbound/{order_id}/advance")
async def advance_outbound(order_id: str, user: dict = Depends(require_role("admin", "manager", "operator"))):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("SELECT * FROM outbound WHERE id=$1", order_id)
            if not row:
                raise HTTPException(404, "Outbound order not found")
            flow = {"pending": "picking", "picking": "packing", "packing": "shipped"}
            nxt = flow.get(row["status"])
            if not nxt:
                raise HTTPException(400, "Order is already shipped")
            if nxt == "shipped":
                items = await conn.fetch("SELECT * FROM outbound_items WHERE outbound_id=$1", order_id)
                for item in items:
                    remaining = item["qty"]
                    stocks = await conn.fetch(
                        "SELECT * FROM stock WHERE sku_id=$1 AND qty > 0", item["sku_id"]
                    )
                    for s in stocks:
                        if remaining <= 0:
                            break
                        take = min(s["qty"], remaining)
                        await conn.execute(
                            "UPDATE stock SET qty=qty-$1 WHERE id=$2", take, s["id"]
                        )
                        await conn.execute(
                            "UPDATE locations SET occupied=GREATEST(0, occupied-$1) WHERE id=$2",
                            take, s["location_id"],
                        )
                        await conn.execute(
                            "INSERT INTO movements (id, type, sku_id, location_id, qty, ref, timestamp) "
                            "VALUES ($1,$2,$3,$4,$5,$6,$7)",
                            str(uuid.uuid4()), "out", item["sku_id"], s["location_id"],
                            take, row["so_number"], now_iso(),
                        )
                        remaining -= take
                    deducted = item["qty"] - remaining
                    await conn.execute(
                        "UPDATE skus SET total_stock=GREATEST(0, total_stock-$1) WHERE id=$2",
                        deducted, item["sku_id"],
                    )
            await conn.execute("UPDATE outbound SET status=$1 WHERE id=$2", nxt, order_id)
    return {"ok": True, "status": nxt}


# ---------- Dashboard ----------
@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        total_skus = await conn.fetchval("SELECT COUNT(*) FROM skus")
        total_locations = await conn.fetchval("SELECT COUNT(*) FROM locations")
        sku_rows = await conn.fetch("SELECT total_stock, unit_price, reorder_level FROM skus")
        total_value = sum(s["total_stock"] * s["unit_price"] for s in sku_rows)
        low_stock = sum(1 for s in sku_rows if 0 < s["total_stock"] <= s["reorder_level"])
        out_of_stock = sum(1 for s in sku_rows if s["total_stock"] <= 0)
        today = datetime.now(timezone.utc).date().isoformat()
        inbound_today = await conn.fetchval(
            "SELECT COUNT(*) FROM movements WHERE type='in' AND timestamp >= $1", today
        )
        outbound_today = await conn.fetchval(
            "SELECT COUNT(*) FROM movements WHERE type='out' AND timestamp >= $1", today
        )
        pending_inbound = await conn.fetchval("SELECT COUNT(*) FROM inbound WHERE status='pending'")
        pending_outbound = await conn.fetchval(
            "SELECT COUNT(*) FROM outbound WHERE status != 'shipped'"
        )
        cap_row = await conn.fetchrow(
            "SELECT SUM(capacity) AS cap, SUM(occupied) AS occ FROM locations"
        )
        utilization = 0
        if cap_row and cap_row["cap"]:
            utilization = round(cap_row["occ"] / cap_row["cap"] * 100, 1)
        recent = await conn.fetch(
            "SELECT m.*, sk.sku_code, sk.name AS sk_name, l.code AS loc_code "
            "FROM movements m "
            "LEFT JOIN skus sk ON sk.id = m.sku_id "
            "LEFT JOIN locations l ON l.id = m.location_id "
            "ORDER BY m.timestamp DESC LIMIT 8"
        )
    recent_out = []
    for m in recent:
        d = dict(m)
        d["sku"] = {"sku_code": d.pop("sku_code", None), "name": d.pop("sk_name", None)}
        d["location"] = {"code": d.pop("loc_code", None)}
        recent_out.append(d)
    return {
        "total_skus": total_skus, "total_locations": total_locations,
        "stock_value": round(total_value, 2), "low_stock": low_stock,
        "out_of_stock": out_of_stock, "inbound_today": inbound_today,
        "outbound_today": outbound_today, "pending_inbound": pending_inbound,
        "pending_outbound": pending_outbound, "utilization": utilization,
        "recent_movements": recent_out,
    }


@api.get("/dashboard/movements")
async def movement_trends(days: int = 14, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    start = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT type, qty, timestamp FROM movements WHERE timestamp >= $1", start
        )
    buckets: dict = {}
    for m in rows:
        day = m["timestamp"][:10]
        b = buckets.setdefault(day, {"date": day, "inbound": 0, "outbound": 0})
        if m["type"] == "in":
            b["inbound"] += m["qty"]
        else:
            b["outbound"] += m["qty"]
    out = []
    for i in range(days, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
        out.append(buckets.get(d, {"date": d, "inbound": 0, "outbound": 0}))
    return out


# ---------- Reports ----------
@api.get("/reports/top-skus")
async def top_skus(limit: int = 10, user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT m.sku_id, SUM(m.qty) AS moved, sk.sku_code, sk.name, sk.category "
            "FROM movements m JOIN skus sk ON sk.id = m.sku_id "
            "GROUP BY m.sku_id, sk.sku_code, sk.name, sk.category "
            "ORDER BY moved DESC LIMIT $1", limit,
        )
    return [{"sku": {"sku_code": r["sku_code"], "name": r["name"], "category": r["category"]}, "moved": r["moved"]} for r in rows]


@api.get("/reports/category-distribution")
async def category_dist(user: dict = Depends(get_user)):
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT category, COUNT(*) AS count, SUM(total_stock) AS stock FROM skus "
            "GROUP BY category ORDER BY count DESC"
        )
    return [{"category": r["category"], "count": r["count"], "stock": r["stock"] or 0} for r in rows]


@api.post("/reports/ai-insights")
async def ai_insights(user: dict = Depends(get_user)):
    summary = await dashboard_summary(user)
    top = await top_skus(5, user)
    cats = await category_dist(user)
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        low_stock_skus = await conn.fetch(
            "SELECT sku_code, name, total_stock, reorder_level FROM skus "
            "WHERE total_stock <= reorder_level ORDER BY total_stock LIMIT 10"
        )
    context = f"""
WAREHOUSE PERFORMANCE SNAPSHOT
- Total SKUs: {summary['total_skus']}
- Stock Value: ${summary['stock_value']}
- Low Stock SKUs: {summary['low_stock']}
- Out of Stock: {summary['out_of_stock']}
- Storage Utilization: {summary['utilization']}%
- Pending Inbound: {summary['pending_inbound']}
- Pending Outbound: {summary['pending_outbound']}

LOW STOCK ITEMS:
{chr(10).join([f"  - {s['sku_code']} {s['name']}: {s['total_stock']} on hand (reorder at {s['reorder_level']})" for s in low_stock_skus])}

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
                "2) 3 prioritized actionable insights (with bullet markers '>'), 3) a brief risk assessment. "
                "Use crisp, technical language. Format output as plain text with section headers in CAPS. Keep total under 220 words."
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        response = await chat.send_message(UserMessage(text=context))
        return {"insights": response, "generated_at": now_iso()}
    except Exception as e:
        logging.exception("AI insights failed")
        return {"insights": f"AI service unavailable: {str(e)}", "generated_at": now_iso()}


# ════════════════════════════════════════════════════
# ADMIN — DATA MANAGEMENT
# ════════════════════════════════════════════════════

@api.post("/admin/purge-data")
async def purge_data(user: dict = Depends(require_role("admin"))):
    """Delete all transactional data (SKUs, stock, orders, movements).
    Zones, locations and users are preserved. Occupied counts are reset.
    Sets seed_locked flag so seed_data() does not re-populate on next restart."""
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM shuttle_movements")
            await conn.execute("DELETE FROM movements")
            await conn.execute("DELETE FROM stock")
            await conn.execute("DELETE FROM inbound_items")
            await conn.execute("DELETE FROM inbound")
            await conn.execute("DELETE FROM outbound_items")
            await conn.execute("DELETE FROM outbound")
            await conn.execute("DELETE FROM skus")
            await conn.execute("UPDATE locations SET occupied = 0")
            await conn.execute(
                "INSERT INTO app_meta (key, value) VALUES ('seed_locked', '1') "
                "ON CONFLICT (key) DO UPDATE SET value = '1'"
            )
    return {"ok": True, "message": "All transactional data purged. Zones, locations and users preserved."}


# ════════════════════════════════════════════════════
# SEED DATA
# ════════════════════════════════════════════════════

RACK_TYPES = {
    "A": {"depth": 4, "levels": 4, "weight_kg": 8000, "lanes": 13},
    "B": {"depth": 3, "levels": 4, "weight_kg": 12000, "lanes": 11},
    "C": {"depth": 5, "levels": 4, "weight_kg": 20000, "lanes": 15},
}

PLACEHOLDER_ZONES = [
    ("COLD-2", "Cold Storage 2", -18.0, True),
    ("COLD-3", "Cold Storage 3", -22.0, True),
    ("AMBIENT", "Ambient Warehouse", 22.0, True),
]


async def seed_data():
    pool = await _db.get_pool()
    async with pool.acquire() as conn:
        # ── Users ────────────────────────────────────────────────────
        users_seed = [
            ("ADMIN_EMAIL",   "ADMIN_PASSWORD",   "Admin User",         "admin"),
            ("MANAGER_EMAIL", "MANAGER_PASSWORD", "Warehouse Manager",  "manager"),
            ("OPERATOR_EMAIL","OPERATOR_PASSWORD","Floor Operator",      "operator"),
        ]
        for i in range(2, 10):
            em = os.environ.get(f"ADMIN{i}_EMAIL", "").lower()
            if not em:
                break
            users_seed.append((f"ADMIN{i}_EMAIL", f"ADMIN{i}_PASSWORD",
                                os.environ.get(f"ADMIN{i}_NAME", f"User {i}"),
                                os.environ.get(f"ADMIN{i}_ROLE", "operator")))
        for em_key, pw_key, name, role in users_seed:
            em = os.environ.get(em_key, "").lower()
            pw = os.environ.get(pw_key, "")
            if not em:
                continue
            existing = await conn.fetchrow("SELECT id, password_hash FROM users WHERE email=$1", em)
            if not existing:
                await conn.execute(
                    "INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
                    str(uuid.uuid4()), em, name, role, hash_pw(pw), now_iso(),
                )
            elif not verify_pw(pw, existing["password_hash"]):
                await conn.execute(
                    "UPDATE users SET password_hash=$1 WHERE id=$2", hash_pw(pw), existing["id"]
                )

        # ── Schema version ───────────────────────────────────────────
        meta = await conn.fetchrow("SELECT value FROM app_meta WHERE key='schema_version'")
        current_version = int((meta or {}).get("value", 0))
        if current_version < SCHEMA_VERSION:
            await conn.execute("DELETE FROM stock")
            await conn.execute("DELETE FROM movements")
            await conn.execute("DELETE FROM shuttle_movements")
            await conn.execute("DELETE FROM inbound_items")
            await conn.execute("DELETE FROM inbound")
            await conn.execute("DELETE FROM outbound_items")
            await conn.execute("DELETE FROM outbound")
            await conn.execute("DELETE FROM locations")
            await conn.execute("DELETE FROM skus")
            await conn.execute("DELETE FROM zones_meta")
            await conn.execute(
                "INSERT INTO app_meta (key, value) VALUES ('schema_version', $1) "
                "ON CONFLICT (key) DO UPDATE SET value=$1",
                str(SCHEMA_VERSION),
            )

        # ── Placeholder zones ────────────────────────────────────────
        cnt = await conn.fetchval("SELECT COUNT(*) FROM zones_meta")
        if cnt == 0:
            await conn.executemany(
                "INSERT INTO zones_meta (zone, name, temperature, placeholder) VALUES ($1,$2,$3,$4)",
                PLACEHOLDER_ZONES,
            )

        # ── COLD-1 locations ─────────────────────────────────────────
        cnt = await conn.fetchval("SELECT COUNT(*) FROM locations")
        if cnt == 0:
            locs = []
            plan = [
                ("A", "A", list(range(26, 39))),
                ("B", "B", list(range(39, 50))),
                ("C", "C", list(range(50, 65))),
            ]
            for row_label, rack_type, lane_numbers in plan:
                cfg = RACK_TYPES[rack_type]
                depth = cfg["depth"]
                levels = cfg["levels"]
                weight_kg = cfg["weight_kg"]
                for lane_num in lane_numbers:
                    for level in range(1, levels + 1):
                        for pos in range(1, depth + 1):
                            locs.append((
                                str(uuid.uuid4()),
                                f"COLD1-{row_label}-L{lane_num:02d}-LV{level}-P{pos:02d}",
                                "COLD-1", "Cold Storage 1", -20.0,
                                rack_type, row_label, lane_num, level, pos, depth, levels, weight_kg, 1, 0,
                            ))
            await conn.executemany(
                "INSERT INTO locations (id, code, zone, zone_name, temperature, rack_type, row_label, "
                "lane_number, level, position, depth, levels, weight_capacity_kg, capacity, occupied) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
                locs,
            )

        # ── Shuttle zone locations ───────────────────────────────────
        shuttle_cnt = await conn.fetchval("SELECT COUNT(*) FROM locations WHERE zone=$1", SHUTTLE_ZONE)
        if shuttle_cnt == 0:
            shuttle_locs = []
            for lane in range(1, 8):
                for level in range(0, 5):
                    for depth in range(1, 51):
                        shuttle_locs.append((
                            str(uuid.uuid4()),
                            _shuttle_code(lane, level, depth),
                            SHUTTLE_ZONE, "Shuttle FIFO — Cold Storage", -20.0,
                            "shuttle", None, lane, level, depth, 50, 5, None, 1, 0,
                        ))
            # Insert in batches of 500 to avoid parameter limits
            for i in range(0, len(shuttle_locs), 500):
                await conn.executemany(
                    "INSERT INTO locations (id, code, zone, zone_name, temperature, rack_type, row_label, "
                    "lane_number, level, position, depth, levels, weight_capacity_kg, capacity, occupied) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
                    shuttle_locs[i:i+500],
                )

        # ── SKUs + initial stock ─────────────────────────────────────
        seed_locked = await conn.fetchval("SELECT value FROM app_meta WHERE key='seed_locked'")
        sku_cnt = await conn.fetchval("SELECT COUNT(*) FROM skus")
        if sku_cnt == 0 and not seed_locked:
            catalog = [
                ("FRZ-MEAT-001","Frozen Beef Sirloin 20kg","Frozen Meat","PLT",480.00,4),
                ("FRZ-MEAT-002","Frozen Chicken Breast 25kg","Frozen Meat","PLT",320.00,5),
                ("FRZ-MEAT-003","Frozen Pork Loin 22kg","Frozen Meat","PLT",380.00,4),
                ("FRZ-MEAT-004","Frozen Lamb Chops 18kg","Frozen Meat","PLT",540.00,3),
                ("FRZ-SEAF-001","Frozen Atlantic Salmon 20kg","Seafood","PLT",720.00,3),
                ("FRZ-SEAF-002","Frozen Tiger Prawns 15kg","Seafood","PLT",850.00,2),
                ("FRZ-SEAF-003","Frozen Tuna Steaks 18kg","Seafood","PLT",920.00,3),
                ("FRZ-DAIRY-001","Frozen Butter Blocks 25kg","Dairy","PLT",220.00,6),
                ("FRZ-DAIRY-002","Vanilla Ice Cream Tubs 20L","Ice Cream","PLT",180.00,8),
                ("FRZ-DAIRY-003","Chocolate Ice Cream Tubs 20L","Ice Cream","PLT",195.00,6),
                ("FRZ-DAIRY-004","Strawberry Ice Cream 20L","Ice Cream","PLT",200.00,5),
                ("FRZ-VEG-001","Frozen Mixed Vegetables 15kg","Vegetables","PLT",120.00,8),
                ("FRZ-VEG-002","Frozen Sweet Corn 15kg","Vegetables","PLT",95.00,10),
                ("FRZ-VEG-003","Frozen Spinach Blocks 12kg","Vegetables","PLT",110.00,6),
                ("FRZ-VEG-004","Frozen Green Peas 15kg","Vegetables","PLT",105.00,8),
                ("FRZ-FRUIT-001","Frozen Strawberries 12kg","Fruits","PLT",240.00,5),
                ("FRZ-FRUIT-002","Frozen Blueberries 10kg","Fruits","PLT",290.00,4),
                ("FRZ-FRUIT-003","Frozen Mango Chunks 12kg","Fruits","PLT",220.00,5),
                ("FRZ-DOUGH-001","Frozen Pizza Dough Balls","Bakery","PLT",140.00,6),
                ("FRZ-DOUGH-002","Frozen Croissant Dough","Bakery","PLT",165.00,4),
                ("FRZ-READY-001","Frozen Lasagna Trays","Ready Meals","PLT",280.00,5),
                ("FRZ-READY-002","Frozen Chicken Curry Trays","Ready Meals","PLT",260.00,4),
                ("FRZ-PROC-001","Frozen Chicken Nuggets 12kg","Processed","PLT",175.00,8),
                ("FRZ-PROC-002","Frozen French Fries 15kg","Processed","PLT",130.00,12),
                ("FRZ-PROC-003","Frozen Spring Rolls 10kg","Processed","PLT",155.00,6),
            ]
            sku_rows_data = []
            ts = now_iso()
            for code, name, cat, unit, price, reorder in catalog:
                sku_rows_data.append((str(uuid.uuid4()), code, name, cat, unit, price, reorder, 0, ts))
            await conn.executemany(
                "INSERT INTO skus (id, sku_code, name, category, unit, unit_price, reorder_level, total_stock, created_at) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                sku_rows_data,
            )
            # Fetch inserted skus and COLD-1 locations for initial stock distribution
            skus_db = await conn.fetch("SELECT * FROM skus")
            all_locs = list(await conn.fetch("SELECT * FROM locations WHERE zone='COLD-1'"))
            random.shuffle(all_locs)
            target_fill = int(len(all_locs) * 0.58)
            placed_total = 0
            for sku in skus_db:
                pallets = random.randint(8, 28)
                placed = 0
                while placed < pallets and all_locs:
                    loc = all_locs.pop()
                    if loc["occupied"] >= loc["capacity"]:
                        continue
                    ts2 = now_iso()
                    mfg = (datetime.now(timezone.utc) - timedelta(days=random.randint(30,180))).date().isoformat()
                    exp = (datetime.now(timezone.utc) + timedelta(days=random.randint(15,365))).date().isoformat()
                    recv = (datetime.now(timezone.utc) - timedelta(days=random.randint(1,13))).isoformat()
                    await conn.execute(
                        "INSERT INTO stock (id, sku_id, location_id, qty, batch_no, manufacture_date, expiry_date, received_date) "
                        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                        str(uuid.uuid4()), sku["id"], loc["id"], 1,
                        f"B{random.randint(1000,9999)}-{sku['sku_code'][-3:]}",
                        mfg, exp, recv,
                    )
                    await conn.execute("UPDATE locations SET occupied=1 WHERE id=$1", loc["id"])
                    mv_ts = (datetime.now(timezone.utc) - timedelta(days=random.randint(1,13), hours=random.randint(0,23))).isoformat()
                    await conn.execute(
                        "INSERT INTO movements (id, type, sku_id, location_id, qty, ref, timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                        str(uuid.uuid4()), "in", sku["id"], loc["id"], 1,
                        f"PO-INIT-{random.randint(1000,9999)}", mv_ts,
                    )
                    placed += 1
                    placed_total += 1
                    if placed_total >= target_fill:
                        break
                await conn.execute("UPDATE skus SET total_stock=total_stock+$1 WHERE id=$2", placed, sku["id"])
                if placed_total >= target_fill:
                    break

            # Historical outbound
            skus_final = await conn.fetch("SELECT id FROM skus")
            for _ in range(35):
                sku = random.choice(skus_final)
                s = await conn.fetchrow("SELECT * FROM stock WHERE sku_id=$1 AND qty > 0 LIMIT 1", sku["id"])
                if not s:
                    continue
                mv_ts = (datetime.now(timezone.utc) - timedelta(days=random.randint(0,13), hours=random.randint(0,23))).isoformat()
                await conn.execute("UPDATE stock SET qty=qty-1 WHERE id=$1", s["id"])
                await conn.execute("UPDATE locations SET occupied=GREATEST(0,occupied-1) WHERE id=$1", s["location_id"])
                await conn.execute("UPDATE skus SET total_stock=GREATEST(0,total_stock-1) WHERE id=$1", sku["id"])
                await conn.execute(
                    "INSERT INTO movements (id, type, sku_id, location_id, qty, ref, timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                    str(uuid.uuid4()), "out", sku["id"], s["location_id"], 1,
                    f"SO-INIT-{random.randint(1000,9999)}", mv_ts,
                )

        # ── Sample inbound orders ────────────────────────────────────
        inb_cnt = await conn.fetchval("SELECT COUNT(*) FROM inbound")
        if inb_cnt == 0 and not seed_locked:
            skus_db = await conn.fetch("SELECT id FROM skus")
            free_locs = list(await conn.fetch(
                "SELECT id FROM locations WHERE occupied < capacity ORDER BY id"
            ))
            suppliers = ["Arctic Foods Ltd","FrostChain Suppliers","PolarFresh Co","Glacier Distributors","IceVault Logistics"]
            for i in range(8):
                oid2 = str(uuid.uuid4())
                picks = random.sample(list(skus_db), k=min(random.randint(2,4), len(skus_db)))
                crat = (datetime.now(timezone.utc) - timedelta(days=random.randint(0,5))).isoformat()
                exp_d = (datetime.now(timezone.utc) + timedelta(days=random.randint(1,10))).date().isoformat()
                status = random.choice(["pending","pending","completed"])
                await conn.execute(
                    "INSERT INTO inbound (id, po_number, supplier, expected_date, status, created_at, created_by) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7)",
                    oid2, f"PO-2026-{1000+i:04d}", random.choice(suppliers), exp_d, status, crat, "Admin User",
                )
                for s in picks:
                    for _ in range(random.randint(1,3)):
                        if not free_locs:
                            break
                        loc = free_locs.pop()
                        await conn.execute(
                            "INSERT INTO inbound_items (id, inbound_id, sku_id, qty, location_id, barcode, putaway_confirmed) "
                            "VALUES ($1,$2,$3,$4,$5,$6,$7)",
                            str(uuid.uuid4()), oid2, s["id"], 1, loc["id"],
                            f"PLT-PO-2026-{1000+i:04d}-{random.randint(1,99):02d}", False,
                        )

        # ── Sample outbound orders ───────────────────────────────────
        out_cnt = await conn.fetchval("SELECT COUNT(*) FROM outbound")
        if out_cnt == 0 and not seed_locked:
            skus_db = await conn.fetch("SELECT id FROM skus")
            customers = ["Metro Supermarkets","FreshMart Chain","ColdLink Retail","OmegaFoods","GroceryPro Inc"]
            statuses = ["pending","picking","packing","shipped"]
            for i in range(10):
                oid3 = str(uuid.uuid4())
                picks = random.sample(list(skus_db), k=min(random.randint(2,4), len(skus_db)))
                crat = (datetime.now(timezone.utc) - timedelta(days=random.randint(0,5))).isoformat()
                await conn.execute(
                    "INSERT INTO outbound (id, so_number, customer, status, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6)",
                    oid3, f"SO-2026-{2000+i:04d}", random.choice(customers),
                    random.choice(statuses), crat, "Admin User",
                )
                for s in picks:
                    await conn.execute(
                        "INSERT INTO outbound_items (id, outbound_id, sku_id, qty) VALUES ($1,$2,$3,$4)",
                        str(uuid.uuid4()), oid3, s["id"], random.randint(1,4),
                    )


# ---------- Startup / Shutdown ----------
@app.on_event("startup")
async def on_startup():
    await _db.init_db()
    await seed_data()


@app.on_event("shutdown")
async def on_shutdown():
    await _db.close_pool()


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

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


@api.get("/")
async def root():
    return {"app": "WMS API", "status": "ok", "db": "postgresql"}
