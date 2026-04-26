"""API маршруты экологического режима AQYL CITY."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.eco_analytics import (
    DISTRICT_BASELINE_AQI, get_city_eco, get_district_eco,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/eco")


@router.get("/overview")
def eco_overview(db: Session = Depends(get_db)):
    """Полная экологическая сводка по городу. Defensive: empty shape on failure."""
    try:
        return get_city_eco(db)
    except Exception as e:
        logger.exception("/eco/overview failed: %s", e)
        from app.services.eco_analytics import GREEN_NORM_M2, categorize_aqi
        cat = categorize_aqi(0)
        return {
            "total_population": 0,
            "city_aqi": 0,
            "city_aqi_category": {
                "level": cat.level, "label": cat.label_ru,
                "color": cat.color, "advice": cat.advice,
            },
            "city_green_m2_per_capita": 0,
            "city_green_norm": GREEN_NORM_M2,
            "city_eco_score": 0,
            "districts": [],
            "ranking": [],
            "top_issues": [],
            "updated_at": "",
            "error": f"db_unavailable: {e.__class__.__name__}",
        }


@router.get("/districts/{name}")
def district_eco(name: str, db: Session = Depends(get_db)):
    """Экологический профиль конкретного района."""
    if name not in DISTRICT_BASELINE_AQI:
        raise HTTPException(404, "district_not_found")
    try:
        return get_district_eco(db, name)
    except Exception as e:
        logger.exception("/eco/districts/%s failed: %s", name, e)
        raise HTTPException(503, f"db_unavailable: {e.__class__.__name__}")


@router.get("/districts")
def list_eco_districts():
    """Названия районов с baseline AQI (для UI-селектора)."""
    return [{"name": n, "baseline_aqi": a} for n, a in DISTRICT_BASELINE_AQI.items()]
