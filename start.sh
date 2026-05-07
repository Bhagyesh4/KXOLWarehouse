#!/bin/bash

# Start MongoDB
mkdir -p /tmp/mongodb/data /tmp/mongodb/log
mongod --dbpath /tmp/mongodb/data --logpath /tmp/mongodb/log/mongod.log --fork --bind_ip 127.0.0.1 --port 27017 2>&1 || true

# Wait for MongoDB to be ready using Python TCP check
echo "Waiting for MongoDB..."
for i in $(seq 1 30); do
    python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1', 27017)); s.close()" 2>/dev/null && echo "MongoDB ready!" && break
    sleep 1
done

# Start the FastAPI backend in background
echo "Starting backend..."
cd /home/runner/workspace/backend
MONGO_URL=mongodb://localhost:27017 DB_NAME=wms_db JWT_SECRET=wms-super-secret-jwt-key-2024 \
    ADMIN_EMAIL=admin@wms.com ADMIN_PASSWORD=Admin123! \
    MANAGER_EMAIL=manager@wms.com MANAGER_PASSWORD=Manager123! \
    OPERATOR_EMAIL=operator@wms.com OPERATOR_PASSWORD=Operator123! \
    CORS_ORIGINS="*" \
    python3 -m uvicorn server:app --host 127.0.0.1 --port 8000 &

cd /home/runner/workspace

# Wait for backend to be ready
echo "Waiting for backend..."
for i in $(seq 1 30); do
    python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1', 8000)); s.close()" 2>/dev/null && echo "Backend ready!" && break
    sleep 1
done

# Start port 3000 → 5000 proxy so external domain (externalPort=80→localPort=3000) works
echo "Starting port 3000 proxy..."
node /home/runner/workspace/proxy3000.js &

# Start the frontend on port 5000
echo "Starting frontend..."
cd /home/runner/workspace/frontend
PORT=5000 REACT_APP_BACKEND_URL="" BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true yarn start
