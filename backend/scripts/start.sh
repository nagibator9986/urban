#!/bin/sh
# Render startup: create PostGIS extension + tables, then launch uvicorn.
# Idempotent — safe to run on every deploy.

set -e

echo "[start] Bootstrapping DB schema (idempotent)..."
python - <<'PY'
import os
import sys

from sqlalchemy import create_engine, text

url = os.environ.get("DATABASE_URL")
if not url:
    print("[start] DATABASE_URL not set — skipping bootstrap")
    sys.exit(0)

# Render Postgres often needs sslmode=require
if "sslmode" not in url and url.startswith("postgresql://"):
    sep = "&" if "?" in url else "?"
    url = f"{url}{sep}sslmode=require"

engine = create_engine(url)
with engine.connect() as conn:
    # PostGIS extension (no-op if exists). Render PostgreSQL supports it.
    try:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.commit()
        print("[start] PostGIS extension OK")
    except Exception as e:
        print(f"[start] PostGIS extension warning: {e}")

# Now create tables via SQLAlchemy metadata (no alembic migrations yet).
# This is safe — only adds missing tables/columns.
from app.database import Base, engine as app_engine  # noqa: E402
import app.models  # noqa: F401, E402  (registers models with metadata)

Base.metadata.create_all(bind=app_engine)
print("[start] Tables ensured via SQLAlchemy metadata")
PY

PORT="${PORT:-8000}"
echo "[start] Launching uvicorn on 0.0.0.0:${PORT}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1 --log-level info
