"""Расширения Болашақ: сравнение сценариев, sensitivity-анализ, optimizer,
AI-Q&A по уже посчитанному прогнозу.

Все функции опираются на run_forecast из futures_model — без дублирования
физики модели.
"""

from __future__ import annotations

import json
import logging
import random
from dataclasses import asdict
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.services.ai_assistant import _get_client
from app.services.futures_model import FuturesScenario, run_forecast

logger = logging.getLogger(__name__)


# =====================================================================
# Метаданные параметров (для UI: labels, tooltips, реалистичные диапазоны)
# =====================================================================

PARAM_META: list[dict] = [
    {
        "key": "horizon_years", "group": "Горизонт", "label": "Горизонт прогноза",
        "unit": "лет", "min": 3, "max": 25, "step": 1, "baseline": 10, "kind": "int",
        "tip": "Насколько далеко в будущее мы моделируем. Короткие горизонты точнее, длинные — для стратегии.",
    },
    # Демография
    {
        "key": "migration_multiplier", "group": "Демография", "label": "Миграционный прирост",
        "unit": "×", "min": 0, "max": 2.5, "step": 0.05, "baseline": 1.0,
        "tip": "1.0 = текущие ~30К/год. 0 = миграция остановлена (маловероятно). 2.0 = удвоение (агрессивное привлечение).",
    },
    {
        "key": "birth_rate_multiplier", "group": "Демография", "label": "Рождаемость",
        "unit": "×", "min": 0.6, "max": 1.6, "step": 0.05, "baseline": 1.0,
        "tip": "1.0 = текущий показатель 18.5/1000. Снижение к 0.8 — европейский тренд. Рост к 1.3 — активная поддержка семей.",
    },
    {
        "key": "death_rate_multiplier", "group": "Демография", "label": "Смертность",
        "unit": "×", "min": 0.7, "max": 1.3, "step": 0.05, "baseline": 1.0,
        "tip": "Влияет на возрастную структуру. Улучшение медицины → 0.85, эко-катастрофа → 1.15.",
    },
    {
        "key": "new_apartments_per_year", "group": "Демография", "label": "Новых квартир/год",
        "unit": "шт", "min": 0, "max": 80_000, "step": 2500, "baseline": 25_000, "kind": "int",
        "tip": "Фактический ритм Алматы 2024 — ~25–30 тыс. кв./год. Даёт дополнительный прирост населения ~12% от числа квартир.",
    },
    # Инфра
    {
        "key": "school_build_rate", "group": "Инфра", "label": "Строительство школ",
        "unit": "×", "min": 0, "max": 4, "step": 0.1, "baseline": 1.0,
        "tip": "1.0 = 3.5 школы/год (как сейчас). 2.0 = удвоение ритма, нужно для догоняющего роста.",
    },
    {
        "key": "kindergarten_build_rate", "group": "Инфра", "label": "Строительство детсадов",
        "unit": "×", "min": 0, "max": 4, "step": 0.1, "baseline": 1.0,
        "tip": "1.0 = 9 садов/год. Для Алматы критично — дефицит мест уже существует.",
    },
    {
        "key": "clinic_build_rate", "group": "Инфра", "label": "Строительство поликлиник",
        "unit": "×", "min": 0, "max": 4, "step": 0.1, "baseline": 1.0,
        "tip": "1.0 = ~1.5 поликлиник/год. Чувствительно к старению населения.",
    },
    {
        "key": "pharmacy_build_rate", "group": "Инфра", "label": "Аптеки",
        "unit": "×", "min": 0, "max": 4, "step": 0.1, "baseline": 1.0,
        "tip": "Аптеки в основном коммерческие — рост пропорционален доходам и населению.",
    },
    {
        "key": "park_build_rate", "group": "Инфра", "label": "Парки и скверы",
        "unit": "×", "min": 0, "max": 5, "step": 0.1, "baseline": 1.0,
        "tip": "Ускорение создания парков. Напрямую влияет на эко-оценку и м²/чел.",
    },
    {
        "key": "transport_build_rate", "group": "Инфра", "label": "Транспорт · остановки",
        "unit": "×", "min": 0, "max": 3, "step": 0.1, "baseline": 1.0,
        "tip": "Темп расширения сети общественного транспорта (остановки, маршруты).",
    },
    # Эко
    {
        "key": "auto_growth_rate", "group": "Эко", "label": "Рост автопарка/год",
        "unit": "%", "min": -0.02, "max": 0.10, "step": 0.005, "baseline": 0.04, "percent": True,
        "tip": "Текущий рост ~4%/год. Отрицательное значение = сокращение автопарка (агрессивные меры).",
    },
    {
        "key": "gas_conversion_target", "group": "Эко", "label": "Газификация частного сектора",
        "unit": "%", "min": 0, "max": 1, "step": 0.05, "baseline": 0.40, "percent": True,
        "tip": "Цель по % частных домов, переведённых на газ к концу горизонта. Главный рычаг против зимнего смога.",
    },
    {
        "key": "brt_coverage_target", "group": "Эко", "label": "Покрытие BRT/LRT",
        "unit": "%", "min": 0, "max": 1, "step": 0.05, "baseline": 0.50, "percent": True,
        "tip": "Целевой % населения в радиусе 500 м от BRT/LRT к концу горизонта. Снижает авто-зависимость.",
    },
    {
        "key": "green_growth_rate", "group": "Эко", "label": "Прирост зелени/год",
        "unit": "%", "min": -0.01, "max": 0.05, "step": 0.005, "baseline": 0.010, "percent": True,
        "tip": "Темп роста м²/чел зелёных насаждений. Текущий ~0.3% — очень медленно.",
    },
    # Экономика
    {
        "key": "income_growth_per_year", "group": "Экономика", "label": "Рост реальных доходов/год",
        "unit": "%", "min": -0.02, "max": 0.15, "step": 0.005, "baseline": 0.05, "percent": True,
        "tip": "Реальный (за вычетом инфляции) рост покупательной способности. Влияет на бизнес-ландшафт.",
    },
]

