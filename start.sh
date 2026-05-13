#!/bin/bash

# Install backend dependencies
echo "Installing backend dependencies..."
pip install -r /home/runner/workspace/backend/requirements.txt -q --disable-pip-version-check

# Start the FastAPI backend in background
echo "Starting backend..."
cd /home/runner/workspace/backend
python3 -m uvicorn server:app --host 127.0.0.1 --port 8000 &

cd /home/runner/workspace

# Wait for backend to be ready
echo "Waiting for backend..."
for i in $(seq 1 60); do
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
