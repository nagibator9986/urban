"""Сравнение Алматы с другими городами мира.

Источник данных: **WHO Ambient Air Pollution Database 2022 update**
(PM2.5 annual mean, µg/m³, последний доступный год на город).

URL источника: https://www.who.int/data/gho/data/themes/air-pollution

Текущий AQI Алматы берём динамически из нашего eco_analytics.

Города выбраны как:
- 3 «столицы смога»: Дели, Пекин, Лахор
- 3 «условный бенчмарк»: Сеул, Варшава, Сантьяго
- 3 «чистые»: Хельсинки, Ванкувер, Веллингтон
- 3 «соседи»: Астана, Ташкент, Бишкек

Все значения документированы полем `source_year` и `source_note`.
"""

from __future__ import annotations

from datetime import datetime

from app.services.eco_analytics import get_city_eco
from sqlalchemy.orm import Session


# WHO AQG 2021 annual PM2.5 guideline value
WHO_ANNUAL_PM25 = 5.0  # µg/m³


# Annual-mean PM2.5 (µg/m³) — WHO AAP 2022 + local monitoring authorities.
# Year is the latest reliable year in the source dataset.
CITY_DATA: list[dict] = [
    # Polluted megacities
    {
        "city": "Дели",
        "country": "Индия",
        "lat": 28.61, "lon": 77.21,
        "pm25_annual": 92.7, "source_year": 2022,
        "group": "polluted",
        "source_note": "CPCB India + WHO AAP 2022",
    },
    {
        "city": "Лахор",
        "country": "Пакистан",
        "lat": 31.55, "lon": 74.34,
        "pm25_annual": 89.5, "source_year": 2022,
        "group": "polluted",
        "source_note": "IQAir World Air Quality 2023",
    },
    {
        "city": "Пекин",
        "country": "Китай",
        "lat": 39.90, "lon": 116.41,
        "pm25_annual": 34.0, "source_year": 2022,
        "group": "polluted",
        "source_note": "Beijing MEE 2022",
    },
    # Comparable tier
    {
        "city": "Сеул",
        "country": "Южная Корея",
        "lat": 37.57, "lon": 126.98,
        "pm25_annual": 18.0, "source_year": 2022,
        "group": "comparable",
        "source_note": "KOSIS / AirKorea 2022",
    },
    {
        "city": "Варшава",
        "country": "Польша",
        "lat": 52.23, "lon": 21.01,
        "pm25_annual": 14.8, "source_year": 2022,
        "group": "comparable",
        "source_note": "GIOŚ (Inspekcja Ochrony Środowiska) 2022",
    },
    {
        "city": "Сантьяго",
        "country": "Чили",
        "lat": -33.45, "lon": -70.66,
        "pm25_annual": 21.5, "source_year": 2022,
        "group": "comparable",
        "source_note": "SINCA MMA Chile 2022",
    },
    # Clean benchmarks
    {
        "city": "Хельсинки",
        "country": "Финляндия",
        "lat": 60.17, "lon": 24.94,
        "pm25_annual": 5.4, "source_year": 2022,
        "group": "clean",
        "source_note": "HSY / EEA 2022",
    },
    {
        "city": "Ванкувер",
        "country": "Канада",
        "lat": 49.28, "lon": -123.12,
        "pm25_annual": 6.5, "source_year": 2022,
        "group": "clean",
        "source_note": "Metro Vancouver AQ Reports 2022",
    },
    {
        "city": "Веллингтон",
        "country": "Новая Зеландия",
        "lat": -41.29, "lon": 174.78,
        "pm25_annual": 4.3, "source_year": 2022,
        "group": "clean",
        "source_note": "Stats NZ Environmental Indicators 2023",
    },
    # Regional peers
    {
        "city": "Астана",
        "country": "Казахстан",
        "lat": 51.17, "lon": 71.45,
        "pm25_annual": 31.0, "source_year": 2023,
        "group": "peer",
        "source_note": "Казгидромет 2023",
    },
    {
        "city": "Ташкент",
        "country": "Узбекистан",
        "lat": 41.31, "lon": 69.24,
        "pm25_annual": 40.5, "source_year": 2022,
        "group": "peer",
        "source_note": "IQAir World AQ Report 2023",
    },
    {
        "city": "Бишкек",
        "country": "Киргизия",
        "lat": 42.87, "lon": 74.59,
        "pm25_annual": 55.0, "source_year": 2022,
        "group": "peer",
        "source_note": "IQAir 2023 (weighted annual)",
    },
]


