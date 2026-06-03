#!/bin/bash
set -e

# Post-merge setup for the WMS project.
# Idempotent + non-interactive: installs backend and frontend dependencies so
# that any packages added by a merged task are present. The database schema is
# applied automatically on FastAPI startup (init_db), so no migration step here.

echo "Installing backend dependencies..."
pip install -r backend/requirements.txt -q --disable-pip-version-check

echo "Installing frontend dependencies..."
cd frontend
npm install --legacy-peer-deps --no-audit --no-fund

echo "Post-merge setup complete."
