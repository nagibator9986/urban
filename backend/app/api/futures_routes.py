"""Болашақ — City Futures Constructor API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.futures_advanced import (
    answer_question,
    compare_many_scenarios,
    compare_scenarios,
    explain_slider,
    get_param_meta,
    optimize_scenario,
    sensitivity_analysis,
)
from app.services.futures_ai import get_analysis
from app.services.futures_model import FuturesScenario, PRESETS, run_forecast


router = APIRouter(prefix="/futures")


class ScenarioModel(BaseModel):
    horizon_years: int = Field(10, ge=3, le=25)
    name: str = "custom"
    birth_rate_multiplier: float = Field(1.0, ge=0.5, le=2.0)
    migration_multiplier: float = Field(1.0, ge=0.0, le=3.0)
    death_rate_multiplier: float = Field(1.0, ge=0.7, le=1.5)
    school_build_rate: float = Field(1.0, ge=0.0, le=5.0)
    kindergarten_build_rate: float = Field(1.0, ge=0.0, le=5.0)
    clinic_build_rate: float = Field(1.0, ge=0.0, le=5.0)
    pharmacy_build_rate: float = Field(1.0, ge=0.0, le=5.0)
    park_build_rate: float = Field(1.0, ge=0.0, le=5.0)
    transport_build_rate: float = Field(1.0, ge=0.0, le=5.0)
    new_apartments_per_year: int = Field(25_000, ge=0, le=200_000)
    auto_growth_rate: float = Field(0.04, ge=-0.05, le=0.15)
    gas_conversion_target: float = Field(0.40, ge=0.0, le=1.0)
    brt_coverage_target: float = Field(0.50, ge=0.0, le=1.0)
    green_growth_rate: float = Field(0.010, ge=-0.02, le=0.10)
    income_growth_per_year: float = Field(0.05, ge=-0.05, le=0.20)


@router.get("/presets")
def list_presets():
    """Готовые сценарии."""
    out = []
    for key, s in PRESETS.items():
        d = {"key": key}
        for field_name in s.__dataclass_fields__:
            d[field_name] = getattr(s, field_name)
        out.append(d)
    return {"presets": out}


@router.get("/params/meta")
def params_meta():
    """Метаданные параметров: label, tip, min/max, baseline — для UI."""
    return get_param_meta()


@router.post("/forecast")
def forecast(req: ScenarioModel, db: Session = Depends(get_db)):
    """Прогноз по сценарию."""
    scenario = FuturesScenario(**req.model_dump())
    return run_forecast(db, scenario)


@router.post("/analyze")
def analyze(req: ScenarioModel, db: Session = Depends(get_db)):
    """Прогноз + AI-меморандум."""
    scenario = FuturesScenario(**req.model_dump())
    forecast_data = run_forecast(db, scenario)
    ai = get_analysis(forecast_data)
    return {**forecast_data, "ai_analysis": ai}


class PresetRequest(BaseModel):
    preset_key: str


@router.post("/preset-forecast")
def preset_forecast(req: PresetRequest, db: Session = Depends(get_db)):
    """Быстрый прогноз по готовому пресету."""
    if req.preset_key not in PRESETS:
        raise HTTPException(404, f"Unknown preset: {req.preset_key}")
    scenario = PRESETS[req.preset_key]
    return run_forecast(db, scenario)


# ------------------------------------------------------------------
# Advanced endpoints
# ------------------------------------------------------------------

class CompareRequest(BaseModel):
    a: ScenarioModel
    b: ScenarioModel


@router.post("/compare")
def compare(req: CompareRequest, db: Session = Depends(get_db)):
    """Прогонит два сценария и вернёт их прогнозы + дельты для A/B."""
    sa = FuturesScenario(**req.a.model_dump())
    sb = FuturesScenario(**req.b.model_dump())
    return compare_scenarios(db, sa, sb)


class CompareManyRequest(BaseModel):
    scenarios: list[ScenarioModel] = Field(..., min_length=2, max_length=4)
    labels: list[str] | None = None


@router.post("/compare-many")
def compare_many(req: CompareManyRequest, db: Session = Depends(get_db)):
    """Сравнение 2-4 сценариев (расширение /compare)."""
    if req.labels is not None and len(req.labels) != len(req.scenarios):
        raise HTTPException(400, "labels length must match scenarios length")
    scenarios = [FuturesScenario(**s.model_dump()) for s in req.scenarios]
    try:
        return compare_many_scenarios(db, scenarios, req.labels)
    except ValueError as e:
        raise HTTPException(400, str(e))


class SensitivityRequest(BaseModel):
    scenario: ScenarioModel
    delta: float = Field(0.10, ge=0.02, le=0.50)


@router.post("/sensitivity")
def sensitivity(req: SensitivityRequest, db: Session = Depends(get_db)):
    """Sensitivity-анализ: ±delta по каждому параметру, возвращает ранжир рычагов."""
    scenario = FuturesScenario(**req.scenario.model_dump())
    return sensitivity_analysis(db, scenario, req.delta)


class OptimizeGoal(BaseModel):
    target_score: float = Field(80, ge=30, le=100)
    target_aqi: float = Field(100, ge=20, le=300)
    target_infra: float = Field(90, ge=30, le=100)
    target_eco: float = Field(70, ge=20, le=100)
    weight_score: float = Field(0.5, ge=0.0, le=1.0)
    weight_aqi: float = Field(0.2, ge=0.0, le=1.0)
    weight_infra: float = Field(0.2, ge=0.0, le=1.0)
    weight_eco: float = Field(0.1, ge=0.0, le=1.0)


class OptimizeRequest(BaseModel):
    scenario: ScenarioModel
    goal: OptimizeGoal
    iterations: int = Field(24, ge=8, le=60)


@router.post("/optimize")
def optimize(req: OptimizeRequest, db: Session = Depends(get_db)):
    """Goal-seeking: random search находит параметры, максимизирующие fitness под цель."""
    scenario = FuturesScenario(**req.scenario.model_dump())
    return optimize_scenario(
        db, scenario, req.goal.model_dump(), iterations=req.iterations,
    )


class ForecastChatRequest(BaseModel):
    forecast: dict
    question: str = Field(..., min_length=1, max_length=500)


@router.post("/chat")
def chat_about_forecast(req: ForecastChatRequest):
    """Q&A: AI отвечает на вопрос, опираясь на уже посчитанный прогноз."""
    return answer_question(req.forecast, req.question)


class SliderExplainRequest(BaseModel):
    param_key: str
    current_value: float
    baseline_value: float
    horizon_years: int = Field(10, ge=3, le=25)


@router.post("/explain-slider")
def explain_slider_endpoint(req: SliderExplainRequest):
    """AI-объяснение что случится при изменении параметра от baseline."""
    return explain_slider(
        req.param_key, req.current_value, req.baseline_value, req.horizon_years,
    )
