"""AQYL AI — помощник и отчёты для AQYL CITY.

Архитектура:
1. Собираем компактный контекст из БД по режиму (public/business/eco).
2. Если задан OPENAI_API_KEY — шлём запрос в OpenAI с системным промптом
   и контекстом данных. Ответ возвращаем как есть.
3. Если ключа нет ИЛИ запрос упал — fallback на локальный rule-based
   intent router. Никогда не 500-им.

Для отчётов — аналогично: с ключом LLM пишет аналитическую прозу,
без ключа работает шаблонный генератор.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.config import settings
from app.services.analytics import get_city_overview
from app.services.business_analytics import (
    find_best_locations, get_business_by_district, get_business_counts,
)
from app.services.eco_analytics import get_city_eco
from app.services.statistics import get_city_statistics

logger = logging.getLogger(__name__)
Mode = Literal["public", "business", "eco"]


# ---------------------------------------------------------------------------
# Intent router (rule-based) — используется как fallback и для детекции темы
# ---------------------------------------------------------------------------

INTENTS = {
    "worst_district":    [r"худш", r"самый плох", r"отстающ", r"слабый", r"проблемн"],
    "best_district":     [r"лучш", r"топ", r"сильн", r"максим"],
    "deficit":           [r"дефицит", r"нехват", r"не хватает", r"недостат"],
    "air_quality":       [r"воздух", r"смог", r"aqi", r"pm2", r"pm10", r"дышать"],
    "green":             [r"зелен", r"парк", r"озелен", r"дерев"],
    "traffic":           [r"трафик", r"машин", r"авто", r"пробк", r"транспорт"],
    "competition":       [r"конкурент", r"конкуренц"],
    "where_open":        [r"где открыть", r"где разместить", r"лучш.*точк", r"location"],
    "general":           [],
}


def detect_intent(text: str) -> str:
    t = text.lower()
    for intent, patterns in INTENTS.items():
        for p in patterns:
            if re.search(p, t):
                return intent
    return "general"


def _ru_num(n: float | int) -> str:
    if isinstance(n, float):
        return f"{n:,.1f}".replace(",", " ").replace(".", ",")
    return f"{n:,}".replace(",", " ")


# ---------------------------------------------------------------------------
# Контекст для LLM — компактная JSON-сводка по режиму
# ---------------------------------------------------------------------------

def _build_context(db: Session, mode: Mode) -> dict[str, Any]:
    """Собираем живые цифры для LLM. Не дублируем огромные GeoJSON —
    только агрегаты, топы, ранги. Цель: 1-3 КБ JSON, достаточно для анализа."""
    if mode == "public":
        stats = get_city_statistics(db)
        overview = get_city_overview(db)
        return {
            "mode": "public",
            "city": {
                "population": stats.total_population,
                "total_facilities": stats.total_facilities,
                "overall_score": stats.overall_score,
                "per_type_totals": {
                    f.facility_type: f.actual_count for f in stats.facilities
                },
            },
            "facility_norms": [
                {
                    "type": f.facility_type, "label": f.label_ru,
                    "actual": f.actual_count, "norm": f.norm_count,
                    "coverage_percent": f.coverage_percent, "deficit": f.deficit,
                }
                for f in stats.facilities if f.norm_per_10k > 0
            ],
            "districts": [
                {
                    "name": d.district_name, "population": d.population,
                    "score": d.overall_score,
                    # Ключевая часть — реальные счётчики по типам в районе
                    "facilities_by_type": {
                        f.facility_type: {
                            "count": f.actual_count,
                            "norm": f.norm_count,
                            "coverage_percent": f.coverage_percent,
                            "deficit": f.deficit,
                        }
                        for f in d.facilities if f.norm_per_10k > 0
                    },
                }
                for d in sorted(stats.districts, key=lambda x: x.overall_score, reverse=True)
            ],
            "top_gaps": [
                {
                    "district": g.district_name, "type": g.facility_type,
                    "current_count": g.current_count,
                    "per_10k": g.per_10k, "city_avg_per_10k": g.city_avg_per_10k,
                    "deficit_percent": g.deficit_percent, "status": g.status,
                }
                for g in overview.coverage_gaps[:12]
            ],
        }

    if mode == "business":
        counts = get_business_counts(db)
        by_dist = get_business_by_district(db)
        top_cats = sorted(counts.items(), key=lambda x: -x[1])[:10]
        return {
            "mode": "business",
            "total_businesses": sum(counts.values()),
            "top_categories": [{"category": c, "count": n} for c, n in top_cats if n > 0],
            "all_category_counts": {c: n for c, n in counts.items() if n > 0},
            "districts": [
                {
                    "name": d["district_name"], "population": d["population"],
                    "total_businesses": d["total_businesses"],
                    "businesses_per_10k": d["businesses_per_10k"],
                    # Топ-5 категорий именно в этом районе — конкретика для LLM
                    "top_categories_here": sorted(
                        [{"category": k, "count": v} for k, v in d["categories"].items()],
                        key=lambda x: -x["count"],
                    )[:5],
                }
                for d in by_dist
            ],
        }

    if mode == "eco":
        eco = get_city_eco(db)
        return {
            "mode": "eco",
            "city_aqi": eco["city_aqi"],
            "city_aqi_level": eco["city_aqi_category"]["label"],
            "city_eco_score": eco["city_eco_score"],
            "city_green_m2_per_capita": eco["city_green_m2_per_capita"],
            "green_norm_m2": eco["city_green_norm"],
            "districts": [
                {
                    "name": d["district_name"], "aqi": d["aqi"],
                    "aqi_level": d["aqi_category"]["label"],
                    "eco_score": d["eco_score"], "eco_grade": d["eco_grade"],
                    "green_m2_per_capita": d["green_m2_per_capita"],
                    "traffic_per_1000": d["traffic_per_1000"],
                    "top_issues": [i["label"] for i in d["issues"][:3]],
                }
                for d in eco["districts"]
            ],
            "top_city_issues": [
                {"label": i["label"], "severity": i["severity"],
                 "worst_district": i["worst_district"]}
                for i in eco["top_issues"][:5]
            ],
        }

    return {"mode": mode}


# ---------------------------------------------------------------------------
# OpenAI клиент (lazy)
# ---------------------------------------------------------------------------

_client = None
_client_lock = __import__("threading").Lock()


def _get_client():
    """Thread-safe lazy initialization of the OpenAI client.

    Uses a Lock so concurrent first requests under uvicorn don't create
    multiple clients (each carries its own HTTP connection pool — leak).
    """
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        key = settings.openai_api_key or os.getenv("OPENAI_API_KEY", "")
        if not key:
            return None
        try:
            from openai import OpenAI
            _client = OpenAI(api_key=key)
            return _client
        except Exception as e:
            logger.warning(f"OpenAI init failed: {e}")
            return None


SYSTEM_PROMPTS: dict[str, str] = {
    "public": (
        "Ты AQYL AI — ассистент по общественной инфраструктуре Алматы. "
        "Отвечаешь на русском языке, используя ИСКЛЮЧИТЕЛЬНО данные из переданного JSON-контекста.\n\n"
        "КРИТИЧЕСКИ ВАЖНО:\n"
        "- Счётчики объектов по району брать ТОЛЬКО из districts[i].facilities_by_type[type].count\n"
        "- Типы: school, hospital, clinic, kindergarten, pharmacy, park, fire_station, bus_stop\n"
        "- Общегородские цифры — из city.per_type_totals или facility_norms[].actual\n"
        "- НИКОГДА не пиши, что в районе 0 объектов, если в JSON указано другое\n"
        "- Если spacsubitу нужный тип отсутствует в facilities_by_type — так и скажи: 'данных нет'\n"
        "- Сравнивай с нормативом: facilities_by_type[type].norm и coverage_percent\n\n"
        "Формат: короткий структурированный Markdown (## заголовки, - списки, **жирное** для чисел).\n"
        "Стиль: аналитик-урбанист, прямолинейно, без воды. Максимум 220 слов."
    ),
    "business": (
        "Ты AQYL AI — ассистент-аналитик по бизнес-ландшафту Алматы. "
        "Отвечаешь на русском. Используешь только данные из JSON-контекста: число бизнесов, "
        "топ категории, районы с плотностью (бизнесов на 10К жителей), население. "
        "Если пользователь спрашивает «где открыть X», и в контексте есть категории — "
        "рекомендуешь район по логике: высокое население × низкая насыщенность = шанс. "
        "Markdown, структурированно, максимум 220 слов."
    ),
    "eco": (
        "Ты AQYL AI — эко-аналитик для Алматы. Отвечаешь на русском. "
        "Используешь только данные из JSON-контекста: AQI по районам, озеленение (м²/чел "
        "при норме 16), авто-трафик, эко-проблемы. "
        "Для советов по воздуху ориентируйся на стандарты AQI (0-50 хороший, 51-100 умеренный, "
        "101-150 для чувствительных групп, 151-200 вредный, 201+ очень вредный). "
        "Markdown, структурированно, максимум 220 слов. Сначала факты, потом рекомендации."
    ),
}


def _llm_chat(
    mode: Mode, question: str, context: dict[str, Any],
    history: list[dict] | None = None,
    db: Session | None = None,
    enable_tools: bool = True,
) -> tuple[str | None, list[dict]]:
    """Попытка ответить через OpenAI с tool-calling. Возвращает (text, tool_calls_log).

    Если enable_tools=True и есть db, передаёт tool-схемы в OpenAI.
    Если LLM решает вызвать tool — выполняем его, добавляем результат в messages,
    запрашиваем ещё раз. Максимум 3 tool round'а.

    history — список последних сообщений сессии (max 10).
    """
    client = _get_client()
    if not client:
        return None, []

    system = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["public"])
    if context.get("user_profile"):
        system += (
            "\n\n## Профиль пользователя\n"
            "Учитывай профиль (район, здоровье, образ жизни, семья, интересы) — "
            "он в контексте под ключом user_profile. Тон: персональный, на «вы». "
            "Давай советы именно под этого человека."
        )
    if enable_tools:
        system += (
            "\n\n## Доступные инструменты\n"
            "У тебя есть набор tools для запроса свежих данных и запуска "
            "симуляций. Если для точного ответа нужно: статистику района, "
            "AQI/эко-данные, what-if симуляцию, рекомендации по бизнесу, "
            "источники загрязнения, лучшие часы — ВЫЗЫВАЙ tool вместо "
            "догадок. Если данные уже в context — используй их и не вызывай tool."
        )

    ctx = json.dumps(context, ensure_ascii=False, indent=2)
    user = f"Контекст (живые данные):\n```json\n{ctx}\n```\n\nВопрос: {question}"

    messages: list[dict] = [{"role": "system", "content": system}]
    if history:
        for h in history[-10:]:
            role = h.get("role")
            content = h.get("content") or ""
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content[:2000]})
    messages.append({"role": "user", "content": user})

    tool_calls_log: list[dict] = []
    tools_payload = None
    if enable_tools and db is not None:
        try:
            from app.services.ai_tools import execute_tool, get_tool_schemas
            tools_payload = get_tool_schemas()
        except Exception as e:
            logger.warning("tool schemas import failed: %s", e)
            tools_payload = None

    try:
        for _round in range(3):
            kwargs: dict = {
                "model": settings.openai_model,
                "messages": messages,
                "temperature": 0.4,
                "max_tokens": 800,
            }
            if tools_payload:
                kwargs["tools"] = tools_payload
                kwargs["tool_choice"] = "auto"
            resp = client.chat.completions.create(**kwargs)
            choice = resp.choices[0]
            msg = choice.message

            # If model wants to call tools
            tool_calls = getattr(msg, "tool_calls", None) or []
            if tool_calls and tools_payload and db is not None:
                from app.services.ai_tools import execute_tool
                # Append assistant message with tool_calls
                messages.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in tool_calls
                    ],
                })
                # Execute each tool, add result
                for tc in tool_calls:
                    try:
                        args = json.loads(tc.function.arguments or "{}")
                    except Exception:
                        args = {}
                    result = execute_tool(tc.function.name, args, db)
                    tool_calls_log.append({
                        "tool": tc.function.name,
                        "args": args,
                        "ok": "error" not in result,
                    })
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, ensure_ascii=False)[:8000],
                    })
                # Loop again — let model use the tool results
                continue

            # No more tool calls → final answer
            return (msg.content or None), tool_calls_log

        # Hit max rounds — return whatever we have
        return None, tool_calls_log
    except Exception as e:
        logger.warning(f"OpenAI chat failed: {e}")
        return None, tool_calls_log


# ---------------------------------------------------------------------------
# Rule-based ответы (fallback)
# ---------------------------------------------------------------------------

def _rule_public(db: Session, question: str) -> str:
    overview = get_city_overview(db)
    stats = get_city_statistics(db)
    intent = detect_intent(question)

    if intent == "worst_district":
        worst = sorted(stats.districts, key=lambda d: d.overall_score)[:3]
        lines = ["**Самые проблемные районы:**\n"]
        for i, d in enumerate(worst, 1):
            lines.append(f"{i}. **{d.district_name}** — {d.overall_score}/100, "
                         f"население {_ru_num(d.population)}")
        return "\n".join(lines)

    if intent == "best_district":
        best = sorted(stats.districts, key=lambda d: d.overall_score, reverse=True)[:3]
        lines = ["**Лидеры по обеспеченности:**\n"]
        for i, d in enumerate(best, 1):
            lines.append(f"{i}. **{d.district_name}** — {d.overall_score}/100")
        return "\n".join(lines)

    if intent == "deficit":
        gaps = overview.coverage_gaps[:5]
        if not gaps:
            return "Критического дефицита не выявлено."
        lines = ["**Основные дефициты:**\n"]
        for g in gaps:
            lines.append(f"- **{g.district_name}**: {g.facility_type} — дефицит {g.deficit_percent}%")
        return "\n".join(lines)

    return (f"В городе {stats.total_facilities} объектов социальной инфраструктуры, "
            f"общая оценка {stats.overall_score}/100. Спросите про конкретный район или тип объекта.")


def _rule_business(db: Session, question: str) -> str:
    counts = get_business_counts(db)
    by_dist = get_business_by_district(db)
    total = sum(counts.values())
    intent = detect_intent(question)

    if intent in ("where_open", "best_district", "competition"):
        from app.models.business import BusinessCategory, CATEGORY_LABELS
        q = question.lower()
        cat_guess = None
        for cat in BusinessCategory:
            label = CATEGORY_LABELS.get(cat, cat.value).lower()
            if label and label[:-1] in q:
                cat_guess = cat
                break
        if cat_guess:
            best = find_best_locations(db, cat_guess, 3)
            lines = [f"**Топ-3 района для «{CATEGORY_LABELS[cat_guess]}»:**\n"]
            for i, b in enumerate(best, 1):
                lines.append(f"{i}. **{b['district_name']}** — оценка {b['score']}/100, "
                             f"{b['existing_count']} конкурентов")
            return "\n".join(lines)

    if intent == "deficit":
        worst = sorted([d for d in by_dist if d["population"] > 0],
                       key=lambda x: x["businesses_per_10k"])[:3]
        lines = ["**Районы с низкой деловой активностью:**\n"]
        for d in worst:
            lines.append(f"- **{d['district_name']}** — {d['total_businesses']} бизн., "
                         f"{d['businesses_per_10k']}/10К")
        return "\n".join(lines)

    return (f"В базе {_ru_num(total)} бизнесов в {len(by_dist)} районах. "
            f"Задайте вопрос: «где лучше открыть кафе?» или «какая конкуренция в Алмалинском?»")


def _rule_eco(db: Session, question: str) -> str:
    eco = get_city_eco(db)
    intent = detect_intent(question)

    if intent in ("worst_district", "air_quality"):
        worst = sorted(eco["districts"], key=lambda x: x["aqi"], reverse=True)[:3]
        lines = [f"**Воздух в Алматы: AQI {eco['city_aqi']} "
                 f"({eco['city_aqi_category']['label']})**\n",
                 "**Худшие районы:**"]
        for d in worst:
            lines.append(f"- **{d['district_name']}** — AQI {d['aqi']} ({d['aqi_category']['label']})")
        return "\n".join(lines)

    if intent == "best_district":
        best = sorted(eco["districts"], key=lambda x: x["eco_score"], reverse=True)[:3]
        lines = ["**Лучшие по экологии:**\n"]
        for d in best:
            lines.append(f"- **{d['district_name']}** — {d['eco_score']}/100, AQI {d['aqi']}, "
                         f"зелени {d['green_m2_per_capita']} м²/чел")
        return "\n".join(lines)

    if intent == "green":
        lines = ["**Озеленение (норма: 16 м²/чел):**\n"]
        for d in sorted(eco["districts"], key=lambda x: x["green_m2_per_capita"], reverse=True):
            mark = "✅" if d["green_m2_per_capita"] >= 16 else "⚠️"
            lines.append(f"{mark} {d['district_name']}: {d['green_m2_per_capita']} м²/чел")
        return "\n".join(lines)

    if intent == "traffic":
        from app.services.eco_analytics import TRAFFIC_INDEX
        lines = ["**Плотность авто (на 1000 жит.):**\n"]
        for name, t in sorted(TRAFFIC_INDEX.items(), key=lambda x: -x[1]):
            lines.append(f"- {name}: {t}")
        return "\n".join(lines)

    cat = eco["city_aqi_category"]
    return (f"AQI Алматы: **{eco['city_aqi']}** — {cat['label']}. {cat['advice']}\n\n"
            f"Спросите про воздух, зелень, трафик или конкретный район.")


_RULE_DISPATCH = {"public": _rule_public, "business": _rule_business, "eco": _rule_eco}


# ---------------------------------------------------------------------------
# Публичный API
# ---------------------------------------------------------------------------

def chat(
    db: Session, mode: Mode, message: str,
    district_focus: str | None = None,
    simulator_state: dict | None = None,
    user_profile: dict | None = None,
    history: list[dict] | None = None,
) -> dict:
    """Главный вход чата. Сначала пробует LLM, при сбое — rule-based.

    Дополнительно принимает:
    - district_focus: текущий выбранный район (для контекстных ответов)
    - simulator_state: текущие what-if добавки в симуляторе
    - user_profile: профиль пользователя (район, болезни, активности, семья)
    - history: предыдущие сообщения этой сессии (max 10)

    AI будет отвечать с учётом ВСЕГО переданного контекста.
    """
    context = _build_context(db, mode)
    if district_focus:
        context["focus_district"] = district_focus
    if simulator_state:
        context["simulator_state"] = simulator_state
    if user_profile:
        context["user_profile"] = user_profile
    answer, tool_log = _llm_chat(mode, message, context, history=history, db=db)
    engine = "openai-" + settings.openai_model + ("+tools" if tool_log else "")

    if not answer:
        answer = _RULE_DISPATCH.get(mode, _rule_public)(db, message)
        engine = "aqyl-rule-v1"

    return {
        "mode": mode,
        "answer": answer,
        "intent": detect_intent(message),
        "focus_district": district_focus,
        "tool_calls": tool_log,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "engine": engine,
    }


# ---------------------------------------------------------------------------
# AI-отчёты
# ---------------------------------------------------------------------------

REPORT_PROMPTS: dict[str, str] = {
    "public": (
        "Сгенерируй аналитический отчёт по общественной инфраструктуре Алматы на основе JSON-контекста. "
        "Структура обязательная:\n"
        "# AQYL CITY — Отчёт по общественной инфраструктуре Алматы\n"
        "## Сводка (ключевые цифры: население, объектов, общая оценка)\n"
        "## Ключевые дефициты (топ-3-5 с конкретными цифрами покрытия)\n"
        "## Лидеры районов\n"
        "## Отстающие районы\n"
        "## Рекомендации (3-5 конкретных шагов, привязанных к СНиП РК)\n\n"
        "Язык: русский. Цифры — только из контекста, не выдумывай. Максимум 400 слов."
    ),
    "business": (
        "Сгенерируй аналитический отчёт по бизнес-ландшафту Алматы.\n"
        "# AQYL CITY — Отчёт по бизнес-ландшафту Алматы\n"
        "## Сводка (общее число бизнесов, охват районов)\n"
        "## Топ категории\n"
        "## Насыщенные и недоразвитые районы (с плотностью на 10К)\n"
        "## Возможности (где ниша свободнее всего)\n"
        "## Рекомендации предпринимателям\n\n"
        "Русский, только из контекста, максимум 400 слов."
    ),
    "eco": (
        "Сгенерируй экологический отчёт по Алматы.\n"
        "# AQYL CITY — Экологический отчёт по Алматы\n"
        "## Сводка (городской AQI, eco-score, озеленение)\n"
        "## Худшие районы по воздуху\n"
        "## Лучшие районы по эко-оценке\n"
        "## Главные проблемы (из top_city_issues)\n"
        "## Рекомендации и прогноз\n\n"
        "Русский, опирайся на стандарты AQI и норматив 16 м²/чел зелени, максимум 400 слов."
    ),
}


def _grade(score: float) -> str:
    if score >= 85: return "A"
    if score >= 70: return "B"
    if score >= 55: return "C"
    if score >= 40: return "D"
    return "E"


def _llm_report(mode: Mode, context: dict[str, Any]) -> str | None:
    client = _get_client()
    if not client:
        return None
    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content":
                 "Ты AQYL AI, аналитик smart-city для Алматы. Пишешь только факты из JSON-контекста."},
                {"role": "user", "content":
                 f"{REPORT_PROMPTS[mode]}\n\nКонтекст:\n```json\n{json.dumps(context, ensure_ascii=False, indent=2)}\n```"},
            ],
            temperature=0.35,
            max_tokens=1200,
        )
        return resp.choices[0].message.content or None
    except Exception as e:
        logger.warning(f"OpenAI report failed: {e}")
        return None


def _template_report_public(db: Session) -> str:
    stats = get_city_statistics(db)
    overview = get_city_overview(db)
    worst = sorted(stats.districts, key=lambda d: d.overall_score)[:3]
    best = sorted(stats.districts, key=lambda d: d.overall_score, reverse=True)[:3]
    deficits = sorted(
        [f for f in stats.facilities if f.coverage_percent < 100 and f.norm_per_10k > 0],
        key=lambda f: f.coverage_percent,
    )
    md = [
        "# AQYL CITY — Отчёт по общественной инфраструктуре Алматы",
        f"_Сформировано {datetime.utcnow():%Y-%m-%d %H:%M UTC}_\n",
        "## Сводка",
        f"- Население: **{_ru_num(stats.total_population)}** чел.",
        f"- Объектов: **{_ru_num(stats.total_facilities)}**",
        f"- Общая оценка: **{stats.overall_score}/100** (грейд {_grade(stats.overall_score)})\n",
    ]
    if deficits:
        md.append("## Ключевые дефициты")
        for d in deficits[:5]:
            md.append(f"- **{d.label_ru}** — покрытие {d.coverage_percent}%, "
                      f"нужно добавить **{d.deficit}** объектов")
    md.append("\n## Лидеры")
    for d in best:
        md.append(f"- {d.district_name} — {d.overall_score}/100")
    md.append("\n## Отстающие")
    for d in worst:
        md.append(f"- {d.district_name} — {d.overall_score}/100")
    if overview.coverage_gaps:
        md.append("\n## Критические gap-ы")
        for g in overview.coverage_gaps[:8]:
            md.append(f"- {g.district_name} · {g.facility_type} — −{g.deficit_percent}%")
    md += [
        "\n## Рекомендации",
        "1. Приоритезировать строительство объектов с наименьшим покрытием.",
        "2. Использовать drag-drop симулятор для оценки эффекта инвестиций.",
        "3. Синхронизировать генплан с нормативами СНиП РК 3.01-01-2008.",
    ]
    return "\n".join(md)


def _template_report_business(db: Session) -> str:
    counts = get_business_counts(db)
    by_dist = get_business_by_district(db)
    total = sum(counts.values())
    top = sorted(counts.items(), key=lambda x: -x[1])[:5]
    best = sorted(by_dist, key=lambda x: -x["businesses_per_10k"])[:3]
    worst = [d for d in sorted(by_dist, key=lambda x: x["businesses_per_10k"]) if d["population"] > 0][:3]
    md = [
        "# AQYL CITY — Отчёт по бизнес-ландшафту Алматы",
        f"_Сформировано {datetime.utcnow():%Y-%m-%d %H:%M UTC}_\n",
        "## Сводка",
        f"- Бизнесов: **{_ru_num(total)}**",
        f"- Активных районов: **{len([d for d in by_dist if d['total_businesses'] > 0])}**\n",
        "## Топ категории",
    ]
    for cat, cnt in top:
        md.append(f"- **{cat}** — {_ru_num(cnt)}")
    md.append("\n## Насыщенные районы")
    for d in best:
        md.append(f"- {d['district_name']} — {d['businesses_per_10k']} на 10К")
    md.append("\n## Недоразвитые (свободные ниши)")
    for d in worst:
        md.append(f"- {d['district_name']} — {d['businesses_per_10k']} на 10К")
    md += [
        "\n## Рекомендации",
        "1. Используйте инструмент «Лучшая точка» для выбора района.",
        "2. Недоразвитые районы — меньше конкуренции, но проверьте платежеспособный спрос.",
        "3. Комбинируйте с общественным режимом: аптеки рядом с поликлиниками, кафе у школ/офисов.",
    ]
    return "\n".join(md)


def _template_report_eco(db: Session) -> str:
    eco = get_city_eco(db)
    worst = sorted(eco["districts"], key=lambda x: x["aqi"], reverse=True)[:3]
    best = sorted(eco["districts"], key=lambda x: x["eco_score"], reverse=True)[:3]
    md = [
        "# AQYL CITY — Экологический отчёт по Алматы",
        f"_Сформировано {datetime.utcnow():%Y-%m-%d %H:%M UTC}_\n",
        "## Сводка",
        f"- AQI города: **{eco['city_aqi']}** — {eco['city_aqi_category']['label']}",
        f"- Эко-оценка: **{eco['city_eco_score']}/100**",
        f"- Зелень: **{eco['city_green_m2_per_capita']} м²/жит.** (норма {eco['city_green_norm']})\n",
        "## Худшие по воздуху",
    ]
    for d in worst:
        md.append(f"- **{d['district_name']}** — AQI {d['aqi']} ({d['aqi_category']['label']})")
    md.append("\n## Лучшие по эко-оценке")
    for d in best:
        md.append(f"- **{d['district_name']}** — {d['eco_score']}/100 (грейд {d['eco_grade']})")
    md.append("\n## Главные проблемы")
    for i in eco["top_issues"][:5]:
        md.append(f"- **{i['label']}** — серьёзность {i['severity']}/100 (хуже всего: {i['worst_district']})")
    md += [
        "\n## Рекомендации",
        "1. Расширять парки в районах с дефицитом зелени.",
        "2. Развивать BRT и общественный транспорт для снижения автомобильных выбросов.",
        "3. Переход частного сектора с печного отопления на газ — главный рычаг против зимнего смога.",
        "4. Охранять зелёные зоны предгорий от плотной застройки.",
    ]
    return "\n".join(md)


_TEMPLATE_REPORT = {
    "public": _template_report_public,
    "business": _template_report_business,
    "eco": _template_report_eco,
}


def generate_report(db: Session, mode: Mode) -> dict:
    context = _build_context(db, mode)
    md = _llm_report(mode, context)
    engine = "openai-" + settings.openai_model

    if not md:
        md = _TEMPLATE_REPORT.get(mode, _template_report_public)(db)
        engine = "aqyl-template-v1"

    titles = {
        "public": "Общественная инфраструктура Алматы",
        "business": "Бизнес-ландшафт Алматы",
        "eco": "Экологический отчёт по Алматы",
    }

    return {
        "mode": mode,
        "title": titles.get(mode, "AQYL Report"),
        "markdown": md,
        "summary": context,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "engine": engine,
    }
