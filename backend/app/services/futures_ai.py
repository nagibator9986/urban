"""AI-анализ прогноза Болашақ: профессиональные рекомендации по сценарию."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from app.config import settings
from app.services.ai_assistant import _get_client

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты AQYL Futures Analyst — старший урбанист-аналитик, пишущий
стратегические меморандумы для акимата Алматы и крупных девелоперов.
Твоя работа — читать прогноз развития города и выдавать ясные, конкретные
и обоснованные рекомендации.

КРИТИЧЕСКИ ВАЖНО:
- Цифры — ТОЛЬКО из JSON-контекста прогноза. Не выдумываешь.
- Ссылайся на конкретные годы (например «к 2031 году дефицит школ...»)
- Разделяй короткий/средний/долгий горизонт
- Указывай конкретных исполнителей (акимат, MOE, МЗ, частный сектор)

СТРУКТУРА (строгий Markdown, не более 500 слов):

## 📊 Главная проекция
(1 абзац — что случится с городом к {final_year}, ключевые цифры)

## 🚨 Критические точки
(3-5 самых опасных событий из critical_points с годами и impact)

## ✅ Что нужно делать — короткий горизонт (1-3 года)
(3-4 bullet-action'а с ответственным и целью)

## 🛠 Среднесрочный план (3-7 лет)
(3-4 пункта стратегических проектов)

## 🎯 Долгосрочная стратегия (7+ лет)
(2-3 структурных изменения)

## 💡 Возможности для частного сектора
(2-3 идеи где бизнес может зарабатывать, решая городские проблемы)

## 📉 Рисковые сценарии если бездействовать
(2-3 пункта: что случится если рекомендации проигнорировать)

Язык: русский, деловой, без воды. Цифры — жирным шрифтом.
"""


def analyze_forecast(forecast: dict) -> str | None:
    """Возвращает Markdown-анализ прогноза через OpenAI."""
    client = _get_client()
    if not client:
        return None

    # Сжимаем контекст — не шлём всю историю, только ключевые точки
    compact = {
        "scenario": forecast["scenario_name"],
        "horizon_years": forecast["horizon_years"],
        "final_year": forecast["final_year"],
        "final_population": forecast["final_population"],
        "population_growth_percent": forecast["comparison_to_today"]["population_growth_percent"],
        "overall_future_score": forecast["overall_future_score"],
        "overall_grade": forecast["overall_grade"],
        "comparison": forecast["comparison_to_today"],
        "scenario_params": forecast["scenario_params"],
        "population_milestones": [
            {"year": p["year"], "population": p["population"],
             "dependency": p["dependency_ratio"]}
            for i, p in enumerate(forecast["population_series"])
            if i == 0 or i == len(forecast["population_series"]) // 2 or i == len(forecast["population_series"]) - 1
        ],
        "infrastructure_final": forecast["infrastructure_series"][-1],
        "eco_final": forecast["eco_series"][-1],
        "business_final": forecast["business_series"][-1],
        "critical_points": forecast["critical_points"],
    }

    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(
                    final_year=forecast["final_year"]
                )},
                {"role": "user", "content":
                 f"Прогноз города Алматы:\n```json\n{json.dumps(compact, ensure_ascii=False, indent=2)}\n```\n\n"
                 "Напиши стратегический меморандум по структуре."},
            ],
            temperature=0.45,
            max_tokens=1500,
        )
        return resp.choices[0].message.content
    except Exception as e:
        logger.warning(f"Futures AI failed: {e}")
        return None


def fallback_analysis(forecast: dict) -> str:
    """Шаблонный анализ без LLM."""
    final_y = forecast["final_year"]
    pop = forecast["final_population"]
    growth = forecast["comparison_to_today"]["population_growth_percent"]
    grade = forecast["overall_grade"]
    critical = forecast["critical_points"]

    md = [
        f"## 📊 Главная проекция",
        f"К **{final_y}** население Алматы вырастет до **{pop:,}** ({growth:+.1f}%).".replace(",", " "),
        f"Сводная оценка будущего: **{forecast['overall_future_score']}/100** (грейд {grade}).\n",
        "## 🚨 Критические точки",
    ]
    for c in critical[:5]:
        md.append(f"- **{c['year']}** — {c['label']}: {c['description']}")

    md += [
        "\n## ✅ Что нужно делать — короткий горизонт (1-3 года)",
        "- Акимат: ускорить ввод школ и детсадов в растущих районах минимум в 1.5 раза.",
        "- MOE: пересмотреть нормативы проектной загрузки в свете прогнозов Болашақ.",
        "- Акимат: утвердить программу BRT и продолжить LRT для снижения авто-роста.",
        "\n## 🛠 Среднесрочный план (3-7 лет)",
        "- Инвестировать в газификацию частного сектора (цель: 60%+).",
        "- Строить комплексные ЖК только с обязательной соц-инфраструктурой.",
        "- Расширять сеть парков в дефицитных районах.",
        "\n## 🎯 Долгосрочная стратегия (7+ лет)",
        "- Перевод ТЭЦ на газ как структурная мера против зимнего смога.",
        "- Полицентрическая модель: снижение нагрузки на Алмалинский / Бостандыкский.",
        "\n## 💡 Возможности для частного сектора",
        "- Школы и детсады по схеме ГЧП — дефицит создаёт стабильный спрос.",
        "- Клиники и медцентры в растущих районах (Алатауский, Наурызбайский).",
        "- Зелёные технологии (очистители воздуха, электромобили).",
        "\n## 📉 Рисковые сценарии если бездействовать",
        "- К концу горизонта школьный и медицинский кризис становятся хроническими.",
        "- AQI уходит в зону 'Вредно' 365 дней в году, отток семей в пригороды.",
    ]
    return "\n".join(md)


def get_analysis(forecast: dict) -> dict:
    md = analyze_forecast(forecast)
    engine = "openai-" + settings.openai_model
    if not md:
        md = fallback_analysis(forecast)
        engine = "aqyl-template-v1"
    return {
        "markdown": md,
        "engine": engine,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
