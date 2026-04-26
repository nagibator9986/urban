"""AI Business Plan Generator — премиум-фича бизнес-режима.

Принимает параметры: категория, район, бюджет, формат помещения, опыт
предпринимателя. Собирает маркетинговый контекст (население, конкуренты,
плотность категории, лучшие точки), отправляет в LLM с жёстким
структурированным промптом. На выходе: Markdown + JSON-summary +
финансовая прикидка (CAPEX/OPEX/BEP), пригодный к PDF-экспорту и
презентации в банк.

Монетизационная модель:
- Free tier: 1 план/месяц на IP (ограничение на стороне API-роутера).
- Pro (planned): $29/мес — безлимит + расширенный финансовый прогноз
  + обновления рынка.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.config import settings
from app.models.business import BusinessCategory, CATEGORY_LABELS
from app.services.ai_assistant import _get_client
from app.services.business_analytics import (
    find_best_locations, get_business_by_district, get_business_counts,
    get_competition_index,
)

logger = logging.getLogger(__name__)

# Типовые финансовые параметры по категориям (Алматы, 2026, баксы).
# Источники: открытые данные BizRadar, Franchise.kz, интервью с рестораторами.
# Это baseline — LLM дальше адаптирует под конкретный район/бюджет.
CATEGORY_ECONOMICS: dict[str, dict[str, float]] = {
    # category: {capex_min, capex_max, opex_monthly, avg_revenue_per_m2, margin_net}
    "cafe":        {"capex_min": 15_000, "capex_max": 45_000, "opex": 4_500, "rev_per_m2": 95, "margin": 0.18},
    "coffee_shop": {"capex_min": 12_000, "capex_max": 35_000, "opex": 3_800, "rev_per_m2": 110, "margin": 0.22},
    "restaurant":  {"capex_min": 50_000, "capex_max": 180_000, "opex": 12_000, "rev_per_m2": 140, "margin": 0.15},
    "bar":         {"capex_min": 30_000, "capex_max": 90_000, "opex": 8_500, "rev_per_m2": 120, "margin": 0.22},
    "fast_food":   {"capex_min": 20_000, "capex_max": 60_000, "opex": 5_500, "rev_per_m2": 130, "margin": 0.20},
    "bakery":      {"capex_min": 18_000, "capex_max": 50_000, "opex": 4_200, "rev_per_m2": 85, "margin": 0.17},
    "grocery":     {"capex_min": 25_000, "capex_max": 80_000, "opex": 5_000, "rev_per_m2": 180, "margin": 0.12},
    "convenience": {"capex_min": 15_000, "capex_max": 40_000, "opex": 3_500, "rev_per_m2": 170, "margin": 0.11},
    "supermarket": {"capex_min": 150_000, "capex_max": 500_000, "opex": 35_000, "rev_per_m2": 220, "margin": 0.08},
    "beauty_salon":{"capex_min": 10_000, "capex_max": 40_000, "opex": 3_200, "rev_per_m2": 75, "margin": 0.25},
    "barbershop":  {"capex_min": 8_000,  "capex_max": 25_000, "opex": 2_500, "rev_per_m2": 85, "margin": 0.30},
    "gym":         {"capex_min": 40_000, "capex_max": 150_000, "opex": 9_500, "rev_per_m2": 60, "margin": 0.20},
    "dentist":     {"capex_min": 35_000, "capex_max": 120_000, "opex": 7_500, "rev_per_m2": 150, "margin": 0.28},
    "pharmacy_biz":{"capex_min": 20_000, "capex_max": 60_000, "opex": 4_000, "rev_per_m2": 165, "margin": 0.14},
    "clothing":    {"capex_min": 15_000, "capex_max": 60_000, "opex": 4_000, "rev_per_m2": 90, "margin": 0.22},
    "electronics": {"capex_min": 25_000, "capex_max": 80_000, "opex": 4_500, "rev_per_m2": 180, "margin": 0.12},
    "hookah":      {"capex_min": 20_000, "capex_max": 55_000, "opex": 5_500, "rev_per_m2": 95, "margin": 0.25},
    "coworking":   {"capex_min": 30_000, "capex_max": 100_000, "opex": 6_500, "rev_per_m2": 55, "margin": 0.24},
}

DEFAULT_ECON = {"capex_min": 20_000, "capex_max": 60_000, "opex": 4_500, "rev_per_m2": 100, "margin": 0.18}


@dataclass
class PlanRequest:
    category: str                        # BusinessCategory value
    district: str | None = None          # Название района или None — выбирать авто
    budget_usd: float = 30_000           # Стартовый бюджет предпринимателя
    area_m2: float = 80                  # Площадь помещения
    experience: Literal["none", "some", "experienced"] = "some"
    language: Literal["ru", "kz", "en"] = "ru"
    concept: str | None = None           # Свободное описание концепции от пользователя


def _ru(n: float | int) -> str:
    if isinstance(n, float):
        n = round(n)
    return f"{n:,}".replace(",", " ")


def _finance_baseline(cat: str, budget: float, area: float) -> dict:
    """Грубая финансовая прикидка до вызова LLM.

    Важно: margin_net в справочнике — это уже ЧИСТАЯ маржа после OPEX/аренды,
    не gross. Поэтому считаем денежный поток по году так:
       cash_flow_month = revenue_month * margin_net
    А opex считаем отдельно только для показа, не двойным вычитанием.
    BEP = CAPEX / cash_flow_month.
    """
    e = CATEGORY_ECONOMICS.get(cat, DEFAULT_ECON)
    capex = max(e["capex_min"], min(e["capex_max"], budget))

    rev_m1_12 = e["rev_per_m2"] * area * 0.70   # ramp-up коэф.
    rev_m13_24 = e["rev_per_m2"] * area * 0.95
    opex_month = e["opex"] + area * 18           # baseline OPEX incl. rent $18/м²

    cash_flow_m = rev_m1_12 * e["margin"]
    net_year_1 = cash_flow_m * 12
    bep = math.ceil(capex / cash_flow_m) if cash_flow_m > 0 else 999

    return {
        "capex_usd": int(capex),
        "opex_monthly_usd": int(opex_month),
        "revenue_m1_12_usd": int(rev_m1_12),
        "revenue_m13_24_usd": int(rev_m13_24),
        "gross_year_1_usd": int(rev_m1_12 * 12),
        "net_year_1_usd": int(net_year_1),
        "break_even_months": min(bep, 999),
        "margin_net": e["margin"],
        "rent_per_m2_usd": 18,
    }


def _build_market_context(db: Session, cat_enum: BusinessCategory, district: str | None) -> dict:
    """Собираем маркетинговый контекст для LLM."""
    by_dist = get_business_by_district(db)
    counts = get_business_counts(db)

    chosen = None
    if district:
        chosen = next((d for d in by_dist if d["district_name"] == district), None)

    # Лучшие локации для категории
    best = find_best_locations(db, cat_enum, 5)

    return {
        "total_in_city": counts.get(cat_enum.value, 0),
        "chosen_district": chosen,
        "all_districts_ranked": by_dist,
        "best_locations": best,
        "category_label": CATEGORY_LABELS.get(cat_enum, cat_enum.value),
    }


SYSTEM_PROMPT = """Ты AQYL Business Analyst — аналитик, который пишет бизнес-планы
для подачи в Kaspi Bank, Halyk Bank, Forte Bank или инвесторам в Казахстане.

