"""Персональный эко-бриф: пользователь вводит профиль здоровья и активностей,
LLM (OpenAI) формирует персонифицированные советы на день с учётом
прогноза AQI и загрязнителей в его районе.

Работает через существующий OpenAI-клиент из ai_assistant. Если ключа нет —
fallback на rule-based шаблон.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.config import settings
from app.services.ai_assistant import _get_client
from app.services.eco_analytics import get_district_eco
from app.services.eco_forecast import forecast_district
from app.services.eco_health import source_attribution, window_advisor
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


@dataclass
class Persona:
    district: str
    age_group: Literal["child", "teen", "adult", "senior"] = "adult"
    conditions: list[str] = None            # ["asthma","allergy","heart","pregnancy","copd"]
    activities: list[str] = None             # ["running","cycling","walking_dog","gym","kids_outdoor"]
    commute: Literal["car", "public", "walk", "bike", "none"] = "public"
    smoker: bool = False
    has_purifier: bool = False

    def __post_init__(self):
        self.conditions = self.conditions or []
        self.activities = self.activities or []


CONDITION_LABELS = {
    "asthma":    "астма",
    "allergy":   "аллергия/поллиноз",
    "heart":     "сердечно-сосудистые",
    "pregnancy": "беременность",
    "copd":      "ХОБЛ",
    "children":  "дети до 6 лет в семье",
    "diabetes":  "диабет",
}

ACTIVITY_LABELS = {
    "running":         "бег",
    "cycling":         "велосипед",
    "walking_dog":     "прогулки с собакой",
    "gym":             "зал",
    "kids_outdoor":    "прогулки с детьми",
    "yoga_outdoor":    "йога на улице",
    "commute_bike":    "велосипед на работу",
}


SYSTEM_PROMPT = """Ты AQYL Health AI — медицински-грамотный эко-ассистент для жителей Алматы.
Твоя задача — дать персональный, конкретный и безопасный совет на день
на основе профиля пользователя и текущего/прогнозного качества воздуха.

КРИТИЧЕСКИ ВАЖНО:
- НИКОГДА не ставь диагнозы, не заменяй врача. При серьёзных симптомах — «обратитесь к врачу».
- Используй ТОЛЬКО цифры из JSON-контекста.
- Для AQI 0-50 → всё в норме; 51-100 → умеренно; 101-150 → чувствительным ограничить;
  151-200 → всем ограничить; 200+ → не выходить.
- Для астматиков и детей — снижай пороги на 30.
- Для беременных — особо осторожно, PM2.5 критична.

ФОРМАТ ОТВЕТА (строгий Markdown, не более 300 слов):

## ⚡ Главное на сегодня
(1 предложение-вердикт: можно/не можно, что ключевое делать)

## 🎯 Мои рекомендации на сегодня
(3-5 bullet points, конкретных и персонифицированных)

### 🏃 Мои активности
(для каждой activity из профиля — 1 предложение-совет с временем суток)

## 🪟 Когда проветривать
(Конкретное временное окно из JSON window_advisor)

## 🚨 Когда срочно к врачу
(2-3 красных флага симптомов — только если актуально при текущем AQI)

