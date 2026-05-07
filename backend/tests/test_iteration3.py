"""WMS Backend Test Suite - Iteration 3 features (schema v4).

Covers:
  - Blueprint upload (PDF) -> /api/storage/parse-blueprint
  - Zone provisioning -> /api/storage/zones/{code}/provision (idempotency check)
  - FEFO pallets -> /api/inventory/skus/{id}/pallets
  - Lane contents include traceability fields
  - GRN print -> /api/inbound/{id}/grn
  - Pick-list print -> /api/outbound/{id}/picklist
  - Inbound creation/receive with batch/expiry persists to stock + movements
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@wms.com", "password": "admin123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


def H(t):
    return {"Authorization": f"Bearer {t}"}


# Minimal valid PDF bytes containing readable text "Cold Storage Zone CT-1 row A 5 lanes".
# Built using fpdf-style raw PDF; using pure bytes for portability.
def _make_pdf_bytes(text="Cold Storage Blueprint Zone AMBIENT row A 5 lanes type A levels 4 depth 4 weight 8000kg temperature 22"):
    try:
        import fitz  # PyMuPDF, already in backend env
    except Exception:
        pytest.skip("PyMuPDF not available in test env")
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text, fontsize=12)
    buf = doc.tobytes()
    doc.close()
    return buf


# ---------- Blueprint upload ----------
class TestBlueprintParse:
    def test_parse_pdf_returns_config(self, admin_token):
        pdf = _make_pdf_bytes()
        files = {"file": ("blueprint.pdf", pdf, "application/pdf")}
        r = requests.post(
            f"{API}/storage/parse-blueprint",
            files=files,
            headers=H(admin_token),
            timeout=90,
        )
        # Must NOT 500. Should be 200 with config (AI-parsed or default fallback).
        assert r.status_code == 200, f"unexpected {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert "config" in d
        cfg = d["config"]
        assert "rows" in cfg and isinstance(cfg["rows"], list) and len(cfg["rows"]) >= 1
        assert "temperature" in cfg

    def test_parse_invalid_pdf_400(self, admin_token):
        # Garbage bytes -> should 400 not 500
        files = {"file": ("bad.pdf", b"not a pdf", "application/pdf")}
        r = requests.post(
            f"{API}/storage/parse-blueprint",
            files=files,
            headers=H(admin_token),
            timeout=30,
        )
        assert r.status_code in (400, 422), f"got {r.status_code}: {r.text[:200]}"


# ---------- Zone provisioning ----------
class TestZoneProvision:
    """Use AMBIENT (placeholder) for provisioning tests, then clean up."""

    def test_provision_creates_locations_and_idempotency(self, admin_token):
        # Sanity: AMBIENT must be placeholder (zero bins) before
        zr = requests.get(f"{API}/storage/zones", headers=H(admin_token)).json()
        amb = next(z for z in zr if z["zone"] == "AMBIENT")
        if not amb.get("placeholder"):
            pytest.skip("AMBIENT no longer a placeholder; skipping provision test")

        body = {
            "zone_code": "AMBIENT",
            "zone_name": "Ambient Test",
            "temperature": 22,
            "rows": [{
                "row": "A", "rack_type": "A", "lanes": 5,
                "lane_start": 1, "levels": 4, "depth": 4, "weight_kg": 8000,
            }],
        }
        try:
            r = requests.post(
                f"{API}/storage/zones/AMBIENT/provision",
                json=body, headers=H(admin_token), timeout=30,
            )
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["ok"] is True
            assert d["bins_created"] == 5 * 4 * 4  # 80

            # Zone now active in /storage/zones
            zones2 = requests.get(f"{API}/storage/zones", headers=H(admin_token)).json()
            amb2 = next(z for z in zones2 if z["zone"] == "AMBIENT")
            assert not amb2.get("placeholder", False)
            assert amb2["bins"] == 80

            # Re-provision -> 400
            r2 = requests.post(
                f"{API}/storage/zones/AMBIENT/provision",
                json=body, headers=H(admin_token), timeout=30,
            )
            assert r2.status_code == 400
        finally:
            # Cleanup: delete locations directly via Mongo? No DB access here.
            # Best-effort: try an admin DELETE endpoint if exists, else leave note.
            pass


# ---------- FEFO pallets ----------
class TestFEFOPallets:
    def test_pallets_sorted_by_expiry(self, admin_token):
        skus = requests.get(f"{API}/inventory/skus", headers=H(admin_token)).json()
        sku = next(s for s in skus if s.get("total_stock", 0) > 0)
        r = requests.get(f"{API}/inventory/skus/{sku['id']}/pallets", headers=H(admin_token))
        assert r.status_code == 200
        pallets = r.json()
        assert len(pallets) >= 1
        # check FEFO ordering: expiry_date ascending; None last
        prev = ""
        seen_none = False
        for p in pallets:
            assert "batch_no" in p and "expiry_date" in p and "location" in p
            exp = p.get("expiry_date")
            if exp is None:
                seen_none = True
            else:
                assert not seen_none, "Pallet without expiry must come last"
                assert exp >= prev, f"FEFO order broken: {prev} > {exp}"
                prev = exp


# ---------- Lane contents include traceability ----------
class TestLaneContentsTraceability:
    def test_lane_contents_has_batch_expiry(self, admin_token):
        # find a lane that has at least one occupied bin in COLD-1
        lanes = requests.get(f"{API}/storage/lanes?zone=COLD-1", headers=H(admin_token)).json()
        target = None
        for ln in lanes:
            if any(b.get("occupied") for b in ln["bins"]):
                target = ln
                break
        assert target is not None, "no occupied lane found in COLD-1"
        r = requests.get(
            f"{API}/storage/lanes/{target['row']}/{target['lane_number']}/contents",
            headers=H(admin_token),
        )
        assert r.status_code == 200
        d = r.json()
        # endpoint returns list of {bin, item}
        assert isinstance(d, list)
        item_seen = False
        for b in d:
            if b.get("item"):
                item = b["item"]
                for k in ["batch_no", "manufacture_date", "expiry_date", "received_date"]:
                    assert k in item, f"missing trace field {k} in lane content item"
                item_seen = True
        assert item_seen, "no items found in lane contents"


# ---------- Inbound w/ traceability + GRN ----------
class TestInboundTraceabilityAndGRN:
    def test_inbound_persist_and_grn(self, admin_token):
        skus = requests.get(f"{API}/inventory/skus", headers=H(admin_token)).json()
        sku = skus[0]
        locs = requests.get(f"{API}/storage/locations", headers=H(admin_token)).json()
        loc = next(l for l in locs if l.get("occupied", 0) == 0 and l.get("zone") == "COLD-1")
        body = {
            "po_number": f"TEST_PO_TRACE_{int(time.time())}",
            "supplier": "TEST_TraceCo",
            "expected_date": "2026-03-01",
            "items": [{
                "sku_id": sku["id"], "qty": 1, "location_id": loc["id"],
                "batch_no": "TEST_BATCH_42",
                "manufacture_date": "2026-01-10",
                "expiry_date": "2026-08-01",
            }],
        }
        rc = requests.post(f"{API}/inbound", json=body, headers=H(admin_token))
        assert rc.status_code == 200
        oid = rc.json()["id"]

        # GRN BEFORE receive
        rg = requests.get(f"{API}/inbound/{oid}/grn", headers=H(admin_token))
        assert rg.status_code == 200
        grn = rg.json()
        assert grn["po_number"] == body["po_number"]
        assert len(grn["items"]) == 1
        item = grn["items"][0]
        assert item["sku"]["sku_code"] == sku["sku_code"]
        assert item["location"]["code"] == loc["code"]
        assert item["batch_no"] == "TEST_BATCH_42"
        assert item["expiry_date"] == "2026-08-01"

        # Receive -> stock should carry traceability
        rr = requests.post(f"{API}/inbound/{oid}/receive", headers=H(admin_token))
        assert rr.status_code == 200

        # check pallets for this sku contains our batch
        pals = requests.get(f"{API}/inventory/skus/{sku['id']}/pallets", headers=H(admin_token)).json()
        match = [p for p in pals if p.get("batch_no") == "TEST_BATCH_42"]
        assert match, "batch not persisted on stock after receive"
        assert match[0]["expiry_date"] == "2026-08-01"


# ---------- Outbound picklist (FEFO) ----------
class TestOutboundPickList:
    def test_picklist_fefo_order(self, admin_token):
        skus = requests.get(f"{API}/inventory/skus", headers=H(admin_token)).json()
        sku = next(s for s in skus if s.get("total_stock", 0) > 1)
        body = {
            "so_number": f"TEST_SO_PICK_{int(time.time())}",
            "customer": "TEST_PickCust",
            "items": [{"sku_id": sku["id"], "qty": 1}],
        }
        rc = requests.post(f"{API}/outbound", json=body, headers=H(admin_token))
        assert rc.status_code == 200
        oid = rc.json()["id"]

        rp = requests.get(f"{API}/outbound/{oid}/picklist", headers=H(admin_token))
        assert rp.status_code == 200
        pl = rp.json()
        assert pl["so_number"] == body["so_number"]
        assert len(pl["items"]) == 1
        it = pl["items"][0]
        assert "pick_locations" in it
        assert len(it["pick_locations"]) >= 1
        # verify expiry asc among entries with non-None
        prev = ""
        for entry in it["pick_locations"]:
            assert "batch_no" in entry and "expiry_date" in entry and "location" in entry
            exp = entry.get("expiry_date") or "9999"
            assert exp >= prev, "FEFO ordering broken in picklist"
            prev = exp
