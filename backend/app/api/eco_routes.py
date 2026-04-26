"""API маршруты экологического режима AQYL CITY."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.eco_analytics import (
    DISTRICT_BASELINE_AQI, get_city_eco, get_district_eco,
)

router = APIRouter(prefix="/eco")


@router.get("/overview")
def eco_overview(db: Session = Depends(get_db)):
    """Полная экологическая сводка по городу."""
    return get_city_eco(db)


@router.get("/districts/{name}")
def district_eco(name: str, db: Session = Depends(get_db)):
    """Экологический профиль конкретного района."""
    if name not in DISTRICT_BASELINE_AQI:
        raise HTTPException(404, "district_not_found")
    return get_district_eco(db, name)


@router.get("/districts")
def list_eco_districts():
    """Названия районов с baseline AQI (для UI-селектора)."""
    return [{"name": n, "baseline_aqi": a} for n, a in DISTRICT_BASELINE_AQI.items()]
