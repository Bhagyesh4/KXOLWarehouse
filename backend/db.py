import os
import asyncpg
from typing import Optional

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        dsn = os.environ["DATABASE_URL"]
        _pool = await asyncpg.create_pool(dsn=dsn, min_size=2, max_size=15)
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


DDL = """
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skus (
    id            TEXT PRIMARY KEY,
    sku_code      TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    unit          TEXT NOT NULL DEFAULT 'EA',
    unit_price    FLOAT NOT NULL DEFAULT 0,
    reorder_level INT NOT NULL DEFAULT 10,
    bag_color       VARCHAR(50),
    weight_per_bag  DECIMAL(10,2),
    bags_per_pallet INTEGER,
    dimensions      VARCHAR(255),
    total_stock   INT NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
);

ALTER TABLE skus ADD COLUMN IF NOT EXISTS bag_color       VARCHAR(50);
ALTER TABLE skus ADD COLUMN IF NOT EXISTS weight_per_bag  DECIMAL(10,2);
ALTER TABLE skus ADD COLUMN IF NOT EXISTS bags_per_pallet INTEGER;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS dimensions      VARCHAR(255);

CREATE TABLE IF NOT EXISTS locations (
    id                 TEXT PRIMARY KEY,
    code               TEXT UNIQUE NOT NULL,
    zone               TEXT NOT NULL,
    zone_name          TEXT,
    temperature        FLOAT,
    rack_type          TEXT,
    row_label          TEXT,
    lane_number        INT,
    level              INT,
    position           INT,
    depth              INT,
    levels             INT,
    weight_capacity_kg FLOAT,
    capacity           INT NOT NULL DEFAULT 1,
    occupied           INT NOT NULL DEFAULT 0,
    sku_assignment     TEXT
);

CREATE INDEX IF NOT EXISTS idx_loc_zone       ON locations(zone);
CREATE INDEX IF NOT EXISTS idx_loc_lane       ON locations(zone, row_label, lane_number, level);
CREATE INDEX IF NOT EXISTS idx_loc_rack_type  ON locations(rack_type);

CREATE TABLE IF NOT EXISTS stock (
    id               TEXT PRIMARY KEY,
    sku_id           TEXT NOT NULL,
    location_id      TEXT NOT NULL,
    qty              INT NOT NULL DEFAULT 0,
    batch_no         TEXT,
    manufacture_date TEXT,
    expiry_date      TEXT,
    received_date    TEXT,
    pallet_code      TEXT,
    bag_color        VARCHAR(50),
    ref              TEXT
);

ALTER TABLE stock ADD COLUMN IF NOT EXISTS bag_color VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_stock_loc  ON stock(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_sku  ON stock(sku_id);

CREATE TABLE IF NOT EXISTS movements (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    sku_id      TEXT NOT NULL,
    location_id TEXT NOT NULL,
    qty         INT NOT NULL,
    ref         TEXT,
    batch_no    TEXT,
    expiry_date TEXT,
    timestamp   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mov_ts  ON movements(timestamp);
CREATE INDEX IF NOT EXISTS idx_mov_sku ON movements(sku_id);

CREATE TABLE IF NOT EXISTS inbound (
    id            TEXT PRIMARY KEY,
    po_number     TEXT NOT NULL,
    supplier      TEXT NOT NULL,
    expected_date TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TEXT NOT NULL,
    created_by    TEXT NOT NULL,
    completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS inbound_items (
    id               TEXT PRIMARY KEY,
    inbound_id       TEXT NOT NULL REFERENCES inbound(id) ON DELETE CASCADE,
    sku_id           TEXT NOT NULL,
    qty              INT NOT NULL,
    location_id      TEXT NOT NULL,
    barcode          TEXT,
    bag_color        VARCHAR(50),
    batch_no         TEXT,
    manufacture_date TEXT,
    expiry_date      TEXT,
    putaway_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at     TEXT,
    confirmed_by     TEXT
);

ALTER TABLE inbound_items ADD COLUMN IF NOT EXISTS bag_color VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_ii_order ON inbound_items(inbound_id);

CREATE TABLE IF NOT EXISTS outbound (
    id         TEXT PRIMARY KEY,
    so_number  TEXT NOT NULL,
    customer   TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbound_items (
    id          TEXT PRIMARY KEY,
    outbound_id TEXT NOT NULL REFERENCES outbound(id) ON DELETE CASCADE,
    sku_id      TEXT NOT NULL,
    qty         INT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbound_picks (
    id          TEXT PRIMARY KEY,
    outbound_id TEXT NOT NULL REFERENCES outbound(id) ON DELETE CASCADE,
    barcode     TEXT NOT NULL,
    sku_id      TEXT NOT NULL,
    qty         INT NOT NULL,
    scanned_at  TEXT NOT NULL,
    scanned_by  TEXT,
    UNIQUE (outbound_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_op_order ON outbound_picks(outbound_id);

CREATE INDEX IF NOT EXISTS idx_oi_order ON outbound_items(outbound_id);

CREATE TABLE IF NOT EXISTS zones_meta (
    zone        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    temperature FLOAT,
    placeholder BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS shuttle_movements (
    id            TEXT PRIMARY KEY,
    lane_no       INT NOT NULL,
    level_no      INT NOT NULL,
    from_depth    INT,
    to_depth      INT,
    pallet_code   TEXT,
    sku_code      TEXT,
    movement_type TEXT NOT NULL,
    ref           TEXT,
    timestamp     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transfers (
    id               TEXT PRIMARY KEY,
    stock_id         TEXT NOT NULL,
    sku_id           TEXT NOT NULL,
    sku_code         TEXT NOT NULL,
    sku_name         TEXT NOT NULL,
    pallet_code      TEXT,
    qty              INT NOT NULL,
    bag_color        VARCHAR(50),
    from_location_id TEXT NOT NULL,
    from_code        TEXT NOT NULL,
    to_location_id   TEXT NOT NULL,
    to_code          TEXT NOT NULL,
    notes            TEXT,
    transferred_by   TEXT NOT NULL,
    transferred_at   TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'initiated',
    confirmed_at     TEXT,
    confirmed_by     TEXT
);

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'initiated';
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS confirmed_at TEXT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS confirmed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_transfer_ts     ON transfers(transferred_at);
CREATE INDEX IF NOT EXISTS idx_transfer_sku    ON transfers(sku_id);
CREATE INDEX IF NOT EXISTS idx_transfer_status ON transfers(status);

CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '0'
);
"""


async def init_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(DDL)


def r(row) -> Optional[dict]:
    """Convert a single asyncpg Record to dict (or None)."""
    return dict(row) if row is not None else None


def rl(rows) -> list:
    """Convert a list of asyncpg Records to list of dicts."""
    return [dict(row) for row in rows]
