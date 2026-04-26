import logging
from contextlib import asynccontextmanager

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
from app.database import Base, engine, get_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _bootstrap_db() -> None:
    """Idempotent DB bootstrap: PostGIS extension + tables.

    Safe to run on every process start. Failures are logged but don't crash
    the service — the readiness probe will surface DB problems separately.
    """
    # Step 1: PostGIS extension. Without it, GeoAlchemy2 columns fail at create_all.
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            conn.commit()
        logger.info("DB bootstrap: PostGIS extension OK")
    except Exception as exc:
        logger.warning("DB bootstrap: PostGIS extension failed (continuing): %s", exc)

    # Step 2: Register all model classes with metadata, then create tables.
    try:
        import app.models  # noqa: F401  (registers District, Facility, etc.)
        Base.metadata.create_all(bind=engine)
        logger.info("DB bootstrap: tables ensured")
    except Exception as exc:
        logger.error("DB bootstrap: create_all failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """FastAPI lifespan: bootstrap DB on startup."""
    _bootstrap_db()
    yield


app = FastAPI(
    title="AQYL CITY API",
    description=(
        "AQYL CITY — Smart City Intelligence Platform для Алматы. "
        "Три режима: общественный, бизнес, экологический. "
        "AI-помощник, AI-отчёты и симулятор what-if для градостроительных решений."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: explicit origins from env + regex-fallback for any *.onrender.com host.
# This is intentional: on free Render the frontend URL can vary, and we don't
# want a single typo in the env to break the app. We never use credentials.
_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_origins = list({*_cors_origins, *_default_origins})
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"^https://[a-z0-9-]+\.onrender\.com$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)
logger.info("CORS allow_origins=%s + regex=*.onrender.com", _origins)

app.include_router(router, prefix="/api/v1")
app.include_router(business_router, prefix="/api/v1")
app.include_router(eco_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(simulator_router, prefix="/api/v1")
app.include_router(plan_router, prefix="/api/v1")
app.include_router(eco_advanced_router, prefix="/api/v1")
app.include_router(public_advanced_router, prefix="/api/v1")
app.include_router(futures_router, prefix="/api/v1")


from fastapi import Request
from fastapi.responses import JSONResponse


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    """Global 500 handler that ALWAYS includes CORS headers.

    By default, FastAPI's CORSMiddleware does not run on unhandled exceptions
    in some edge cases (depending on event loop state). Browsers then see a
    'No Access-Control-Allow-Origin' error masking the real 500. Instead we
    catch every uncaught exception, log it, and return JSON with the right
    Origin echoed back.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    origin = request.headers.get("origin", "*")
    headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
        "Vary": "Origin",
    }
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "type": exc.__class__.__name__,
            "detail": str(exc)[:300],
            "path": request.url.path,
        },
        headers=headers,
    )


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


@app.get("/debug")
def debug_info(db: Session = Depends(get_db)):
    """Sanitized runtime state — for diagnostics. Does not leak secrets."""
    import os

    db_url = settings.database_url
    # Mask credentials
    if "@" in db_url:
        prefix, rest = db_url.rsplit("@", 1)
        if "//" in prefix:
            scheme_user = prefix.split("//", 1)[0] + "//"
            db_url_masked = f"{scheme_user}***:***@{rest}"
        else:
            db_url_masked = f"***@{rest}"
    else:
        db_url_masked = "(local-no-creds)"

    out = {
        "cors_origins_env": settings.cors_origins,
        "cors_parsed": _origins,
        "cors_regex": r"^https://[a-z0-9-]+\.onrender\.com$",
        "openai_key_set": bool(settings.openai_api_key or os.getenv("OPENAI_API_KEY")),
        "openai_model": settings.openai_model,
        "database_url_masked": db_url_masked,
        "tables": [],
        "row_counts": {},
    }
    try:
        # Inspect tables and row counts
        from sqlalchemy import inspect
        inspector = inspect(db.bind)
        out["tables"] = sorted(inspector.get_table_names())
        for tbl in ("districts", "facilities", "population_stats", "businesses"):
            if tbl in out["tables"]:
                cnt = db.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                out["row_counts"][tbl] = int(cnt or 0)
    except Exception as exc:
        out["db_error"] = str(exc)[:200]
    return out
