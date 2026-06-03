"""Shared fixtures for SKU validation tests.

These tests exercise the FastAPI app in-process via TestClient. Auth and the
Postgres pool are stubbed so the suite is hermetic: it needs neither a running
database nor seeded users. SKU validation runs before any DB access, so the
failure-path tests never touch the (fake) pool; the happy-path tests use a
lightweight fake connection that mimics the few asyncpg calls the endpoints make.
"""
import os
import sys

import pytest

# server.py does `import db as _db`, so the backend dir must be importable.
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Provide env vars server.py reads at import / request time.
os.environ.setdefault("DATABASE_URL", "postgresql://localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

import db as _db  # noqa: E402
import server  # noqa: E402


class FakeConn:
    """Minimal asyncpg-connection stand-in for the SKU endpoints."""

    def __init__(self, store):
        self.store = store

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT id FROM skus WHERE sku_code"):
            # No existing SKU with this code -> create proceeds.
            return None
        if q.startswith("SELECT * FROM skus WHERE id"):
            # update_sku re-reads the row after a successful UPDATE.
            return dict(self.store.get("updated_row", {"id": args[0]}))
        return None

    async def execute(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("UPDATE skus"):
            # args[-1] is the sku_id; report 1 row updated unless told otherwise.
            return "UPDATE 0" if self.store.get("update_miss") else "UPDATE 1"
        if q.startswith("INSERT INTO skus"):
            self.store["inserted"] = args
            return "INSERT 0 1"
        return None


class _AcquireCtx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *exc):
        return False


class FakePool:
    def __init__(self, store):
        self._conn = FakeConn(store)

    def acquire(self):
        return _AcquireCtx(self._conn)


@pytest.fixture
def db_store():
    """Per-test scratch space the fake DB layer reads/writes."""
    return {}


@pytest.fixture
def client(db_store, monkeypatch):
    """TestClient with auth + DB stubbed out.

    Auth is satisfied by overriding get_user with a manager (allowed to
    create/update SKUs). get_pool returns a FakePool driven by db_store.
    """
    from fastapi.testclient import TestClient

    async def fake_get_pool():
        return FakePool(db_store)

    monkeypatch.setattr(_db, "get_pool", fake_get_pool)

    async def fake_get_user():
        return {"id": "u1", "email": "manager@wms.com", "name": "Mgr", "role": "manager"}

    server.app.dependency_overrides[server.get_user] = fake_get_user
    # Note: no `with` context manager -> startup/shutdown (DB seeding) events do
    # not run, keeping the suite hermetic.
    try:
        yield TestClient(server.app)
    finally:
        server.app.dependency_overrides.pop(server.get_user, None)


def valid_sku_payload(**overrides):
    """A payload that passes every SKU validation rule."""
    base = {
        "sku_code": "TEST-001",
        "name": "Test Frozen Item",
        "category": "Frozen Meat",
        "bag_color": "White",
        "weight_per_bag": 20.0,
        "bags_per_pallet": 48,
        "dimensions": "60x40x25 cm",
        "unit": "PLT",
        "unit_price": 100.0,
        "reorder_level": 10,
    }
    base.update(overrides)
    return base
