# WMS — Warehouse Management System

## Original Problem Statement
Build a Warehouse Management System with modules: Dashboard, Inventory Master, Inbound, Outbound, Warehouse Storage, Reports & Analytics.

## User Choices
- **Auth**: Custom JWT auth with roles (Admin, Manager, Operator)
- **Demo data**: Pre-filled cold-storage SKUs and transactions
- **Reports**: AI-powered insights via Claude Sonnet 4.5
- **Design**: Modern industrial dashboard (dark sidebar, amber accent, IBM Plex + JetBrains Mono)
- **Barcode**: react-barcode for SKU display
- **Storage layout**: Modeled per uploaded "COLD 1 RECKING SYSTEM" blueprint (drive-in cold racking, -20°C, LIFO)

## Architecture

### Backend (FastAPI + MongoDB)
- `/app/backend/server.py` — single-file API, schema versioned via `app_meta.schema = 2`
- Collections: `users`, `skus`, `locations`, `stock`, `movements`, `inbound`, `outbound`, `zones_meta`, `app_meta`
- All IDs are UUID strings; MongoDB `_id` excluded from responses
- Bcrypt password hashing, JWT (PyJWT, HS256), Bearer token via Authorization header (also sets cookie)
- Claude Sonnet 4.5 via `emergentintegrations` for AI insights

### Frontend (React + Tailwind + Shadcn)
- AuthContext with localStorage Bearer token
- Layout with fixed dark sidebar
- Pages: Login, Register, Dashboard, Inventory, Inbound, Outbound, Storage, Reports
- Recharts for analytics; react-barcode for SKU display

## Implemented (as of 2026-05-07)

### Iteration 1 (2026-04-30)
- Auth: register/login/logout/me with 3 roles, role-based access control
- Inventory Master: CRUD with categories, status badges, barcode display
- Inbound: PO list (pending/completed), receive flow that increments stock
- Outbound: 4-stage kanban (pending → picking → packing → shipped) with stock decrement on ship
- Warehouse Storage: zone summary + bin-level heatmap (initial generic 4-zone × 5-rack × 6-bin)
- Dashboard: KPIs + 14-day movement chart + recent activity feed
- Reports: top-SKUs bar chart, category pie chart, AI insights via Claude
- 25 demo SKUs (industrial parts), 8 inbound POs, 10 outbound SOs, ~60 movements

### Iteration 2 (2026-05-07) — COLD 1 Blueprint Refactor
- Schema v2: replaced 4-zone generic storage with **COLD-1** drive-in racking layout per blueprint
- 39 lanes split: Row A (13 × Type A, 16 slots/lane), Row B (11 × Type B, 12 slots/lane), Row C (15 × Type C, 20 slots/lane) = **640 total pallet slots**
- Bin code: `COLD1-{row}-L{lane}-LV{level}-P{pos}` (e.g. `COLD1-A-L26-LV1-P01`)
- 3 placeholder zones (COLD-2 -18°C, COLD-3 -22°C, AMBIENT 22°C) with "Awaiting blueprint" UI
- Switched units to **pallet-based** (1 slot = 1 pallet)
- Replaced industrial SKUs with **25 cold-storage SKUs** (frozen meat, seafood, dairy, ice cream, vegetables, fruits, bakery, ready meals, processed)
- New Storage UI: drive-in lane visualization with 4-level horizontal strips, aisle-entry indicator, lane drawer with rack type/levels/depth/weight/contents
- New endpoint `/api/storage/lanes/{row}/{lane}/contents` for single-call lane inspection
- AI insights now cold-chain aware (LIFO violations, perishability)

## Test Credentials
See `/app/memory/test_credentials.md`

## Backlog / Next Tasks (P0 → P2)
- **P1** — Upload blueprint UI to provision additional zones (COLD-2/COLD-3/AMBIENT)
- **P1** — Pallet-level traceability (received-date, expiry-date, batch/lot numbers for cold chain compliance)
- **P2** — Temperature monitoring log per zone with alerts
- **P2** — FIFO suggestion engine when picking from drive-in (oldest pallet first based on inbound timestamp)
- **P2** — Customer/Supplier master tables with CRUD
- **P2** — Print pick lists and goods-receipt notes (PDF export)
- **P2** — Mobile-friendly scanner mode (camera-based barcode scanning)

## API Surface
Auth: `/api/auth/{register,login,logout,me}`
Inventory: `/api/inventory/{skus,categories,skus/:id/stock}`
Storage: `/api/storage/{locations,zones,lanes,lanes/:row/:lane/contents}`
Inbound: `/api/inbound`, `/api/inbound/:id/receive`
Outbound: `/api/outbound`, `/api/outbound/:id/advance`
Dashboard: `/api/dashboard/{summary,movements}`
Reports: `/api/reports/{top-skus,category-distribution,ai-insights}`
