# Warehouse Management System (WMS)

## Overview
A full-stack Warehouse Management System optimized for cold-storage facilities. Features inventory tracking, inbound/outbound logistics, storage layout visualization, and AI-powered reporting.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI, running on port 5000 via CRACO
- **Backend**: FastAPI (Python) on port 8000 (proxied through frontend dev server)
- **Database**: MongoDB running locally on port 27017

## How to Run
The `start.sh` script handles startup in order:
1. Starts MongoDB (data stored in `/tmp/mongodb/data`)
2. Starts FastAPI backend on `localhost:8000`
3. Starts React frontend on `0.0.0.0:5000` with proxy to backend

## Default Credentials
- Admin: admin@wms.com / Admin123!
- Manager: manager@wms.com / Manager123!
- Operator: operator@wms.com / Operator123!

## Environment Variables
Set via Replit secrets/env vars:
- `MONGO_URL`: MongoDB connection string (default: mongodb://localhost:27017)
- `DB_NAME`: Database name (default: wms_db)
- `JWT_SECRET`: JWT signing secret
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: Admin seed user
- `MANAGER_EMAIL`, `MANAGER_PASSWORD`: Manager seed user
- `OPERATOR_EMAIL`, `OPERATOR_PASSWORD`: Operator seed user
- `CORS_ORIGINS`: Allowed CORS origins (default: *)
- `EMERGENT_LLM_KEY`: API key for AI insights feature (optional)

## Key Features
- Cold Storage Layout: COLD-1 drive-in racking system with bin-level traceability
- FEFO Picking: First-Expired, First-Out logic for outbound picking
- Blueprint AI: PDF blueprint upload with LLM-powered zone provisioning
- Traceability: Pallet tracking with batch numbers and expiry dates

## User Preferences
- Use existing project conventions and structure
