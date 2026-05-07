"""WMS Backend Test Suite - covers auth, inventory, storage, inbound, outbound, dashboard, reports."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inventory-central-31.preview.emergentagent.com").rstrip("/")
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
        for k in ["total_skus", "stock_value", "low_stock", "utilization", "recent_movements"]:
            assert k in d
        assert d["total_skus"] >= 25

    def test_movements_trend(self, admin_token):
        r = requests.get(f"{API}/dashboard/movements?days=14", headers=H(admin_token))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 14
        assert "inbound" in rows[0] and "outbound" in rows[0] and "date" in rows[0]


# ---------- Inventory ----------
class TestInventory:
    def test_list_skus(self, admin_token):
        r = requests.get(f"{API}/inventory/skus", headers=H(admin_token))
        assert r.status_code == 200
        skus = r.json()
        assert len(skus) >= 25
        assert "sku_code" in skus[0] and "id" in skus[0]

    def test_create_sku_admin(self, admin_token):
        payload = {
            "sku_code": f"TEST_SKU_{int(time.time())}",
            "name": "TEST_Widget", "category": "TestCat", "unit": "EA",
            "unit_price": 9.99, "reorder_level": 5,
        }
        r = requests.post(f"{API}/inventory/skus", json=payload, headers=H(admin_token))
        assert r.status_code == 200
        sku = r.json()
        assert sku["sku_code"] == payload["sku_code"]
        assert "id" in sku

        # update
        payload2 = dict(payload, name="TEST_Widget_v2")
        r2 = requests.put(f"{API}/inventory/skus/{sku['id']}", json=payload2, headers=H(admin_token))
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Widget_v2"

        # stock by sku
        r3 = requests.get(f"{API}/inventory/skus/{sku['id']}/stock", headers=H(admin_token))
        assert r3.status_code == 200

        # delete (admin)
        r4 = requests.delete(f"{API}/inventory/skus/{sku['id']}", headers=H(admin_token))
        assert r4.status_code == 200

    def test_create_sku_operator_forbidden(self, operator_token):
        payload = {"sku_code": f"TEST_FORBID_{int(time.time())}", "name": "x", "category": "c"}
        r = requests.post(f"{API}/inventory/skus", json=payload, headers=H(operator_token))
        assert r.status_code == 403

    def test_delete_sku_manager_forbidden(self, manager_token, admin_token):
        # create one with admin then try delete with manager
        payload = {"sku_code": f"TEST_DEL_{int(time.time())}", "name": "x", "category": "c"}
        rc = requests.post(f"{API}/inventory/skus", json=payload, headers=H(admin_token))
        sid = rc.json()["id"]
        r = requests.delete(f"{API}/inventory/skus/{sid}", headers=H(manager_token))
        assert r.status_code == 403
        # cleanup
        requests.delete(f"{API}/inventory/skus/{sid}", headers=H(admin_token))


# ---------- Storage ----------
class TestStorage:
    def test_locations(self, admin_token):
        r = requests.get(f"{API}/storage/locations", headers=H(admin_token))
        assert r.status_code == 200
        locs = r.json()
        assert len(locs) == 120
        assert "code" in locs[0] and "zone" in locs[0]

    def test_zones(self, admin_token):
        r = requests.get(f"{API}/storage/zones", headers=H(admin_token))
        assert r.status_code == 200
        zones = r.json()
        assert len(zones) == 4
        for z in zones:
            assert z["bins"] == 30


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
        loc = locs[0]
        body = {
            "po_number": f"TEST_PO_{int(time.time())}",
            "supplier": "TEST_Supplier",
            "expected_date": "2026-02-01",
            "items": [{"sku_id": sku["id"], "qty": 5, "location_id": loc["id"]}],
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
        assert astock == bstock + 5


# ---------- Outbound ----------
class TestOutbound:
    def test_list(self, admin_token):
        r = requests.get(f"{API}/outbound", headers=H(admin_token))
        assert r.status_code == 200

    def test_create_and_advance(self, admin_token):
        skus = requests.get(f"{API}/inventory/skus", headers=H(admin_token)).json()
        sku = next(s for s in skus if s["total_stock"] > 5)
        body = {
            "so_number": f"TEST_SO_{int(time.time())}",
            "customer": "TEST_Cust",
            "items": [{"sku_id": sku["id"], "qty": 2}],
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
