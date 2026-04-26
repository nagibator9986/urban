"""AI tool-calling — превращает AQYL AI из text-only в агента,
который может запрашивать живые данные и запускать симуляции.

Использует OpenAI function-calling API. Если ключа нет, tools не используются
(просто rule-based fallback в ai_assistant.chat).

Доступные инструменты:
  - get_district_stats(name)        → infrastructure stats
  - get_district_eco(name)          → AQI/pollutants
  - run_simulation(name, additions) → what-if district score
  - get_business_recommendations(name) → top categories for district
  - find_best_locations(category, top_n) → ранжированные точки
  - get_health_risk(profile)        → personal health risk
  - explain_term(term)              → glossary

Каждый инструмент:
  - имеет JSON-schema (params)
  - имеет execute(params, db) → dict
  - возвращает компактный JSON, который AI вплетает в ответ
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# -----------------------------------------------------------------------
# Tool definitions
# -----------------------------------------------------------------------

ToolFn = Callable[[dict, Session], Any]


def _tool_get_district_stats(args: dict, db: Session) -> dict:
    """Возвращает stats района."""
    name = args.get("name", "")
    from app.services.statistics import get_city_statistics
    stats = get_city_statistics(db)
    found = next((d for d in stats.districts if d.district_name == name), None)
    if not found:
        return {"error": "district_not_found", "available": [d.district_name for d in stats.districts]}
    return {
        "district_name": found.district_name,
        "population": found.population,
        "overall_score": found.overall_score,
        "facilities": [
            {
                "type": f.facility_type, "label": f.label_ru,
                "actual": f.actual_count, "norm": f.norm_count,
                "coverage_percent": f.coverage_percent, "deficit": f.deficit,
            }
            for f in found.facilities if f.norm_per_10k > 0
        ],
    }


def _tool_get_district_eco(args: dict, db: Session) -> dict:
    name = args.get("name", "")
    from app.services.eco_analytics import get_district_eco
    try:
        return get_district_eco(db, name)
    except Exception as e:
        return {"error": str(e)}


def _tool_run_simulation(args: dict, db: Session) -> dict:
    name = args.get("district_name", "")
    additions = args.get("additions", {})
    from app.models.district import District
    from app.services.simulator import simulate_district
    d = db.query(District).filter_by(name_ru=name).first()
    if not d:
        return {"error": "district_not_found"}
    return simulate_district(db, d.id, additions, {})


def _tool_get_business_recommendations(args: dict, db: Session) -> dict:
    name = args.get("name", "")
    top_n = int(args.get("top_n", 5))
    from app.services.business_recommender import recommend_for_district
    r = recommend_for_district(db, name, top_n=top_n)
    if isinstance(r, dict) and r.get("error"):
        return r
    # Compact: only top items
    return {
        "district": r["district"],
        "top": [
            {
                "category": x["category"], "label": x["label"], "score": x["score"],
                "existing": x["market"]["existing_count"],
                "potential_slots": x["market"]["potential_slots"],
            }
            for x in r["top"][:top_n]
        ],
    }


def _tool_find_best_locations(args: dict, db: Session) -> dict:
    category = args.get("category", "")
    top_n = int(args.get("top_n", 5))
    from app.models.business import BusinessCategory
    from app.services.business_analytics import find_best_locations
    try:
        cat = BusinessCategory(category)
    except ValueError:
        return {"error": "unknown_category"}
    return {"locations": find_best_locations(db, cat, top_n)}


def _tool_get_pollution_sources(args: dict, db: Session) -> dict:
    name = args.get("name", "")
    from app.services.eco_health import source_attribution
    return source_attribution(name)


def _tool_get_window_advisor(args: dict, db: Session) -> dict:
    name = args.get("name", "")
    from app.services.eco_health import window_advisor
    return window_advisor(name)


TOOLS: dict[str, dict] = {
    "get_district_stats": {
        "fn": _tool_get_district_stats,
        "schema": {
            "type": "function",
            "function": {
                "name": "get_district_stats",
                "description": (
                    "Возвращает оценку района по соц. инфраструктуре: население, "
                    "счётчики школ/садов/поликлиник/аптек/парков, дефициты, "
                    "процент покрытия нормативов СНиП. Используй когда нужны "
                    "точные цифры по конкретному району Алматы."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Название района на русском (например, 'Алмалинский район')",
                        },
                    },
                    "required": ["name"],
                },
            },
        },
    },
    "get_district_eco": {
        "fn": _tool_get_district_eco,
        "schema": {
            "type": "function",
            "function": {
                "name": "get_district_eco",
                "description": (
                    "Возвращает экологию района: AQI, PM2.5, NO2, озеленение, трафик, "
                    "топ эко-проблем. Используй для эко-вопросов."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Название района",
                        },
                    },
                    "required": ["name"],
                },
            },
        },
    },
    "run_simulation": {
        "fn": _tool_run_simulation,
        "schema": {
            "type": "function",
            "function": {
                "name": "run_simulation",
                "description": (
                    "Запускает what-if симуляцию: что произойдёт с оценкой района, "
                    "если добавить указанные объекты. Используй когда пользователь "
                    "спрашивает «что если построим X школ в районе Y»."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "district_name": {"type": "string"},
                        "additions": {
                            "type": "object",
                            "description": (
                                "Объекты для добавления, ключи: school, kindergarten, "
                                "clinic, pharmacy, park, fire_station, bus_stop. "
                                "Пример: {\"school\": 2, \"kindergarten\": 1}"
                            ),
                        },
                    },
                    "required": ["district_name", "additions"],
                },
            },
        },
    },
    "get_business_recommendations": {
        "fn": _tool_get_business_recommendations,
        "schema": {
            "type": "function",
            "function": {
                "name": "get_business_recommendations",
                "description": (
                    "Возвращает топ-N категорий бизнеса для открытия в районе "
                    "(score, потенциал, существующие конкуренты). Используй когда "
                    "пользователь спрашивает «какой бизнес открыть в районе X»."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "top_n": {"type": "integer", "default": 5},
                    },
                    "required": ["name"],
                },
            },
        },
    },
    "find_best_locations": {
        "fn": _tool_find_best_locations,
        "schema": {
            "type": "function",
            "function": {
                "name": "find_best_locations",
                "description": (
                    "Находит лучшие районы для открытия бизнеса определённой категории. "
                    "Используй когда вопрос «где открыть кафе/салон/etc»."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "Ключ категории (cafe, restaurant, gym, etc.)",
                        },
                        "top_n": {"type": "integer", "default": 5},
                    },
                    "required": ["category"],
                },
            },
        },
    },
    "get_pollution_sources": {
        "fn": _tool_get_pollution_sources,
        "schema": {
            "type": "function",
            "function": {
                "name": "get_pollution_sources",
                "description": (
                    "Возвращает атрибуцию источников загрязнения в районе: "
                    "ТЭЦ/частное отопление/трафик/промышленность/пыль с долями."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}},
                    "required": ["name"],
                },
            },
        },
    },
    "get_window_advisor": {
        "fn": _tool_get_window_advisor,
        "schema": {
            "type": "function",
            "function": {
                "name": "get_window_advisor",
                "description": (
                    "Когда лучше проветривать/гулять сегодня: чистые и грязные часы "
                    "по AQI-прогнозу для района."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}},
                    "required": ["name"],
                },
            },
        },
    },
}


def get_tool_schemas() -> list[dict]:
    return [t["schema"] for t in TOOLS.values()]


def execute_tool(name: str, args: dict, db: Session) -> dict:
    """Безопасное выполнение инструмента: ловит exceptions, возвращает {"error": ...}."""
    tool = TOOLS.get(name)
    if not tool:
        return {"error": f"unknown_tool: {name}"}
    try:
        result = tool["fn"](args, db)
        return result if isinstance(result, dict) else {"value": result}
    except Exception as e:
        logger.warning("tool %s failed: %s", name, e)
        return {"error": f"tool_failed: {e}"}
