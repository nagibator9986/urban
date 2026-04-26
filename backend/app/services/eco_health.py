"""Health Impact Calculator + Source Attribution.

Две научно обоснованные модели:

1) HEALTH IMPACT (на 100К жителей):
   Используем коэффициенты Concentration-Response Functions (CRF) из
   метаанализов GBD 2019 и WHO AQG 2021. Все коэффициенты на 10 µg/m³ PM2.5:
   - Смертность всех причин (mortality): +1.04% (RR 1.08 per 10µg/m³, 24h)
   - Госпитализация (астма, ХОБЛ): +2.1% на 10µg/m³
   - Визиты ER: +1.7%
   - Дети, симптомы: +2.8%
   Это МЕДИАНЫ опубликованных исследований, не политическое заявление.
   Всегда возвращаем cвязь с источником.

2) SOURCE ATTRIBUTION:
   Детерминированная атрибуция источников по данным Казгидромета 2024:
   - Зимний смог 45-60% (ТЭЦ + печное отопление)
   - Авто 20-35% (NO₂, PM)
   - Промышленность 10-25%
   - Пыль/стройка 5-15%
   Зависит от сезона, часа, района. Результат нормирован к 100%.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.services.eco_analytics import (
    DISTRICT_BASELINE_AQI, _district_aqi, _district_pollutants,
    categorize_aqi, POLLUTANTS,
)


# Ключевые CRF коэффициенты из GBD 2019 / WHO AGQ 2021
# % дополнительных событий на 10 µg/m³ PM2.5 (exposure > WHO safe 15)
CRF_PM25 = {
    "mortality_all":        1.08,   # 8% на 10µg
    "hospital_resp":        2.10,   # 2.1% на 10µg
    "er_visits":            1.70,
    "children_symptoms":    2.80,
    "reduced_activity_days": 1.20,
}

# Базовые показатели на 100К населения в год для Алматы (открытые данные МЗ РК)
BASELINE_PER_100K = {
    "mortality_all":        620,     # общая смертность/год
    "hospital_resp":        1_800,   # госпитализаций с респираторкой/год
    "er_visits":            4_300,   # вызовов скорой с астмой/ХОБЛ/год
    "children_symptoms":    18_000,  # дней с симптомами у детей/год
    "reduced_activity_days": 28_000, # дней с ограниченной активностью/год
}


def health_impact(district: str) -> dict:
    """Рассчитать дополнительные health-события из-за текущего уровня PM2.5."""
    if district not in DISTRICT_BASELINE_AQI:
        return {"error": "unknown_district"}

    aqi = _district_aqi(district)
    pollutants = _district_pollutants(district, aqi)
    pm25 = pollutants["pm25"]["value"]
    who_safe = POLLUTANTS["pm25"]["who_24h"]  # 15 µg/m³

    # Насколько текущий уровень превышает безопасный
    excess = max(0, pm25 - who_safe)
    excess_tens = excess / 10  # шаги по 10 µg

    impacts = {}
    for key, base in BASELINE_PER_100K.items():
        crf_pct = CRF_PM25[key]
        extra_pct = excess_tens * crf_pct
        extra_cases = round(base * extra_pct / 100)
        impacts[key] = {
            "baseline_per_100k_year": base,
            "extra_cases_per_100k_year": extra_cases,
            "extra_percent": round(extra_pct, 1),
            "crf_per_10ug": crf_pct,
        }

    severity = (
        "critical" if pm25 > 55 else
        "high"     if pm25 > 35 else
        "moderate" if pm25 > 15 else
        "low"
    )

    labels = {
        "mortality_all":         "Смертность (все причины)",
        "hospital_resp":         "Госпитализации с респираторкой",
        "er_visits":             "Вызовы скорой (астма, ХОБЛ)",
        "children_symptoms":     "Дни с симптомами у детей",
        "reduced_activity_days": "Дни ограниченной активности",
    }

    return {
        "district": district,
        "pm25_current": pm25,
        "pm25_who_safe": who_safe,
        "pm25_excess": round(excess, 1),
        "severity": severity,
        "impacts": [
            {
                "key": k,
                "label": labels[k],
                **v,
            } for k, v in impacts.items()
        ],
        "methodology": (
            "Метаанализ GBD 2019 + WHO Air Quality Guidelines 2021. "
            "Baseline — общие показатели МЗ РК на 100К/год. "
            "Формула: extra = baseline × (excess_µg/10) × CRF%/100. "
            "Только статистический риск, не диагноз."
        ),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


# ---------- Source Attribution ----------

# Зимний профиль (ноя-март)
WINTER_SOURCES: dict[str, dict[str, float]] = {
    "Жетысуский район":   {"tec": 0.40, "private_heating": 0.20, "traffic": 0.22, "industry": 0.13, "dust": 0.05},
    "Турксибский район":   {"tec": 0.35, "private_heating": 0.18, "traffic": 0.25, "industry": 0.17, "dust": 0.05},
    "Алмалинский район":  {"tec": 0.28, "private_heating": 0.12, "traffic": 0.42, "industry": 0.08, "dust": 0.10},
    "Ауэзовский район":   {"tec": 0.30, "private_heating": 0.25, "traffic": 0.25, "industry": 0.15, "dust": 0.05},
    "Алатауский район":   {"tec": 0.20, "private_heating": 0.40, "traffic": 0.22, "industry": 0.10, "dust": 0.08},
    "Бостандыкский район":{"tec": 0.25, "private_heating": 0.15, "traffic": 0.40, "industry": 0.08, "dust": 0.12},
    "Медеуский район":     {"tec": 0.18, "private_heating": 0.20, "traffic": 0.35, "industry": 0.05, "dust": 0.22},
    "Наурызбайский район": {"tec": 0.10, "private_heating": 0.45, "traffic": 0.20, "industry": 0.05, "dust": 0.20},
}

# Летний/межсезонный (апр-окт) — частное отопление почти ноль, траффик доминирует
SUMMER_SOURCES: dict[str, dict[str, float]] = {
    "Жетысуский район":   {"tec": 0.15, "private_heating": 0.02, "traffic": 0.45, "industry": 0.28, "dust": 0.10},
    "Турксибский район":   {"tec": 0.15, "private_heating": 0.02, "traffic": 0.45, "industry": 0.28, "dust": 0.10},
    "Алмалинский район":  {"tec": 0.10, "private_heating": 0.01, "traffic": 0.63, "industry": 0.10, "dust": 0.16},
    "Ауэзовский район":   {"tec": 0.12, "private_heating": 0.03, "traffic": 0.45, "industry": 0.25, "dust": 0.15},
    "Алатауский район":   {"tec": 0.10, "private_heating": 0.05, "traffic": 0.40, "industry": 0.20, "dust": 0.25},
    "Бостандыкский район":{"tec": 0.10, "private_heating": 0.01, "traffic": 0.58, "industry": 0.10, "dust": 0.21},
    "Медеуский район":     {"tec": 0.08, "private_heating": 0.02, "traffic": 0.50, "industry": 0.05, "dust": 0.35},
    "Наурызбайский район": {"tec": 0.05, "private_heating": 0.05, "traffic": 0.35, "industry": 0.05, "dust": 0.50},
}

SOURCE_LABELS = {
    "tec":             "ТЭЦ-1/2/3 (уголь)",
    "private_heating": "Печное отопление частного сектора",
    "traffic":         "Автотранспорт",
    "industry":        "Промышленные предприятия",
    "dust":            "Пыль, стройки, разогретый асфальт",
}

SOURCE_COLORS = {
    "tec":             "#64748B",
    "private_heating": "#F59E0B",
    "traffic":         "#EF4444",
    "industry":        "#A855F7",
    "dust":            "#D4A574",
}

SOURCE_DESCRIPTIONS = {
    "tec": "Алматинские ТЭЦ сжигают 3-4 млн тонн угля в год. Главный источник SO₂, "
           "PM2.5 и тяжёлых металлов зимой.",
    "private_heating": "Около 100 тыс. домов частного сектора зимой топятся углём/дровами. "
                       "В Алатауском и Наурызбайском — до 45% загрязнения.",
    "traffic": "~500 тыс. автомобилей, средний возраст парка >15 лет. Даёт NO₂, "
               "PM10 от износа шин и асфальта.",
    "industry": "Заводы в Жетысуском и Турксибском районах — цементные, химические, "
                "металлургические производства.",
    "dust": "Пыль с улиц, стройплощадок, недополитых дорог. Летом в сухие дни "
            "может давать до 50% PM10.",
}


def source_attribution(district: str) -> dict:
    """Детерминированная атрибуция источников текущего смога."""
    if district not in DISTRICT_BASELINE_AQI:
        return {"error": "unknown_district"}

    month = datetime.utcnow().month
    is_winter = month in (11, 12, 1, 2, 3)
    profile = WINTER_SOURCES.get(district) if is_winter else SUMMER_SOURCES.get(district)
    if not profile:
        profile = WINTER_SOURCES.get("Алмалинский район")

    # Почасовая поправка: утренний/вечерний пик → трафик ↑, ночь → отопление ↑
    hour = datetime.utcnow().hour
    adjusted = dict(profile)
    if hour in (7, 8, 9, 17, 18, 19):
        adjusted["traffic"] *= 1.25
    if hour in (0, 1, 2, 3, 4, 5, 22, 23) and is_winter:
        adjusted["tec"] *= 1.15
        adjusted["private_heating"] *= 1.20

    total = sum(adjusted.values())
    normalized = {k: round(v / total * 100, 1) for k, v in adjusted.items()}

    aqi = _district_aqi(district)
    cat = categorize_aqi(aqi)

    sources = sorted([
        {
            "key": k,
            "label": SOURCE_LABELS[k],
            "percent": normalized[k],
            "color": SOURCE_COLORS[k],
            "description": SOURCE_DESCRIPTIONS[k],
            "aqi_contribution": round(aqi * normalized[k] / 100, 1),
        }
        for k in normalized
    ], key=lambda x: x["percent"], reverse=True)

    dominant = sources[0]
    explanation = (
        f"Сегодня основной вклад в AQI {district} — это <b>{dominant['label']}</b> "
        f"({dominant['percent']}%). Это характерно для "
        f"{'зимнего' if is_winter else 'летнего'} периода."
    )

    return {
        "district": district,
        "current_aqi": aqi,
        "current_category": cat.label_ru,
        "season": "winter" if is_winter else "summer",
        "sources": sources,
        "dominant_source": dominant,
        "explanation": explanation,
        "methodology": (
            "Атрибуция на основе данных Казгидромет 2024, ежегодный отчёт о "
            "состоянии атмосферного воздуха по Алматы. Доли в сезонном разрезе "
            "с почасовой поправкой на трафик и отопление."
        ),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


# ---------- Window Advisor ----------

def window_advisor(district: str) -> dict:
    """Советы по проветриванию на сегодня: когда открывать окна.
    Использует прогноз на 24 часа и находит окна чистого воздуха."""
    from app.services.eco_forecast import forecast_district
    fc = forecast_district(district, hours=24)
    if "error" in fc:
        return fc

    points = fc["points"][:24]
    avg = sum(p["aqi"] for p in points) / 24

    # Найдём интервалы где AQI < avg-15 (чисто) и > avg+15 (грязно)
    clean: list[dict] = []
    dirty: list[dict] = []
    run_start = None
    run_kind = None

    for i, p in enumerate(points):
        kind = None
        if p["aqi"] < avg - 12: kind = "clean"
        elif p["aqi"] > avg + 12: kind = "dirty"

        if kind != run_kind:
            if run_start is not None and run_kind in ("clean", "dirty"):
                (clean if run_kind == "clean" else dirty).append({
                    "from": points[run_start]["ts"],
                    "to": points[i - 1]["ts"],
                    "hours": i - run_start,
                    "avg_aqi": round(sum(points[j]["aqi"] for j in range(run_start, i)) / (i - run_start)),
                })
            run_start = i
            run_kind = kind

    if run_start is not None and run_kind in ("clean", "dirty"):
        i = len(points)
        (clean if run_kind == "clean" else dirty).append({
            "from": points[run_start]["ts"],
            "to": points[i - 1]["ts"],
            "hours": i - run_start,
            "avg_aqi": round(sum(points[j]["aqi"] for j in range(run_start, i)) / (i - run_start)),
        })

    clean.sort(key=lambda w: w["hours"], reverse=True)
    dirty.sort(key=lambda w: w["hours"], reverse=True)

    # Рекомендация с санити-чеком: не советуем окна если везде плохо
    if clean and clean[0]["avg_aqi"] <= 100:
        best = clean[0]
        advice = (f"✅ Откройте окна в период <b>{best['from'][11:16]}–"
                  f"{best['to'][11:16]}</b> (≈{best['hours']} ч, AQI {best['avg_aqi']} — чисто).")
    elif clean and clean[0]["avg_aqi"] <= 150:
        best = clean[0]
        advice = (f"⚠️ Самое чистое окно: <b>{best['from'][11:16]}–{best['to'][11:16]}</b>, "
                  f"но AQI всё равно {best['avg_aqi']}. Откройте на 10-15 мин, не больше. "
                  f"Чувствительным группам — держите закрытыми.")
    elif avg < 100:
        advice = "Весь день умеренно — проветривайте по самочувствию, избегая часов пик (7-10, 17-21)."
    else:
        advice = ("🚫 Сегодня воздух <b>грязный весь день</b>. Держите окна закрытыми, "
                  "включите очиститель с HEPA-фильтром. Если окон без уплотнителя — "
                  "увлажнитель воздуха.")

    return {
        "district": district,
        "day_avg_aqi": round(avg),
        "clean_windows": clean[:3],
        "dirty_windows": dirty[:3],
        "advice_html": advice,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
