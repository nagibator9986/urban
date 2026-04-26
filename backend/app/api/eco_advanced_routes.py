"""Расширенный API эко-режима: прогноз, health impact, source attribution,
window advisor, персональный AI-бриф, health-risk калькулятор, карта источников,
прогноз инверсий, сравнение с городами мира."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.eco_analytics import DISTRICT_BASELINE_AQI
from app.services.eco_cities_compare import compare_cities
from app.services.eco_forecast import forecast_city, forecast_district
from app.services.eco_health import health_impact, source_attribution, window_advisor
from app.services.eco_health_risk import (
    HealthRiskInput, compute_health_risk, form_meta,
)
from app.services.eco_inversion import fetch_inversion_forecast
from app.services.eco_personal import Persona, personal_brief
from app.services.eco_sources_map import fetch_sources_map


router = APIRouter(prefix="/eco")


@router.get("/forecast/{name}")
def forecast_by_district(name: str, hours: int = Query(72, ge=24, le=120)):
    if name not in DISTRICT_BASELINE_AQI:
        raise HTTPException(404, "district_not_found")
    return forecast_district(name, hours)


@router.get("/forecast")
def forecast_by_city(hours: int = Query(72, ge=24, le=120)):
    return forecast_city(hours)


@router.get("/health-impact/{name}")
def health_impact_endpoint(name: str):
    r = health_impact(name)
    if "error" in r:
        raise HTTPException(404, r["error"])
    return r


@router.get("/sources/{name}")
def sources_endpoint(name: str):
    r = source_attribution(name)
    if "error" in r:
        raise HTTPException(404, r["error"])
    return r


@router.get("/windows/{name}")
def window_advisor_endpoint(name: str):
    r = window_advisor(name)
    if "error" in r:
        raise HTTPException(404, r["error"])
    return r


class PersonaRequest(BaseModel):
    district: str
    age_group: str = Field("adult", pattern="^(child|teen|adult|senior)$")
    conditions: list[str] = Field(default_factory=list)
    activities: list[str] = Field(default_factory=list)
    commute: str = Field("public", pattern="^(car|public|walk|bike|none)$")
    smoker: bool = False
    has_purifier: bool = False


@router.post("/personal-brief")
def personal_brief_endpoint(req: PersonaRequest, db: Session = Depends(get_db)):
    if req.district not in DISTRICT_BASELINE_AQI:
        raise HTTPException(404, "district_not_found")
    p = Persona(
        district=req.district,
        age_group=req.age_group,  # type: ignore[arg-type]
        conditions=req.conditions,
        activities=req.activities,
        commute=req.commute,      # type: ignore[arg-type]
        smoker=req.smoker,
        has_purifier=req.has_purifier,
    )
    return personal_brief(db, p)


# ------------------------------------------------------------------
# Health risk calculator (deterministic, dose-response)
# ------------------------------------------------------------------

@router.get("/health-risk/meta")
def health_risk_meta():
    """Метаданные для UI-формы калькулятора."""
    return form_meta()


class HealthRiskRequest(BaseModel):
    district: str
    age_group: str = Field("adult", pattern="^(child|teen|adult|senior)$")
    conditions: list[str] = Field(default_factory=list)
    activities: list[str] = Field(default_factory=list)
    commute: str = Field("public", pattern="^(car|public|walk|bike|none)$")
    smoker: bool = False
    has_purifier: bool = False
    wears_mask_n95: bool = False
    hours_outdoor_per_day: float = Field(2.0, ge=0.0, le=16.0)


@router.post("/health-risk")
def health_risk_endpoint(req: HealthRiskRequest):
    if req.district not in DISTRICT_BASELINE_AQI:
        raise HTTPException(404, "district_not_found")
    inp = HealthRiskInput(
        district=req.district,
        age_group=req.age_group,          # type: ignore[arg-type]
        conditions=req.conditions,
        activities=req.activities,
        commute=req.commute,               # type: ignore[arg-type]
        smoker=req.smoker,
        has_purifier=req.has_purifier,
        wears_mask_n95=req.wears_mask_n95,
        hours_outdoor_per_day=req.hours_outdoor_per_day,
    )
    return compute_health_risk(inp)


# ------------------------------------------------------------------
# Pollution sources map (OSM)
# ------------------------------------------------------------------

@router.get("/sources-map")
def sources_map_endpoint():
    """Карта источников загрязнения: ТЭЦ, промзоны, магистрали, АЗС, частный сектор."""
    return fetch_sources_map()


# ------------------------------------------------------------------
# Temperature inversion forecast (Open-Meteo)
# ------------------------------------------------------------------

@router.get("/inversion")
def inversion_forecast_endpoint(hours: int = Query(72, ge=24, le=168)):
    """Прогноз температурных инверсий на ближайшие часы (главная причина зимнего смога)."""
    return fetch_inversion_forecast(hours)


# ------------------------------------------------------------------
# Cities comparison (WHO AAP 2022)
# ------------------------------------------------------------------

@router.get("/compare-cities")
def compare_cities_endpoint(db: Session = Depends(get_db)):
    """Сравнение текущего AQI Алматы с городами мира (WHO AAP 2022)."""
    return compare_cities(db)