Язык: русский, доброжелательный, уважительный. Обращение на «вы».
Не добавляй лишних блоков. Не повторяй сам себя.
"""


def _build_context(db: Session, p: Persona) -> dict:
    eco = get_district_eco(db, p.district)
    fc = forecast_district(p.district, hours=24)
    sources = source_attribution(p.district)
    windows = window_advisor(p.district)

    return {
        "district": p.district,
        "current": {
            "aqi": eco["aqi"],
            "category": eco["aqi_category"]["label"],
            "advice_general": eco["aqi_category"]["advice"],
            "pollutants": {
                k: {"value": v["value"], "unit": v["unit"],
                    "over_who": v["over_who"], "label": v["label"]}
                for k, v in eco["pollutants"].items()
            },
        },
        "forecast_24h": {
            "day_avg_aqi": windows["day_avg_aqi"],
            "clean_windows": windows["clean_windows"],
            "dirty_windows": windows["dirty_windows"],
        },
        "sources_today": {
            "dominant": sources["dominant_source"]["label"],
            "top3": sources["sources"][:3],
        },
        "user_profile": {
            "age_group": p.age_group,
            "conditions": [CONDITION_LABELS.get(c, c) for c in p.conditions],
            "activities": [ACTIVITY_LABELS.get(a, a) for a in p.activities],
            "commute": p.commute,
            "smoker": p.smoker,
            "has_purifier": p.has_purifier,
        },
    }


def _persona_risk_level(p: Persona, aqi: int) -> str:
    threshold_adjust = 0
    if "asthma" in p.conditions or "copd" in p.conditions:
        threshold_adjust += 30
    if "heart" in p.conditions or "pregnancy" in p.conditions:
        threshold_adjust += 20
    if p.age_group in ("child", "senior"):
        threshold_adjust += 20
    # Adjusted effective AQI
    effective = aqi + threshold_adjust
    if effective > 200: return "critical"
    if effective > 150: return "high"
    if effective > 100: return "moderate"
    return "low"


def _template_brief(ctx: dict, p: Persona) -> str:
    d = ctx["district"]
    aqi = ctx["current"]["aqi"]
    cat = ctx["current"]["category"]
    windows = ctx["forecast_24h"]["clean_windows"]
    w_hint = ""
    if windows:
        w = windows[0]
        w_hint = f"Открыть окна в {w['from'][11:16]}–{w['to'][11:16]} (AQI {w['avg_aqi']})."

    lines = [
        f"## ⚡ Главное на сегодня",
        f"В {d} сейчас **AQI {aqi} — {cat}**. "
        f"Доминирующий источник — {ctx['sources_today']['dominant']}.\n",
        f"## 🎯 Мои рекомендации",
    ]
    if "asthma" in p.conditions:
        lines.append("• Держите ингалятор под рукой, особенно при выходе на улицу.")
    if "pregnancy" in p.conditions:
        lines.append("• При AQI > 100 — минимизируйте пребывание на оживлённых улицах.")
    if p.age_group == "child":
        lines.append("• Избегайте длительных уличных игр в часы пик (7-10, 17-21).")
    if p.age_group == "senior":
        lines.append("• Используйте маску N95/KN95 при выходе на улицу.")

    lines += [
        "\n## 🪟 Когда проветривать",
        w_hint or "Днём 12:00–15:00 традиционно чище всего.",
    ]
    return "\n".join(lines)


def personal_brief(db: Session, persona: Persona) -> dict:
    """Главный вход. Возвращает Markdown-бриф + структурированный анализ."""
    ctx = _build_context(db, persona)
    risk = _persona_risk_level(persona, ctx["current"]["aqi"])

    md = _call_llm(ctx, persona)
    engine = "openai-" + settings.openai_model
    if not md:
        md = _template_brief(ctx, persona)
        engine = "aqyl-rule-v1"

    return {
        "district": persona.district,
        "risk_level": risk,
        "current_aqi": ctx["current"]["aqi"],
        "markdown": md,
        "context": ctx,
        "engine": engine,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def _call_llm(ctx: dict, p: Persona) -> str | None:
    client = _get_client()
    if not client:
        return None
    try:
        user_msg = (
            f"Составь персональный эко-бриф на сегодня для жителя {p.district}.\n\n"
            f"Контекст (реальные данные воздуха и профиль):\n"
            f"```json\n{json.dumps(ctx, ensure_ascii=False, indent=2)}\n```"
        )
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.4,
            max_tokens=800,
        )
        return resp.choices[0].message.content or None
    except Exception as e:
        logger.warning(f"Personal brief LLM failed: {e}")
        return None
