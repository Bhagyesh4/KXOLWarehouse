---
name: asyncpg schema evolution & types
description: How to add columns to existing tables and handle DECIMAL params with asyncpg in this WMS backend
---

# Schema evolution with CREATE TABLE IF NOT EXISTS

`backend/db.py` defines all schema as one `DDL` string run by `init_db()` on startup. Every table uses `CREATE TABLE IF NOT EXISTS`, so editing a table's column list does NOT alter an already-created table.

**Rule:** when adding a column to an existing table, edit the `CREATE TABLE` block (for fresh DBs) AND append idempotent `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>;` statements (for the existing DB). Postgres supports `ADD COLUMN IF NOT EXISTS`.

**Why:** the existing dev/prod DB already has the table, so CREATE TABLE is a no-op there; without the ALTER, new columns silently never appear and INSERTs referencing them fail.

# asyncpg DECIMAL/NUMERIC params need Python Decimal

asyncpg's default codec for `numeric`/`DECIMAL` columns is `decimal.Decimal`. Passing a Python `float` as a query arg for such a column raises a DataError.

**How to apply:** convert before binding, e.g. `Decimal(str(value))` (see `_to_decimal` helper in `backend/server.py`). FLOAT/double-precision columns (like `unit_price`) accept plain floats fine. FastAPI serializes the returned Decimal to a JSON number automatically.
