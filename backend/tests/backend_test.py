"""WMS Backend Test Suite - COLD 1 cold-storage schema (v2).

Covers: auth, inventory (25 frozen SKUs, PLT unit), storage (640 bins, 4 zones, 39 lanes),
inbound/outbound flows, dashboard, AI insights.
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@wms.com", "password": "admin123"}
MANAGER = {"email": "manager@wms.com", "password": "manager123"}
OPERATOR = {"email": "operator@wms.com", "password": "operator123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def manager_token():
    return _login(MANAGER)


@pytest.fixture(scope="session")
def operator_token():
    return _login(OPERATOR)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_login_manager(self, manager_token):
        assert manager_token

    def test_login_operator(self, operator_token):
        assert operator_token

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@x.com", "password": "bad"})
        assert r.status_code == 401

    def test_me(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == "admin@wms.com"
        assert d["role"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Dashboard ----------
class TestDashboard:
    def test_summary(self, admin_token):
        r = requests.get(f"{API}/dashboard/summary", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["total_skus", "total_locations", "stock_value", "low_stock",
                  "utilization", "recent_movements"]:
            assert k in d, f"missing key {k}"
        assert d["total_skus"] == 25
        assert d["total_locations"] == 640
        assert isinstance(d["stock_value"], (int, float)) and d["stock_value"] > 0
        # Utilization expected ~55% (per problem statement)
        assert 30 <= d["utilization"] <= 80, f"utilization {d['utilization']} outside expected range"

    def test_movements_trend(self, admin_token):
        r = requests.get(f"{API}/dashboard/movements?days=14", headers=H(admin_token))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        assert "inbound" in rows[0] and "outbound" in rows[0] and "date" in rows[0]


# ---------- Inventory (25 frozen SKUs, PLT unit) ----------
class TestInventory:
    def test_list_skus(self, admin_token):
        r = requests.get(f"{API}/inventory/skus", headers=H(admin_token))
        assert r.status_code == 200
        skus = r.json()
        assert len(skus) == 25, f"expected 25 SKUs, got {len(skus)}"
        # All should be frozen (FRZ-) and unit PLT
        for s in skus:
            assert s["sku_code"].startswith("FRZ-"), f"non-frozen SKU: {s['sku_code']}"
            assert s["unit"] == "PLT", f"non-pallet unit: {s['unit']}"
        # Prefix coverage
        prefixes = {"-".join(s["sku_code"].split("-")[:2]) for s in skus}
        expected = {"FRZ-MEAT", "FRZ-SEAF", "FRZ-DAIRY", "FRZ-VEG",
                    "FRZ-FRUIT", "FRZ-DOUGH", "FRZ-READY", "FRZ-PROC"}
        assert expected.issubset(prefixes), f"missing prefixes: {expected - prefixes}"

    def test_create_sku_admin(self, admin_token):
        payload = {
            "sku_code": f"TEST_SKU_{int(time.time())}",
            "name": "TEST_Widget", "category": "TestCat", "unit": "PLT",
            "unit_price": 9.99, "reorder_level": 5,
        }
        r = requests.post(f"{API}/inventory/skus", json=payload, headers=H(admin_token))
        assert r.status_code == 200
        sku = r.json()
        assert sku["sku_code"] == payload["sku_code"]
        assert "id" in sku

        payload2 = dict(payload, name="TEST_Widget_v2")
        r2 = requests.put(f"{API}/inventory/skus/{sku['id']}", json=payload2, headers=H(admin_token))
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Widget_v2"

        r3 = requests.get(f"{API}/inventory/skus/{sku['id']}/stock", headers=H(admin_token))
        assert r3.status_code == 200

        r4 = requests.delete(f"{API}/inventory/skus/{sku['id']}", headers=H(admin_token))
        assert r4.status_code == 200

    def test_create_sku_operator_forbidden(self, operator_token):
        payload = {"sku_code": f"TEST_FORBID_{int(time.time())}", "name": "x", "category": "c"}
        r = requests.post(f"{API}/inventory/skus", json=payload, headers=H(operator_token))
        assert r.status_code == 403

    def test_delete_sku_manager_forbidden(self, manager_token, admin_token):
        payload = {"sku_code": f"TEST_DEL_{int(time.time())}", "name": "x", "category": "c"}
        rc = requests.post(f"{API}/inventory/skus", json=payload, headers=H(admin_token))
        sid = rc.json()["id"]
        r = requests.delete(f"{API}/inventory/skus/{sid}", headers=H(manager_token))
        assert r.status_code == 403
        requests.delete(f"{API}/inventory/skus/{sid}", headers=H(admin_token))


# ---------- Storage (640 bins, 4 zones, 39 lanes) ----------
class TestStorage:
    def test_locations_count(self, admin_token):
        r = requests.get(f"{API}/storage/locations", headers=H(admin_token))
        assert r.status_code == 200
        locs = r.json()
        assert len(locs) == 640, f"expected 640, got {len(locs)}"
        assert "code" in locs[0] and "zone" in locs[0]

    def test_zones_structure(self, admin_token):
        r = requests.get(f"{API}/storage/zones", headers=H(admin_token))
        assert r.status_code == 200
        zones = r.json()
        assert len(zones) == 4
        by = {z["zone"]: z for z in zones}
        assert set(by.keys()) == {"COLD-1", "COLD-2", "COLD-3", "AMBIENT"}

        # Active COLD-1
        c1 = by["COLD-1"]
        assert c1["bins"] == 640
        assert c1["capacity"] == 640
        assert c1["temperature"] == -20
        assert not c1.get("placeholder", False)

        # Placeholders
        for zname, temp in [("COLD-2", -18), ("COLD-3", -22), ("AMBIENT", 22)]:
            z = by[zname]
            assert z.get("placeholder") is True, f"{zname} should be placeholder"
            assert z["bins"] == 0
            assert z["capacity"] == 0
            assert z["temperature"] == temp

    def test_lanes_cold1(self, admin_token):
        r = requests.get(f"{API}/storage/lanes?zone=COLD-1", headers=H(admin_token))
        assert r.status_code == 200
        lanes = r.json()
        assert len(lanes) == 39, f"expected 39 lanes, got {len(lanes)}"

        rows = {"A": [], "B": [], "C": []}
        for ln in lanes:
            rows.setdefault(ln["row"], []).append(ln)
        assert len(rows["A"]) == 13
        assert len(rows["B"]) == 11
        assert len(rows["C"]) == 15

        # Type-specific assertions
        type_specs = {
            "A": {"depth": 4, "weight_capacity_kg": 8000, "expected_slots": 4 * 4},   # 16
            "B": {"depth": 3, "weight_capacity_kg": 12000, "expected_slots": 3 * 4},  # 12
            "C": {"depth": 5, "weight_capacity_kg": 20000, "expected_slots": 5 * 4},  # 20
        }
        for ln in lanes:
            spec = type_specs[ln["rack_type"]]
            assert ln["levels"] == 4
            assert ln["depth"] == spec["depth"]
            assert ln["weight_capacity_kg"] == spec["weight_capacity_kg"]
            assert ln["total_slots"] == spec["expected_slots"]
            assert len(ln["bins"]) == spec["expected_slots"]
            # Bin code pattern: COLD1-{row}-L{lane}-LV{level}-P{pos}
            for b in ln["bins"]:
                assert re.match(r"^COLD1-[ABC]-L\d+-LV[1-4]-P\d+$", b["code"]), \
                    f"bad bin code: {b['code']}"

        # Total slots = 13*16 + 11*12 + 15*20 = 208+132+300 = 640
        total = sum(ln["total_slots"] for ln in lanes)
        assert total == 640

    def test_lanes_filter_other_zone(self, admin_token):
        r = requests.get(f"{API}/storage/lanes?zone=COLD-2", headers=H(admin_token))
        assert r.status_code == 200
        # Placeholder zones have no bins/lanes
        assert r.json() == []


# ---------- Inbound ----------
class TestInbound:
    def test_list(self, admin_token):
        r = requests.get(f"{API}/inbound", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_and_receive(self, admin_token):
        skus = requests.get(f"{API}/inventory/skus", headers=H(admin_token)).json()
        locs = requests.get(f"{API}/storage/locations", headers=H(admin_token)).json()
        sku = skus[0]
        # Pick a free pallet slot in COLD-1
        loc = next(l for l in locs if l.get("occupied", 0) == 0 and l.get("zone") == "COLD-1")
        body = {
            "po_number": f"TEST_PO_{int(time.time())}",
            "supplier": "TEST_Supplier",
            "expected_date": "2026-02-01",
            "items": [{"sku_id": sku["id"], "qty": 1, "location_id": loc["id"]}],
        }
        rc = requests.post(f"{API}/inbound", json=body, headers=H(admin_token))
        assert rc.status_code == 200
        oid = rc.json()["id"]

        before = requests.get(f"{API}/inventory/skus", headers=H(admin_token)).json()
        bstock = next(s for s in before if s["id"] == sku["id"])["total_stock"]

        rr = requests.post(f"{API}/inbound/{oid}/receive", headers=H(admin_token))
        assert rr.status_code == 200

        after = requests.get(f"{API}/inventory/skus", headers=H(admin_token)).json()
        astock = next(s for s in after if s["id"] == sku["id"])["total_stock"]
        assert astock == bstock + 1


# ---------- Outbound ----------
class TestOutbound:
    def test_list(self, admin_token):
        r = requests.get(f"{API}/outbound", headers=H(admin_token))
        assert r.status_code == 200

    def test_create_and_advance(self, admin_token):
        skus = requests.get(f"{API}/inventory/skus", headers=H(admin_token)).json()
        sku = next(s for s in skus if s["total_stock"] > 1)
        body = {
            "so_number": f"TEST_SO_{int(time.time())}",
            "customer": "TEST_Cust",
            "items": [{"sku_id": sku["id"], "qty": 1}],
        }
        rc = requests.post(f"{API}/outbound", json=body, headers=H(admin_token))
        assert rc.status_code == 200
        oid = rc.json()["id"]
        for expected in ["picking", "packing", "shipped"]:
            r = requests.post(f"{API}/outbound/{oid}/advance", headers=H(admin_token))
            assert r.status_code == 200
            assert r.json()["status"] == expected


# ---------- Reports ----------
class TestReports:
    def test_top_skus(self, admin_token):
        r = requests.get(f"{API}/reports/top-skus", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_category(self, admin_token):
        r = requests.get(f"{API}/reports/category-distribution", headers=H(admin_token))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_ai_insights(self, admin_token):
        r = requests.post(f"{API}/reports/ai-insights", headers=H(admin_token), timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "insights" in d and "generated_at" in d
        assert isinstance(d["insights"], str) and len(d["insights"]) > 20