КРИТИЧЕСКИ ВАЖНО:
- Используй ТОЛЬКО цифры из JSON-контекста. Не придумывай статистику.
- Если цифра не дана — пропусти блок или напиши «требуется уточнение».
- Для финансов используй baseline_finance — не пересчитывай сам.
- Пиши деловым языком, без воды. Каждый абзац = бизнес-аргумент.
- Markdown с жёсткой структурой (заголовки H2 для разделов, H3 для подразделов).
- Максимум 2500 слов.

СТРУКТУРА ОБЯЗАТЕЛЬНАЯ:
# {{business_name}} — Бизнес-план
## 1. Резюме проекта
(Категория, район, концепция, целевой рынок в 2-3 абзацах)

## 2. Анализ рынка
### 2.1. Категория в Алматы
(Общее число бизнесов категории в городе, динамика, стадия рынка: растущий/зрелый/насыщенный)
### 2.2. Выбранный район
(Население, плотность бизнесов на 10К, средняя ниша)
### 2.3. Конкурентная среда
(Количество прямых конкурентов в районе, топ-3 ближайших, уровень конкуренции)

## 3. Целевая аудитория
(Демография района, платежеспособность, портрет клиента, прогноз трафика)

## 4. Локация
### 4.1. Рекомендуемый район
(Обоснование выбора из best_locations — почему именно этот)
### 4.2. Требования к помещению
(Площадь, трафик улицы, парковка, видимость с улицы)

## 5. Финансовая модель
### 5.1. Инвестиции (CAPEX)
(Аренда депозита, ремонт, оборудование, стартовые закупки, маркетинг)
### 5.2. Операционные расходы (OPEX/мес)
(Аренда, зарплаты, коммуналка, маркетинг, налоги)
### 5.3. Прогноз выручки
(Первые 12 мес, 13-24 мес, среднемесячная)
### 5.4. Точка безубыточности
(Месяц выхода на BEP, ROI на горизонте 24 мес)

## 6. Стратегия запуска
(3 этапа: 0-3 мес подготовка, 4-6 мес запуск, 7-12 рост)

## 7. Риски и митигация
(5-7 ключевых рисков, для каждого — как смягчаем)

## 8. Заключение
(Краткое резюме инвестиционной привлекательности, позитивное, но честное)

