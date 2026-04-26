#!/bin/bash
set -e

echo "=== Almaty Urban Analytics — Setup ==="

# 1. Start PostgreSQL + PostGIS
echo "Starting PostgreSQL with PostGIS..."
docker compose up -d db
sleep 3

# 2. Install backend dependencies
echo "Installing backend dependencies..."
cd backend
pip install -r requirements.txt

# 3. Create tables
echo "Creating database tables..."
python -c "from app.database import Base, engine; from app.models import *; Base.metadata.create_all(bind=engine)"

# 4. Collect data
echo "Collecting data from all sources (this takes ~3-5 minutes)..."
python -m app.collectors.run_all

echo "=== Backend ready! Run: uvicorn app.main:app --reload --port 8000 ==="

# 5. Install frontend dependencies
cd ../frontend
echo "Installing frontend dependencies..."
npm install

echo "=== Frontend ready! Run: npm run dev ==="
echo ""
echo "Open http://localhost:5173 in your browser"
