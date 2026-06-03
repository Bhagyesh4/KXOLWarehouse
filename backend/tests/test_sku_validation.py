"""Automated coverage for SKU create/update validation rules.

Rules enforced by `_validate_sku_fields` (backend/server.py):
  - bag_color must be one of {Green, White, Yellow} and non-empty
  - weight_per_bag must be > 0
  - bags_per_pallet must be an integer > 0
  - dimensions must be non-empty

`bags_per_pallet` is typed as `int` on the Pydantic model, so a *decimal*
value is rejected at request parsing (HTTP 422) before _validate_sku_fields
runs, whereas zero/negative integers reach the validator and return HTTP 400.
"""
from conftest import valid_sku_payload

CREATE_URL = "/api/inventory/skus"
UPDATE_URL = "/api/inventory/skus/some-sku-id"


def _create(client, **overrides):
    return client.post(CREATE_URL, json=valid_sku_payload(**overrides))


def _update(client, **overrides):
    return client.put(UPDATE_URL, json=valid_sku_payload(**overrides))


# ---------- Happy path ----------
class TestValidSku:
    def test_create_valid(self, client):
        r = _create(client)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["sku_code"] == "TEST-001"
        assert body["bag_color"] == "White"
        assert body["bags_per_pallet"] == 48

    def test_update_valid(self, client):
        r = _update(client)
        assert r.status_code == 200, r.text

    def test_create_valid_each_allowed_color(self, client):
        for color in ("Green", "White", "Yellow"):
            r = _create(client, bag_color=color, sku_code=f"TEST-{color}")
            assert r.status_code == 200, f"{color}: {r.text}"


# ---------- Invalid bag color ----------
class TestBagColor:
    def test_create_invalid_color(self, client):
        r = _create(client, bag_color="Blue")
        assert r.status_code == 400
        assert "Bag Color" in r.json()["detail"]

    def test_update_invalid_color(self, client):
        r = _update(client, bag_color="Blue")
        assert r.status_code == 400

    def test_create_empty_color(self, client):
        r = _create(client, bag_color="")
        assert r.status_code == 400

    def test_create_null_color(self, client):
        r = _create(client, bag_color=None)
        assert r.status_code == 400

    def test_update_empty_color(self, client):
        r = _update(client, bag_color="   ")
        assert r.status_code == 400


# ---------- bags_per_pallet ----------
class TestBagsPerPallet:
    def test_create_zero_bags(self, client):
        r = _create(client, bags_per_pallet=0)
        assert r.status_code == 400
        assert "Bags per Pallet" in r.json()["detail"]

    def test_create_negative_bags(self, client):
        r = _create(client, bags_per_pallet=-5)
        assert r.status_code == 400

    def test_update_zero_bags(self, client):
        r = _update(client, bags_per_pallet=0)
        assert r.status_code == 400

    def test_update_negative_bags(self, client):
        r = _update(client, bags_per_pallet=-1)
        assert r.status_code == 400

    def test_create_decimal_bags_rejected(self, client):
        # Non-integer value is rejected by request parsing (422).
        r = _create(client, bags_per_pallet=5.5)
        assert r.status_code == 422

    def test_update_decimal_bags_rejected(self, client):
        r = _update(client, bags_per_pallet=10.7)
        assert r.status_code == 422


# ---------- weight_per_bag ----------
class TestWeightPerBag:
    def test_create_zero_weight(self, client):
        r = _create(client, weight_per_bag=0)
        assert r.status_code == 400
        assert "Weight per Bag" in r.json()["detail"]

    def test_create_negative_weight(self, client):
        r = _create(client, weight_per_bag=-3.2)
        assert r.status_code == 400

    def test_update_zero_weight(self, client):
        r = _update(client, weight_per_bag=0)
        assert r.status_code == 400

    def test_update_negative_weight(self, client):
        r = _update(client, weight_per_bag=-1.0)
        assert r.status_code == 400


# ---------- dimensions ----------
class TestDimensions:
    def test_create_empty_dimensions(self, client):
        r = _create(client, dimensions="")
        assert r.status_code == 400
        assert "Dimensions" in r.json()["detail"]

    def test_create_whitespace_dimensions(self, client):
        r = _create(client, dimensions="   ")
        assert r.status_code == 400

    def test_create_null_dimensions(self, client):
        r = _create(client, dimensions=None)
        assert r.status_code == 400

    def test_update_empty_dimensions(self, client):
        r = _update(client, dimensions="")
        assert r.status_code == 400