Язык: русский, деловой. Цифры — в долларах США (Алматы привычно считает в $).
"""


def generate_plan(db: Session, req: PlanRequest) -> dict:
    """Главный вход. Возвращает dict с markdown + summary + finance."""
    # Валидация категории
    try:
        cat_enum = BusinessCategory(req.category)
    except ValueError:
        return {"error": "unknown_category", "category": req.category}

    cat_label = CATEGORY_LABELS.get(cat_enum, cat_enum.value)

    # Если район не задан — берём лучший из скоринга
    market = _build_market_context(db, cat_enum, req.district)
    chosen_district_name = req.district
    if not chosen_district_name and market["best_locations"]:
        chosen_district_name = market["best_locations"][0]["district_name"]
        market["chosen_district"] = next(
            (d for d in market["all_districts_ranked"]
             if d["district_name"] == chosen_district_name), None,
        )

    # Индекс конкуренции в центре района
    competition = None
    if market["chosen_district"] and market["best_locations"]:
        target = next(
            (b for b in market["best_locations"] if b["district_name"] == chosen_district_name),
            market["best_locations"][0],
        )
        try:
            competition = get_competition_index(
                db, cat_enum, target["suggested_lat"], target["suggested_lon"], 1.0,
            )
            # Убираем тяжёлый массив конкурентов из контекста — LLM хватит счётчика
            competition["competitors"] = competition["competitors"][:5]
        except Exception as e:
            logger.warning(f"Competition index failed: {e}")

    # Финансы
    finance = _finance_baseline(cat_enum.value, req.budget_usd, req.area_m2)

    # Контекст для LLM
    ctx = {
        "request": {
            "category": cat_enum.value,
            "category_label": cat_label,
            "district": chosen_district_name,
            "budget_usd": req.budget_usd,
            "area_m2": req.area_m2,
            "experience": req.experience,
            "concept": req.concept or f"{cat_label} в районе {chosen_district_name or 'Алматы'}",
        },
        "market": {
            "total_in_city": market["total_in_city"],
            "category_label": cat_label,
            "chosen_district": market["chosen_district"],
            "best_locations_top_3": market["best_locations"][:3],
        },
        "competition": competition,
        "baseline_finance": finance,
        "city": {"name": "Алматы", "population": 2_354_700, "currency": "USD"},
    }

    # LLM вызов
    md = _call_llm(ctx, cat_label, chosen_district_name)
    engine = "openai-" + settings.openai_model

    if not md:
        md = _template_plan(ctx)
        engine = "aqyl-template-v1"

    return {
        "markdown": md,
        "summary": {
            "category": cat_enum.value,
            "category_label": cat_label,
            "district": chosen_district_name,
            "capex_usd": finance["capex_usd"],
            "opex_monthly_usd": finance["opex_monthly_usd"],
            "break_even_months": finance["break_even_months"],
            "net_year_1_usd": finance["net_year_1_usd"],
            "competition_level": competition["competition_level"] if competition else None,
            "competitors_nearby": competition["competitors_count"] if competition else None,
        },
        "finance": finance,
        "context": ctx,
        "engine": engine,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def _call_llm(ctx: dict, cat_label: str, district: str | None) -> str | None:
    client = _get_client()
    if not client:
        return None
    try:
        user = (
            f"Напиши бизнес-план для открытия «{cat_label}» "
            f"{'в районе ' + district if district else 'в Алматы'}.\n\n"
            f"Контекст (живые данные рынка и финансовая модель):\n"
            f"```json\n{json.dumps(ctx, ensure_ascii=False, indent=2)}\n```\n"
        )
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ],
            temperature=0.5,
            max_tokens=3000,
        )
        return resp.choices[0].message.content or None
    except Exception as e:
        logger.warning(f"Plan LLM failed: {e}")
        return None


def _template_plan(ctx: dict) -> str:
    """Fallback — шаблонный план без LLM (для когда OpenAI недоступен)."""
    r = ctx["request"]
    f = ctx["baseline_finance"]
    m = ctx["market"]
    label = r["category_label"]
    dist = r["district"] or "Алматы"
    return f"""# {label} — Бизнес-план

_Сформировано AQYL CITY · {datetime.utcnow():%Y-%m-%d %H:%M UTC}_

## 1. Резюме проекта
Открытие **{label.lower()}** в {dist}.
Бюджет: **${_ru(r['budget_usd'])}**, площадь **{r['area_m2']} м²**.
Опыт предпринимателя: {r['experience']}.

## 2. Анализ рынка
- В Алматы {_ru(m['total_in_city'])} бизнесов категории «{label}».
- Выбранный район — {dist}, население {_ru(m.get('chosen_district', {}).get('population', 0))}.

## 3. Финансовая модель
- CAPEX: **${_ru(f['capex_usd'])}**
- OPEX/мес: **${_ru(f['opex_monthly_usd'])}**
- Выручка 1-12 мес: **${_ru(f['revenue_m1_12_usd'])}/мес**
- Выручка 13-24 мес: **${_ru(f['revenue_m13_24_usd'])}/мес**
- Точка безубыточности: **{f['break_even_months']} мес**
- Маржа: **{int(f['margin_net'] * 100)}%**

## 4. Рекомендация
Использовать платформу AQYL CITY для уточнения локации и мониторинга
конкурентов в радиусе 1 км.

_Для расширенного бизнес-плана подключите AI-движок (OPENAI_API_KEY)._
"""