# Параметры, которые варьируются в sensitivity-анализе. horizon_years исключён
# (целочисленный, отдельная логика), death_rate — малозначимый.
_SENSITIVITY_PARAMS: list[str] = [
    "migration_multiplier",
    "birth_rate_multiplier",
    "new_apartments_per_year",
    "school_build_rate",
    "kindergarten_build_rate",
    "clinic_build_rate",
    "park_build_rate",
    "transport_build_rate",
    "auto_growth_rate",
    "gas_conversion_target",
    "brt_coverage_target",
    "green_growth_rate",
    "income_growth_per_year",
]


def get_param_meta() -> dict:
    return {"params": PARAM_META}


# =====================================================================
# Compare: два сценария бок о бок
# =====================================================================

def _summary(forecast: dict) -> dict:
    """Лёгкая сводка прогноза (без больших серий)."""
    return {
        "scenario_name": forecast["scenario_name"],
        "horizon_years": forecast["horizon_years"],
        "final_year": forecast["final_year"],
        "final_population": forecast["final_population"],
        "overall_future_score": forecast["overall_future_score"],
        "overall_grade": forecast["overall_grade"],
        "comparison_to_today": forecast["comparison_to_today"],
        "final_infra_score": forecast["infrastructure_series"][-1]["infra_score"],
        "final_aqi": forecast["eco_series"][-1]["aqi"],
        "final_eco_score": forecast["eco_series"][-1]["eco_score"],
        "final_green_m2": forecast["eco_series"][-1]["green_m2_per_capita"],
        "final_brt_coverage": forecast["eco_series"][-1]["brt_coverage_percent"],
        "final_dependency_ratio": forecast["population_series"][-1]["dependency_ratio"],
        "final_businesses": forecast["business_series"][-1]["estimated_businesses"],
        "final_market_gap": forecast["business_series"][-1]["market_gap"],
        "critical_points_count": len(forecast["critical_points"]),
        "critical_points": forecast["critical_points"][:5],
    }


