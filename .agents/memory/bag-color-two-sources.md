---
name: Bag color has two sources (SKU default vs per-inbound actual)
description: Where bag_color lives in the WMS data model and which one display logic must prefer
---

Bag color now exists in two places, and they mean different things:
- `skus.bag_color` — the SKU's *default/expected* bag color (OPTIONAL at SKU create/update; blank/whitespace normalises to NULL, and the startup backfill deliberately does NOT fill it).
- `inbound_items.bag_color` — the *actual* color captured per line during the Create Purchase Order (inbound) flow. Optional; defaults from the SKU in the UI but can be overridden per receipt.

**Why:** the same SKU can be received in different bag colors per shipment, so the truth for a given receipt is the inbound item, not the SKU.

**How to apply:** any per-item display (inbound cards, GRN, and any future outbound/stock/reports surfaces) must prefer the item-level `bag_color` and fall back to the SKU default (`it.bag_color || it.sku?.bag_color`). Backend validates inbound `bag_color` against `BAG_COLORS` and is wrapped in a single transaction so a bad color never leaves an orphan `inbound` header. Shared hex map across pages: Green #22c55e, White #e5e7eb, Yellow #eab308 (unknown → #6b7280).

**Stock now carries actual color:** receiving propagates the line's `bag_color` (fallback SKU default) onto `stock.bag_color`, and the stock dedup match key is `(sku_id, location_id, bag_color)` so different colors at one SKU/location stay separate rows. The Inventory Master "by bag color" breakdown is driven by actual stock via `GET /inventory/stock-by-color` (grouped by sku+color), NOT the SKU default. Outbound/FEFO depletion is unchanged (does not consider color). Legacy stock is backfilled on startup only when the candidate inbound lines agree on a single color (else left NULL → Unspecified).