GROUP_META = {
    "polluted":   {"label": "Города-смог",     "color": "#EF4444"},
    "comparable": {"label": "Похожий уровень",   "color": "#F59E0B"},
    "clean":      {"label": "Бенчмарк чистых",   "color": "#10B981"},
    "peer":       {"label": "Регион (Центр.Азия)","color": "#A855F7"},
}


def _aqi_from_pm25(pm25: float) -> int:
    """EPA AQI breakpoints for PM2.5 (24h avg)."""
    bp = [
        (0.0,  12.0,  0,   50),
        (12.1, 35.4,  51,  100),
        (35.5, 55.4,  101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 500.4, 301, 500),
    ]
    for clow, chigh, ilow, ihigh in bp:
        if clow <= pm25 <= chigh:
            return round((ihigh - ilow) / (chigh - clow) * (pm25 - clow) + ilow)
    return 500


def compare_cities(db: Session) -> dict:
    """Возвращает ранжированный список городов + Алматы для сравнения."""
    almaty_eco = get_city_eco(db)
    almaty_aqi = almaty_eco["city_aqi"]

    # Алматы PM2.5 — из первого района с данными (усреднение уже есть в city_aqi)
    first_d = almaty_eco["districts"][0] if almaty_eco.get("districts") else {}
    almaty_pm25 = first_d.get("pollutants", {}).get("pm25", {}).get("value")
    if almaty_pm25 is None:
        # Fallback: крупная приближённая оценка по AQI
        almaty_pm25 = max(0.0, min(250.0, (almaty_aqi - 50) * 0.55 + 12.0))

    items = []
    for city in CITY_DATA:
        pm = city["pm25_annual"]
        items.append({
            **city,
            "group_label": GROUP_META[city["group"]]["label"],
            "group_color": GROUP_META[city["group"]]["color"],
            "aqi_approx": _aqi_from_pm25(pm),
            "who_times_over": round(pm / WHO_ANNUAL_PM25, 1),
        })

    almaty_item = {
        "city": "Алматы",
        "country": "Казахстан",
        "lat": 43.24, "lon": 76.95,
        "pm25_annual": round(almaty_pm25, 1),
        "source_year": datetime.utcnow().year,
        "group": "self",
        "group_label": "Алматы (сейчас)",
        "group_color": "#2DD4BF",
        "aqi_approx": almaty_aqi,
        "who_times_over": round(almaty_pm25 / WHO_ANNUAL_PM25, 1),
        "source_note": "Казгидромет + собственная модель AQYL (текущий)",
    }

    # Ranking: Almaty among all
    all_items = items + [almaty_item]
    all_items.sort(key=lambda x: x["pm25_annual"])
    for i, it in enumerate(all_items, 1):
        it["rank_by_pm25"] = i

    rank_almaty = next(it["rank_by_pm25"] for it in all_items if it["city"] == "Алматы")
    cleaner_cities = rank_almaty - 1
    dirtier_cities = len(all_items) - rank_almaty

    # Narrative summary
    summary = (
        f"Алматы сейчас PM2.5 ≈ **{almaty_item['pm25_annual']} µg/m³**, "
        f"что в **{almaty_item['who_times_over']}×** превышает норму ВОЗ "
        f"({WHO_ANNUAL_PM25} µg/m³). В нашем наборе: "
        f"{cleaner_cities} город{_plural(cleaner_cities, '', 'а', 'ов')} чище, "
        f"{dirtier_cities} — грязнее."
    )

    return {
        "almaty": almaty_item,
        "cities": items,
        "all_ranked": all_items,
        "who_annual_guideline": WHO_ANNUAL_PM25,
        "groups": [
            {"key": k, **v} for k, v in GROUP_META.items()
        ],
        "rank_summary": {
            "total": len(all_items),
            "almaty_rank": rank_almaty,
            "cleaner_cities": cleaner_cities,
            "dirtier_cities": dirtier_cities,
        },
        "summary_html": summary,
        "methodology": (
            "Данные PM2.5 — годовые средние из WHO Ambient Air Pollution Database 2022 "
            "и локальных метео-агентств (CPCB India, GIOŚ Poland, SINCA Chile, "
            "Казгидромет, IQAir World AQ Report). AQI рассчитан по формулам "
            "US EPA (PM2.5 breakpoints). Норма ВОЗ AQG 2021 — 5 µg/m³/год."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def _plural(n: int, one: str, few: str, many: str) -> str:
    abs_n = abs(n) % 100
    n1 = abs_n % 10
    if abs_n > 10 and abs_n < 20:
        return many
    if n1 > 1 and n1 < 5:
        return few
    if n1 == 1:
        return one
    return many
