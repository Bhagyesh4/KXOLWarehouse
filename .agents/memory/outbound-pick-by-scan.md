---
name: Outbound pick-by-scan
description: How scanning inbounded pallet barcodes drives outbound picking, and what it does/doesn't touch in the inventory model
---

# Outbound pick-by-scan

Scanning an inbounded pallet barcode picks an outbound order toward packing.

- Picks are recorded in their own `outbound_picks` table (audit + dedupe via UNIQUE(outbound_id, barcode)), NOT as a denormalized column on outbound_items. Per-line `picked_qty` is computed on read by allocating the SKU-level picked total across that SKU's order lines in turn.
- A barcode is only "pickable" when the pallet is actually in the warehouse: live `stock.pallet_code` with qty>0, OR an `inbound_items.barcode` whose parent inbound `status='completed'` (received). Unreceived/pending inbounds resolve as unknown.
- First successful scan moves the order pending→picking; when every line is fully picked the order auto-advances to packing.

**Why:** "Scan inbounded pallet to pick for packing" should reflect physical reality — you can't pick goods that haven't been received yet.

**How to apply:** Stock depletion is deliberately unchanged — it still happens only at the packing→shipped advance (FEFO/any-stock), not at pick-scan. pick-scan locks the outbound row `FOR UPDATE` to serialize concurrent scans and prevent status regression. If you later make picking deduct stock per-pallet, you must remove/adjust the depletion at shipping to avoid double-counting.
