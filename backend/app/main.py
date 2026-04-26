import logging

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes import router
from app.api.business_routes import router as business_router
from app.api.eco_routes import router as eco_router
from app.api.ai_routes import router as ai_router
from app.api.simulator_routes import router as simulator_router
from app.api.plan_routes import router as plan_router
from app.api.eco_advanced_routes import router as eco_advanced_router
from app.api.public_advanced_routes import router as public_advanced_router
from app.api.futures_routes import router as futures_router
from app.config import settings
from app.database import get_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AQYL CITY API",
    description=(
        "AQYL CITY — Smart City Intelligence Platform для Алматы. "
        "Три режима: общественный, бизнес, экологический. "
        "AI-помощник, AI-отчёты и симулятор what-if для градостроительных решений."
    ),
    version="1.0.0",
)

# CORS: read explicit origins from env; strip whitespace, drop empties.
_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
    max_age=600,
)

app.include_router(router, prefix="/api/v1")
app.include_router(business_router, prefix="/api/v1")
app.include_router(eco_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(simulator_router, prefix="/api/v1")
app.include_router(plan_router, prefix="/api/v1")
app.include_router(eco_advanced_router, prefix="/api/v1")
app.include_router(public_advanced_router, prefix="/api/v1")
app.include_router(futures_router, prefix="/api/v1")


@app.get("/health")
def health():
    """Liveness probe — does not touch the DB."""
    return {"status": "ok", "product": "AQYL CITY", "version": "1.0.0"}


@app.get("/health/ready")
def ready(db: Session = Depends(get_db)):
    """Readiness probe — verifies the DB is reachable."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        logger.error("Readiness DB check failed: %s", exc)
        raise HTTPException(status_code=503, detail="database_unavailable")