def compare_scenarios(
    db: Session, scenario_a: FuturesScenario, scenario_b: FuturesScenario
) -> dict:
    """Прогоняет два сценария и возвращает обе полных проекции + дельты."""
    a = run_forecast(db, scenario_a)
    b = run_forecast(db, scenario_b)

    # Год-к-году дельты ключевых метрик (для side-by-side графиков)
    years = [p["year"] for p in a["population_series"]]
    by_year = []
    min_len = min(len(a["population_series"]), len(b["population_series"]))
    for i in range(min_len):
        ay_i = a["infrastructure_series"][i]
        by_i = b["infrastructure_series"][i]
        ae_i = a["eco_series"][i]
        be_i = b["eco_series"][i]
        ap_i = a["population_series"][i]
        bp_i = b["population_series"][i]
        by_year.append({
            "year": years[i],
            "a_population": ap_i["population"],
            "b_population": bp_i["population"],
            "a_infra_score": ay_i["infra_score"],
            "b_infra_score": by_i["infra_score"],
            "a_aqi": ae_i["aqi"],
            "b_aqi": be_i["aqi"],
            "a_eco_score": ae_i["eco_score"],
            "b_eco_score": be_i["eco_score"],
        })

    return {
        "a": a,
        "b": b,
        "a_summary": _summary(a),
        "b_summary": _summary(b),
        "by_year": by_year,
        "deltas": {
            "score": round(b["overall_future_score"] - a["overall_future_score"], 1),
            "infra": round(
                b["infrastructure_series"][-1]["infra_score"]
                - a["infrastructure_series"][-1]["infra_score"], 1,
            ),
            "aqi": b["eco_series"][-1]["aqi"] - a["eco_series"][-1]["aqi"],
            "eco_score": round(
                b["eco_series"][-1]["eco_score"] - a["eco_series"][-1]["eco_score"], 1,
            ),
            "population": b["final_population"] - a["final_population"],
        },
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def compare_many_scenarios(
    db: Session, scenarios: list[FuturesScenario], labels: list[str] | None = None,
) -> dict:
    """Сравнение 2-4 сценариев. Возвращает все forecast'ы + by_year матрицу."""
    if not (2 <= len(scenarios) <= 4):
        raise ValueError("compare_many_scenarios requires 2..4 scenarios")
    labels = labels or [f"S{i+1}" for i in range(len(scenarios))]
    forecasts = [run_forecast(db, s) for s in scenarios]
    summaries = [_summary(f) for f in forecasts]

    # Build by_year matrix using shortest series
    min_len = min(len(f["population_series"]) for f in forecasts)
    by_year: list[dict] = []
    for i in range(min_len):
        row: dict = {"year": forecasts[0]["population_series"][i]["year"]}
        for label, f in zip(labels, forecasts):
            pp = f["population_series"][i]
            ii = f["infrastructure_series"][i]
            ee = f["eco_series"][i]
            row[f"{label}_population"] = pp["population"]
            row[f"{label}_infra_score"] = ii["infra_score"]
            row[f"{label}_aqi"] = ee["aqi"]
            row[f"{label}_eco_score"] = ee["eco_score"]
        by_year.append(row)

    # Pairwise deltas vs the first scenario as baseline
    base = forecasts[0]
    deltas: dict[str, dict] = {}
    for label, f in zip(labels[1:], forecasts[1:]):
        deltas[label] = {
            "score": round(f["overall_future_score"] - base["overall_future_score"], 1),
            "infra": round(
                f["infrastructure_series"][-1]["infra_score"]
                - base["infrastructure_series"][-1]["infra_score"], 1,
            ),
            "aqi": f["eco_series"][-1]["aqi"] - base["eco_series"][-1]["aqi"],
            "eco_score": round(
                f["eco_series"][-1]["eco_score"] - base["eco_series"][-1]["eco_score"], 1,
            ),
            "population": f["final_population"] - base["final_population"],
        }

    return {
        "labels": labels,
        "forecasts": forecasts,
        "summaries": summaries,
        "by_year": by_year,
        "deltas_vs_base": deltas,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# =====================================================================
# Sensitivity: какие рычаги сильнее всего двигают итоговый score?
# =====================================================================

def _perturb_scenario(base: FuturesScenario, key: str, delta: float) -> FuturesScenario:
    """Вернёт копию base с key изменённым на delta (мультипликативно для доли,
    аддитивно для ×-мультипликаторов)."""
    data = asdict(base)
    cur = data[key]
    if key == "new_apartments_per_year":
        data[key] = max(0, int(cur * (1 + delta)))
    elif key in ("auto_growth_rate", "green_growth_rate"):
        data[key] = cur + delta * 0.02    # абсолютный сдвиг
    elif key in ("gas_conversion_target", "brt_coverage_target"):
        data[key] = max(0.0, min(1.0, cur + delta * 0.1))
    else:
        data[key] = max(0.0, cur * (1 + delta))
    return FuturesScenario(**data)


def sensitivity_analysis(db: Session, scenario: FuturesScenario, delta: float = 0.10) -> dict:
    """Измеряет, насколько меняется final overall_score при ±delta по каждому
    параметру. Быстрый proxy для «какие решения важнее всего»."""
    base = run_forecast(db, scenario)
    base_score = base["overall_future_score"]
    base_aqi = base["eco_series"][-1]["aqi"]
    base_infra = base["infrastructure_series"][-1]["infra_score"]

    results = []
    for key in _SENSITIVITY_PARAMS:
        try:
            up = run_forecast(db, _perturb_scenario(scenario, key, +delta))
            down = run_forecast(db, _perturb_scenario(scenario, key, -delta))
        except Exception as exc:
            logger.warning("sensitivity %s failed: %s", key, exc)
            continue

        meta = next((m for m in PARAM_META if m["key"] == key), {"label": key, "group": "?"})
        results.append({
            "key": key,
            "label": meta["label"],
            "group": meta["group"],
            "delta_up_score": round(up["overall_future_score"] - base_score, 2),
            "delta_down_score": round(down["overall_future_score"] - base_score, 2),
            "delta_up_aqi": up["eco_series"][-1]["aqi"] - base_aqi,
            "delta_down_aqi": down["eco_series"][-1]["aqi"] - base_aqi,
            "delta_up_infra": round(
                up["infrastructure_series"][-1]["infra_score"] - base_infra, 2,
            ),
            "delta_down_infra": round(
                down["infrastructure_series"][-1]["infra_score"] - base_infra, 2,
            ),
            "impact_magnitude": round(
                (abs(up["overall_future_score"] - base_score)
                 + abs(down["overall_future_score"] - base_score)) / 2, 2,
            ),
        })

    results.sort(key=lambda r: r["impact_magnitude"], reverse=True)
    return {
        "base_score": base_score,
        "base_aqi": base_aqi,
        "base_infra": base_infra,
        "delta_percent": round(delta * 100, 1),
        "levers": results,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# =====================================================================
# Optimizer: goal-seeking via random search
# =====================================================================

_OPTIMIZABLE = {
    # key: (lo, hi) — диапазон случайного поиска
    "school_build_rate":       (0.5, 4.0),
    "kindergarten_build_rate": (0.5, 4.0),
    "clinic_build_rate":       (0.5, 4.0),
    "park_build_rate":         (0.5, 5.0),
    "transport_build_rate":    (0.5, 3.0),
    "auto_growth_rate":        (-0.01, 0.08),
    "gas_conversion_target":   (0.2, 1.0),
    "brt_coverage_target":     (0.2, 1.0),
    "green_growth_rate":       (0.0, 0.04),
    "new_apartments_per_year": (10_000, 50_000),
}


def _score_against_goal(forecast: dict, goal: dict) -> tuple[float, dict]:
    """Вычисляет фитнес-функцию под цель. Выше = лучше."""
    final_score = forecast["overall_future_score"]
    final_aqi = forecast["eco_series"][-1]["aqi"]
    final_infra = forecast["infrastructure_series"][-1]["infra_score"]
    final_eco = forecast["eco_series"][-1]["eco_score"]

    weight_score = goal.get("weight_score", 0.5)
    weight_aqi = goal.get("weight_aqi", 0.2)
    weight_infra = goal.get("weight_infra", 0.2)
    weight_eco = goal.get("weight_eco", 0.1)

    # Мягкие штрафы — чем ближе к цели, тем выше fitness
    target_score = goal.get("target_score", 80)
    target_aqi = goal.get("target_aqi", 100)
    target_infra = goal.get("target_infra", 90)
    target_eco = goal.get("target_eco", 70)

    # Нормализация: каждая часть [0..1]
    s_part = min(1.0, final_score / max(1, target_score))
    a_part = min(1.0, max(0.0, target_aqi / max(1, final_aqi)))
    i_part = min(1.0, final_infra / max(1, target_infra))
    e_part = min(1.0, final_eco / max(1, target_eco))

    fitness = (
        weight_score * s_part
        + weight_aqi * a_part
        + weight_infra * i_part
        + weight_eco * e_part
    )
    return fitness, {
        "fitness": round(fitness, 4),
        "final_score": final_score,
        "final_aqi": final_aqi,
        "final_infra": final_infra,
        "final_eco": final_eco,
    }


def optimize_scenario(
    db: Session,
    base: FuturesScenario,
    goal: dict,
    iterations: int = 24,
    seed: int | None = 42,
) -> dict:
    """Goal-seeking: ищет набор параметров, максимизирующий fitness под goal.

    Простой random search с early bias к baseline (50/50 сохранение текущего
    значения или случайный sample). Быстро и эффективно для ~24 итераций.
    """
    iterations = max(4, min(iterations, 60))
    rnd = random.Random(seed)

    best_scenario = base
    best_forecast = run_forecast(db, base)
    best_fitness, best_metrics = _score_against_goal(best_forecast, goal)
    history = [{"iter": 0, **best_metrics, "params": asdict(base)}]

    for i in range(1, iterations + 1):
        candidate_data = asdict(base)
        # Варьируем подмножество параметров (чтобы не «скакать» сразу во все)
        n_to_change = rnd.randint(3, 6)
        keys = rnd.sample(list(_OPTIMIZABLE.keys()), n_to_change)
        for k in keys:
            lo, hi = _OPTIMIZABLE[k]
            if k == "new_apartments_per_year":
                candidate_data[k] = int(rnd.uniform(lo, hi) / 2500) * 2500
            else:
                candidate_data[k] = round(rnd.uniform(lo, hi), 3)
        candidate = FuturesScenario(**candidate_data)

        try:
            forecast = run_forecast(db, candidate)
        except Exception as exc:
            logger.warning("optimizer iter %d failed: %s", i, exc)
            continue

        fit, metrics = _score_against_goal(forecast, goal)
        history.append({"iter": i, **metrics})

        if fit > best_fitness:
            best_fitness = fit
            best_scenario = candidate
            best_forecast = forecast
            best_metrics = metrics

    return {
        "goal": goal,
        "iterations_run": iterations,
        "best_scenario": asdict(best_scenario),
        "best_forecast_summary": _summary(best_forecast),
        "best_forecast": best_forecast,
        "best_metrics": best_metrics,
        "history": history,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# =====================================================================
# AI Q&A — отвечаем на вопрос по уже посчитанному forecast
# =====================================================================

_QA_SYSTEM = (
    "Ты AQYL Futures Analyst — старший урбанист-аналитик. "
    "Отвечаешь на русском. Используешь ИСКЛЮЧИТЕЛЬНО данные из JSON прогноза, "
    "который тебе дают. Не выдумываешь цифры. Формат: короткий Markdown, "
    "жирным — ключевые числа. Максимум 180 слов. Если вопрос не связан с "
    "прогнозом — вежливо переведи на прогноз."
)


def _compact_forecast(forecast: dict) -> dict:
    """Урезанная версия для LLM-контекста, 1-3 КБ."""
    pop = forecast["population_series"]
    infra = forecast["infrastructure_series"]
    eco = forecast["eco_series"]
    biz = forecast["business_series"]
    mid = len(pop) // 2
    return {
        "scenario_name": forecast["scenario_name"],
        "horizon_years": forecast["horizon_years"],
        "final_year": forecast["final_year"],
        "final_population": forecast["final_population"],
        "overall_future_score": forecast["overall_future_score"],
        "overall_grade": forecast["overall_grade"],
        "comparison": forecast["comparison_to_today"],
        "scenario_params": forecast.get("scenario_params", {}),
        "population_points": [
            {"year": pop[0]["year"], "pop": pop[0]["population"],
             "dep": pop[0]["dependency_ratio"]},
            {"year": pop[mid]["year"], "pop": pop[mid]["population"],
             "dep": pop[mid]["dependency_ratio"]},
            {"year": pop[-1]["year"], "pop": pop[-1]["population"],
             "dep": pop[-1]["dependency_ratio"]},
        ],
        "infra_start": infra[0],
        "infra_final": infra[-1],
        "eco_start": eco[0],
        "eco_final": eco[-1],
        "business_final": biz[-1],
        "critical_points": forecast["critical_points"][:8],
    }


def explain_slider(
    param_key: str, current_value: float, baseline_value: float,
    horizon_years: int = 10,
) -> dict:
    """Объясняет, что произойдёт с городом, если изменить параметр от baseline.

    Использует LLM если ключ задан, иначе rule-based объяснение по PARAM_META.
    Возвращает короткий ответ (40-100 слов) на русском.
    """
    meta = next((m for m in PARAM_META if m["key"] == param_key), None)
    if not meta:
        return {
            "answer": f"Неизвестный параметр: {param_key}",
            "engine": "aqyl-rule-v1",
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }

    delta_pct = 0.0
    if baseline_value not in (0, 0.0):
        delta_pct = (current_value - baseline_value) / baseline_value * 100
    direction = (
        "увеличить" if current_value > baseline_value
        else "снизить" if current_value < baseline_value
        else "оставить как сейчас"
    )

    client = _get_client()
    if client:
        try:
            system = (
                "Ты AQYL Futures Analyst. Объясняешь параметр прогноза города Алматы "
                "в одном-двух коротких абзацах (60-100 слов) на русском. "
                "Покажи: ЧТО изменится, к каким ВТОРИЧНЫМ эффектам приведёт за "
                "горизонт прогноза, и какие риски. Используй жирный для чисел. "
                "Не добавляй преамбулу или заключение — сразу к делу."
            )
            user = json.dumps({
                "param": meta,
                "current_value": current_value,
                "baseline_value": baseline_value,
                "change_percent": round(delta_pct, 1),
                "direction": direction,
                "horizon_years": horizon_years,
            }, ensure_ascii=False, indent=2)
            resp = client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content":
                     f"```json\n{user}\n```\n\nКоротко объясни эффект этого параметра.",
                     },
                ],
                temperature=0.4,
                max_tokens=300,
            )
            answer = (resp.choices[0].message.content or "").strip()
            if answer:
                return {
                    "answer": answer,
                    "engine": "openai-" + settings.openai_model,
                    "param": meta,
                    "generated_at": datetime.utcnow().isoformat() + "Z",
                }
        except Exception as exc:
            logger.warning("explain_slider LLM failed: %s", exc)

    # Fallback rule-based
    if abs(delta_pct) < 1:
        ans = (f"**{meta['label']}** сейчас на baseline-уровне ({current_value}). "
               f"{meta['tip']}")
    else:
        ans = (f"Вы хотите **{direction}** «{meta['label']}» на **{abs(delta_pct):.0f}%** "
               f"относительно baseline ({baseline_value}). {meta['tip']}")
    return {
        "answer": ans,
        "engine": "aqyl-rule-v1",
        "param": meta,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def answer_question(forecast: dict, question: str) -> dict:
    """Q&A по прогнозу: LLM → fallback на эвристику."""
    question = question.strip()
    client = _get_client()
    compact = _compact_forecast(forecast)

    if client:
        try:
            resp = client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": _QA_SYSTEM},
                    {"role": "user", "content":
                     f"Прогноз:\n```json\n{json.dumps(compact, ensure_ascii=False, indent=2)}\n```\n\n"
                     f"Вопрос: {question}"},
                ],
                temperature=0.35,
                max_tokens=500,
            )
            answer = (resp.choices[0].message.content or "").strip()
            if answer:
                return {
                    "answer": answer,
                    "engine": "openai-" + settings.openai_model,
                    "generated_at": datetime.utcnow().isoformat() + "Z",
                }
        except Exception as exc:
            logger.warning("futures chat failed: %s", exc)

    # Fallback-эвристика
    q = question.lower()
    lines = []
    if "критич" in q or "опасн" in q or "кризис" in q:
        cps = forecast["critical_points"][:3]
        if cps:
            lines.append("**Самые серьёзные точки напряжения:**")
            for c in cps:
                lines.append(f"- **{c['year']}** — {c['label']} · {c['description']}")
        else:
            lines.append("В этом сценарии критических точек не выявлено.")
    elif "школ" in q:
        fin = compact["infra_final"]["by_type"].get("school")
        if fin:
            lines.append(
                f"Школы к **{compact['final_year']}**: покрытие "
                f"**{fin['coverage_percent']}%**, нужно ещё "
                f"**{int(fin['deficit'])}** школ (~{fin['capacity_deficit']:,} мест)."
                .replace(",", " "),
            )
    elif "воздух" in q or "aqi" in q:
        lines.append(
            f"Итоговый AQI **{compact['eco_final']['aqi']}** "
            f"(стартовый {compact['eco_start']['aqi']}). "
            f"Эко-оценка: {compact['eco_final']['eco_score']}/100.",
        )
    else:
        lines.append(
            f"В сценарии «{compact['scenario_name']}» к {compact['final_year']} "
            f"оценка будущего — **{compact['overall_future_score']}/100** "
            f"(грейд {compact['overall_grade']}). Задайте более конкретный вопрос — "
            "про школы, воздух, детей, бизнес, кризисы.",
        )
    return {
        "answer": "\n".join(lines),
        "engine": "aqyl-rule-v1",
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
