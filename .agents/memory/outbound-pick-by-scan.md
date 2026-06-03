---
name: Outbound pick-by-scan
description: How scanning inbounded pallet barcodes drives outbound picking, and what it does/doesn't touch in the inventory model
---

# Outbound pick-by-scan

Scanning an inbounded pallet barcode picks an outbound order toward packing.

- A barcode is only "pickable" when the pallet is physically in the warehouse: live `stock.pallet_code` (qty>0) or an inbound line whose order has been received. Unreceived/pending inbounds must resolve as unknown.
- **Why:** "scan inbounded pallet to pick" should mirror physical reality — you cannot pick goods that haven't been received yet.
- Stock depletion is deliberately unchanged: it still happens only at the packing→shipped advance (FEFO/any-stock), NOT at pick-scan. **How to apply:** if picking is ever made to deduct stock per-pallet, remove/adjust the depletion at shipping to avoid double-counting.
