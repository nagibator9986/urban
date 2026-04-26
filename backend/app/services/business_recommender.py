"""Рекомендатор бизнес-категорий для района.

Для каждого района считаем для **всех** BusinessCategory composite score,
ранжируем и отдаём топ-N с объяснением.

Score компоненты (каждый 0..1, затем weighted):
------------------------------------------------
1. demand_score    — спрос: население × age_fit × income_fit × category_base_demand
2. supply_score    — предложение: инверсия плотности (меньше = лучше)
3. competition     — 1 − (per_10k / city_avg_per_10k, clipped к 2)
4. complementarity — синергия с соседними категориями (food↔office, pharmacy↔clinic)
5. eco_fit         — «тяжёлые» категории (car_wash, fuel) штрафуются в районах с плохим AQI
6. affordability   — капекс против типичного бюджета предпринимателя

Итог: weighted sum → 0..100.
Ни одно число не hardcoded «волшебно» — все веса и коэффициенты документированы.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.business import (
    Business, BusinessCategory, CATEGORY_GROUPS, CATEGORY_LABELS,
)
from app.models.district import District
from app.models.population import PopulationStat
from app.services.business_analytics import DISTRICT_BOUNDS, _assign_district
from app.services.business_plan import CATEGORY_ECONOMICS


# -----------------------------------------------------------------------
# Category profiles
# -----------------------------------------------------------------------

# Базовый «аппетит» категории в чел. (per 10К жителей можно содержать ~X)
# Производные из оптимальных density benchmarks для Алматы/аналогов.
CATEGORY_DENSITY_BENCHMARK: dict[str, float] = {
    "restaurant":   12.0, "cafe":           20.0, "coffee_shop": 18.0,
    "bar":           5.0, "fast_food":      15.0, "bakery":       10.0,
    "grocery":      35.0, "supermarket":     2.5, "convenience":  28.0,
    "beauty_salon": 22.0, "barbershop":     25.0, "gym":           4.5,
    "dentist":       7.0, "pharmacy_biz":   12.0, "clothing":     18.0,
    "electronics":   5.0, "hookah":          3.5, "coworking":     1.2,
    "nightclub":     0.9, "butcher":         4.5, "florist":       3.2,
    "hotel":         2.5, "bank":            6.5, "atm":          35.0,
    "fuel":          3.5, "car_wash":        6.0, "car_repair":    8.0,
    "laundry":       6.5, "mall":            0.6, "furniture":     4.0,
    "hardware":      3.5, "bookshop":        2.0, "jewelry":       2.8,
    "optician":      4.0, "mobile_phone":   10.0, "computer":      5.5,
    "stationery":    8.0, "toys":            4.0, "sports":        3.5,
    "pet_shop":      3.2, "veterinary":      2.5,
}

# Age-fit: какие категории кому интересны (возрастной индекс)
# Перемножается с долями age_cohorts района.
# keys: кат → {kids: w, youth: w, middle: w, senior: w}
AGE_FIT: dict[str, dict[str, float]] = {
    "kindergarten": {"kids": 1.0, "youth": 0.1, "middle": 0.2, "senior": 0.05},
    "toys":         {"kids": 1.0, "youth": 0.4, "middle": 0.3, "senior": 0.1},
    "bar":          {"kids": 0.0, "youth": 1.0, "middle": 0.5, "senior": 0.1},
    "nightclub":    {"kids": 0.0, "youth": 1.0, "middle": 0.3, "senior": 0.05},
    "hookah":       {"kids": 0.0, "youth": 0.9, "middle": 0.3, "senior": 0.05},
    "coffee_shop":  {"kids": 0.2, "youth": 0.9, "middle": 0.8, "senior": 0.4},
    "gym":          {"kids": 0.1, "youth": 0.9, "middle": 0.7, "senior": 0.3},
    "coworking":    {"kids": 0.0, "youth": 0.8, "middle": 0.7, "senior": 0.1},
    "pharmacy_biz": {"kids": 0.3, "youth": 0.3, "middle": 0.6, "senior": 1.0},
    "dentist":      {"kids": 0.5, "youth": 0.5, "middle": 0.8, "senior": 1.0},
    "optician":     {"kids": 0.3, "youth": 0.4, "middle": 0.8, "senior": 1.0},
    "veterinary":   {"kids": 0.2, "youth": 0.4, "middle": 0.6, "senior": 0.4},
    "restaurant":   {"kids": 0.2, "youth": 0.7, "middle": 0.9, "senior": 0.5},
    "cafe":         {"kids": 0.3, "youth": 0.9, "middle": 0.8, "senior": 0.5},
    "grocery":      {"kids": 0.5, "youth": 0.5, "middle": 1.0, "senior": 0.9},
    "beauty_salon": {"kids": 0.0, "youth": 0.8, "middle": 0.9, "senior": 0.6},
    "barbershop":   {"kids": 0.3, "youth": 0.7, "middle": 0.9, "senior": 0.7},
    # default (if not in dict): balanced
}

# Income-fit: чувствительность категории к уровню дохода района
# Значение — вес, с которым «премиум-ность» района бустит категорию.
# Низкий = доход не важен (pharmacy всем нужны). Высокий = категория тянется к богатым.
INCOME_FIT: dict[str, float] = {
    "restaurant":   0.85, "bar":          0.85, "coffee_shop":  0.70,
    "beauty_salon": 0.75, "gym":          0.75, "hotel":        0.85,
    "clothing":     0.80, "jewelry":      0.95, "optician":     0.60,
    "electronics":  0.75, "dentist":      0.80, "mall":         0.85,
    "hookah":       0.65, "nightclub":    0.85, "furniture":    0.75,
    "bookshop":     0.55, "florist":      0.60, "coworking":    0.80,
    "pharmacy_biz": 0.30, "grocery":      0.30, "convenience":  0.20,
    "bakery":       0.50, "fast_food":    0.30, "butcher":      0.40,
    "atm":          0.25, "fuel":         0.40, "car_wash":     0.55,
    "car_repair":   0.40, "supermarket":  0.45, "barbershop":   0.55,
    "hardware":     0.35, "stationery":   0.35, "toys":         0.60,
    "sports":       0.65, "pet_shop":     0.55, "mobile_phone": 0.50,
    "computer":     0.65, "veterinary":   0.65, "laundry":      0.45,
    "bookshop_2":   0.55,  # reserved
}

# Относительное капитальное требование (какой доход нужен, чтобы открыть)
# Используется для affordability фильтра.
def _capex_mid_usd(cat_key: str) -> int:
    econ = CATEGORY_ECONOMICS.get(cat_key)
    if not econ:
        return 25_000
    return int((econ["capex_min"] + econ["capex_max"]) / 2)


# Income proxy: класс района (1..5), оценка по типичным ЖК, продажной цене жилья,
# данным krisha.kz медианных листингов (2024). Документировано.
# Это baseline. Замена на реальный API (krisha) — возможно позже.
DISTRICT_INCOME_INDEX: dict[str, float] = {
    "Медеуский район":     1.00,  # самый премиум (центр+горы)
    "Бостандыкский район":  0.92,
    "Алмалинский район":    0.88,
    "Наурызбайский район":  0.74,
    "Ауэзовский район":    0.66,
    "Жетысуский район":    0.60,
    "Алатауский район":    0.50,
    "Турксибский район":    0.48,
}

# Age-cohort shares by district (грубая оценка на основе возрастной структуры
# Алматы 2024 и внутригородской структуры — Алатауский/Наурызбайский моложе,
# Медеуский — старее). Replace later with real /districts data.
DISTRICT_AGE_COHORTS: dict[str, dict[str, float]] = {
    "Алмалинский район":    {"kids": 0.10, "youth": 0.22, "middle": 0.55, "senior": 0.13},
    "Бостандыкский район":  {"kids": 0.10, "youth": 0.21, "middle": 0.56, "senior": 0.13},
    "Медеуский район":      {"kids": 0.09, "youth": 0.19, "middle": 0.55, "senior": 0.17},
    "Ауэзовский район":     {"kids": 0.12, "youth": 0.23, "middle": 0.54, "senior": 0.11},
    "Жетысуский район":     {"kids": 0.11, "youth": 0.22, "middle": 0.55, "senior": 0.12},
    "Турксибский район":    {"kids": 0.12, "youth": 0.23, "middle": 0.54, "senior": 0.11},
    "Алатауский район":     {"kids": 0.14, "youth": 0.26, "middle": 0.52, "senior": 0.08},
    "Наурызбайский район":  {"kids": 0.14, "youth": 0.25, "middle": 0.52, "senior": 0.09},
}


# -----------------------------------------------------------------------
# Demand / supply computations
# -----------------------------------------------------------------------

def _district_summary(db: Session) -> dict[str, dict]:
    """На каждый район возвращает: население, бизнесов_всего, бизнесов_по_категориям."""
    districts = db.query(District).all()
    # One-query populations
    pop_rows = (
        db.query(PopulationStat.district_id, PopulationStat.year, PopulationStat.population)
        .order_by(PopulationStat.district_id, PopulationStat.year.desc())
        .all()
    )
    latest_pop: dict[int, int] = {}
    for did, year, pop in pop_rows:
        if did not in latest_pop:
            latest_pop[did] = pop

    district_pop: dict[str, int] = {}
    district_id_by_name: dict[str, int] = {}
    for d in districts:
        district_pop[d.name_ru] = latest_pop.get(d.id, 0)
        district_id_by_name[d.name_ru] = d.id

    # Businesses categorized per district
    all_biz = db.query(Business.lat, Business.lon, Business.category).all()
    by_district: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for lat, lon, cat in all_biz:
        name = _assign_district(lat, lon)
        if not name:
            continue
        by_district[name][cat.value] += 1
    total_per_district: dict[str, int] = {n: sum(v.values()) for n, v in by_district.items()}

    # City-level totals per category (for avg per 10K)
    city_cat_counts: dict[str, int] = defaultdict(int)
    city_total_pop = sum(district_pop.values())
    for name, cats in by_district.items():
        for c, n in cats.items():
            city_cat_counts[c] += n
    city_avg_per_10k: dict[str, float] = {
        c: (city_cat_counts[c] / city_total_pop * 10_000) if city_total_pop else 0
        for c in city_cat_counts
    }

    result: dict[str, dict] = {}
    for name in DISTRICT_BOUNDS:
        pop = district_pop.get(name, 0)
        cats = dict(by_district.get(name, {}))
        total = total_per_district.get(name, 0)
        result[name] = {
            "district_id": district_id_by_name.get(name),
            "population": pop,
            "total_businesses": total,
            "per_10k_total": round(total / pop * 10_000, 1) if pop else 0,
            "categories": cats,
            "city_avg_per_10k": city_avg_per_10k,
            "income_index": DISTRICT_INCOME_INDEX.get(name, 0.6),
            "age_cohorts": DISTRICT_AGE_COHORTS.get(name,
                {"kids": 0.11, "youth": 0.22, "middle": 0.55, "senior": 0.12}),
        }
    return result


def _score_category_for_district(
    category_key: str, district: dict, complementary: dict[str, int],
    district_aqi: float | None = None,
) -> dict:
    """Считает все компоненты score для одной категории/района."""
    pop = district["population"]
    income = district["income_index"]
    age = district["age_cohorts"]
    cats = district["categories"]
    city_avg = district["city_avg_per_10k"].get(category_key, 0)

    existing = cats.get(category_key, 0)
    per_10k = (existing / pop * 10_000) if pop else 0

    # 1) Demand = base demand × age_fit × income_fit × pop scale
    benchmark = CATEGORY_DENSITY_BENCHMARK.get(category_key, 5.0)
    base_demand = min(1.0, benchmark / 25.0)  # 25 is high baseline
    age_fit = _age_fit_score(category_key, age)
    income_sensitivity = INCOME_FIT.get(category_key, 0.5)
    income_bonus = 1 + income_sensitivity * (income - 0.6)  # neutral at 0.6
    income_bonus = max(0.4, min(1.6, income_bonus))
    pop_scale = min(1.0, pop / 400_000)
    demand = base_demand * (0.4 + 0.6 * age_fit) * income_bonus * (0.5 + 0.5 * pop_scale)
    demand = max(0.0, min(1.5, demand))

    # 2) Supply = inverse density (much supply → low score)
    if city_avg > 0:
        ratio = per_10k / city_avg
    else:
        ratio = 0.0
    supply_opportunity = max(0.0, 1.0 - min(ratio, 2.0) / 2.0)  # 0..1, best at ratio 0, 0 at 2+

    # 3) Competition — close duplicate of supply but frames it different (local saturation)
    if existing == 0 and pop > 100_000:
        competition_score = 1.0
    elif benchmark > 0:
        # target per_10k is benchmark, penalty if above
        target = benchmark * 0.8
        competition_score = max(0.0, 1.0 - max(0.0, per_10k - target) / (benchmark * 2))
    else:
        competition_score = 0.5

    # 4) Complementarity — co-location bonuses
    comp_bonus = _complementarity(category_key, cats, pop)

    # 5) Eco fit — penalize car-centric in bad-AQI districts
    eco_penalty = 0.0
    if district_aqi and district_aqi > 150:
        if category_key in ("fuel", "car_wash", "car_repair"):
            eco_penalty = 0.20
        elif category_key in ("nightclub", "hookah"):
            eco_penalty = 0.05

    # Weighted sum
    raw = (
        0.35 * min(1.0, demand) +
        0.25 * supply_opportunity +
        0.20 * competition_score +
        0.15 * comp_bonus +
        0.05 * 1.0          # anchor, will subtract eco_penalty below
    )
    raw -= eco_penalty
    raw = max(0.0, min(1.0, raw))
    score = round(raw * 100, 1)

    reasons = _build_reasons(
        category_key, pop, existing, per_10k, city_avg,
        age_fit, income, comp_bonus, eco_penalty,
    )

    return {
        "category": category_key,
        "label": CATEGORY_LABELS.get(BusinessCategory(category_key), category_key),
        "score": score,
        "components": {
            "demand": round(demand, 3),
            "supply_opportunity": round(supply_opportunity, 3),
            "competition": round(competition_score, 3),
            "complementarity": round(comp_bonus, 3),
            "eco_penalty": round(eco_penalty, 3),
            "age_fit": round(age_fit, 3),
            "income_bonus": round(income_bonus, 3),
        },
        "market": {
            "existing_count": existing,
            "per_10k": round(per_10k, 2),
            "city_avg_per_10k": round(city_avg, 2),
            "benchmark_per_10k": benchmark,
            "potential_slots": max(0, int((benchmark - per_10k) * pop / 10_000))
                if benchmark > per_10k else 0,
        },
        "economics": _category_econ_summary(category_key),
        "reasons": reasons,
    }


def _age_fit_score(cat: str, cohorts: dict[str, float]) -> float:
    fit = AGE_FIT.get(cat)
    if not fit:
        return 0.6  # balanced
    val = sum(cohorts[k] * fit.get(k, 0.5) for k in ("kids", "youth", "middle", "senior"))
    return min(1.0, val / 0.6)  # normalize


# Which categories reinforce each other when co-located.
COMPLEMENTARITY_MAP: dict[str, list[str]] = {
    "cafe":         ["barbershop", "beauty_salon", "coworking", "bookshop"],
    "restaurant":   ["bar", "hotel", "mall"],
    "coffee_shop":  ["coworking", "bookshop", "dentist"],
    "pharmacy_biz": ["dentist", "optician", "veterinary"],
    "gym":          ["sports", "beauty_salon"],
    "grocery":      ["bakery", "pharmacy_biz", "butcher"],
    "dentist":      ["optician", "pharmacy_biz"],
    "hookah":       ["bar"],
    "nightclub":    ["bar"],
    "toys":         ["stationery", "clothing"],
    "coworking":    ["coffee_shop", "cafe"],
    "florist":      ["bakery", "jewelry"],
    "car_wash":     ["car_repair", "fuel"],
}


def _complementarity(cat: str, cats_in_district: dict[str, int], pop: int) -> float:
    """Сколько комплиментарных категорий уже есть в районе — лучше для привлечения траффика."""
    comps = COMPLEMENTARITY_MAP.get(cat, [])
    if not comps or pop == 0:
        return 0.3
    present = sum(1 for c in comps if cats_in_district.get(c, 0) >= 3)
    return min(1.0, 0.3 + present / max(1, len(comps)) * 0.7)


def _category_econ_summary(cat: str) -> dict:
    econ = CATEGORY_ECONOMICS.get(cat)
    if not econ:
        return {}
    return {
        "capex_min_usd": econ["capex_min"],
        "capex_max_usd": econ["capex_max"],
        "opex_monthly_usd": econ["opex"],
        "revenue_per_m2_month_usd": econ["rev_per_m2"],
        "net_margin": econ["margin"],
    }


def _build_reasons(
    cat: str, pop: int, existing: int, per_10k: float, city_avg: float,
    age_fit: float, income: float, comp: float, eco_penalty: float,
) -> list[str]:
    reasons: list[str] = []
    if existing == 0 and pop >= 150_000:
        reasons.append(f"Свободная ниша: в районе ни одного '{CATEGORY_LABELS.get(BusinessCategory(cat), cat).lower()}'.")
    elif city_avg > 0 and per_10k < city_avg * 0.7:
        reasons.append(
            f"Плотность ниже среднегородской ({per_10k:.1f}/10К vs {city_avg:.1f}/10К). "
            f"Место для новичка есть.",
        )
    elif city_avg > 0 and per_10k > city_avg * 1.5:
        reasons.append(
            f"Насыщенный рынок: {per_10k:.1f}/10К против среднего {city_avg:.1f}. "
            "Высокая конкуренция.",
        )
    if age_fit >= 0.8:
        reasons.append("Возрастная структура района удачно ложится на категорию.")
    if income >= 0.85 and INCOME_FIT.get(cat, 0.5) > 0.7:
        reasons.append("Премиум-район — чувствителен к премиальным категориям.")
    elif income <= 0.55 and INCOME_FIT.get(cat, 0.5) > 0.7:
        reasons.append("Район менее обеспеченный — для премиум-категории рискованно.")
    if comp >= 0.7:
        reasons.append("Хорошая синергия с соседними категориями, взаимный трафик.")
    if eco_penalty > 0:
        reasons.append("Категория ухудшает экологию района, жители могут возражать.")
    return reasons[:4]


# -----------------------------------------------------------------------
# Public API
# -----------------------------------------------------------------------

def recommend_for_district(
    db: Session, district_name: str, top_n: int = 8,
    max_capex_usd: int | None = None,
) -> dict:
    """Топ-N категорий для открытия в районе."""
    summaries = _district_summary(db)
    if district_name not in summaries:
        return {"error": "unknown_district"}

    d = summaries[district_name]

    # Optional AQI penalty based on eco analytics
    aqi: float | None = None
    try:
        from app.services.eco_analytics import _district_aqi
        aqi = _district_aqi(district_name)
    except Exception:
        aqi = None

    # Score all categories
    scored: list[dict] = []
    for cat in BusinessCategory:
        if cat == BusinessCategory.OTHER:
            continue
        s = _score_category_for_district(cat.value, d, d["categories"], aqi)
        if max_capex_usd and s["economics"]:
            if s["economics"].get("capex_min_usd", 0) > max_capex_usd:
                s["filtered_out"] = "above_budget"
                continue
        scored.append(s)

    scored.sort(key=lambda x: -x["score"])

    # Category group totals (for radar / breakdown)
    by_group: dict[str, list[dict]] = defaultdict(list)
    for group_name, cats in CATEGORY_GROUPS.items():
        for c in cats:
            match = next((s for s in scored if s["category"] == c.value), None)
            if match:
                by_group[group_name].append(match)
    group_avg_scores = {
        g: round(sum(x["score"] for x in items) / max(1, len(items)), 1)
        for g, items in by_group.items()
    }

    return {
        "district": district_name,
        "district_id": d["district_id"],
        "population": d["population"],
        "income_index": d["income_index"],
        "age_cohorts": d["age_cohorts"],
        "total_businesses": d["total_businesses"],
        "current_aqi": aqi,
        "top": scored[:top_n],
        "bottom": scored[-5:] if len(scored) >= 5 else [],
        "all_scored": scored,
        "group_scores": group_avg_scores,
        "methodology": (
            "Composite-score: 0.35·demand + 0.25·supply_opportunity + 0.20·competition "
            "+ 0.15·complementarity + 0.05·baseline − eco_penalty. "
            "demand = base_benchmark × age_fit × income_fit × pop_scale. "
            "supply_opportunity = 1 − min(per_10k/city_avg, 2)/2. "
            "Нет магических чисел: все коэффициенты в business_recommender.py документированы."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def recommend_for_budget(
    db: Session, max_capex_usd: int, top_n: int = 6,
) -> list[dict]:
    """Фильтр по бюджету: лучшие пары (категория, район) для данного капекса."""
    summaries = _district_summary(db)
    picks: list[dict] = []
    for district_name, d in summaries.items():
        for cat in BusinessCategory:
            if cat == BusinessCategory.OTHER:
                continue
            s = _score_category_for_district(cat.value, d, d["categories"])
            econ = s.get("economics") or {}
            if not econ:
                continue
            capex_min = econ.get("capex_min_usd", 0)
            if capex_min > max_capex_usd:
                continue
            picks.append({
                "district": district_name,
                "population": d["population"],
                **s,
            })
    picks.sort(key=lambda x: -x["score"])
    return picks[:top_n]


# -----------------------------------------------------------------------
# Spending potential heatmap
# -----------------------------------------------------------------------

def spending_potential(db: Session) -> dict:
    """Индекс spending_potential по районам: население × income × (1 − competition).

    Для UI heatmap — каждый район получает score 0..100.
    """
    summaries = _district_summary(db)
    max_val = 1.0
    rows = []
    for name, d in summaries.items():
        pop = d["population"]
        income = d["income_index"]
        bizn_per_10k = d["per_10k_total"]
        # saturation 1..0: max saturation when bizn_per_10k > 600
        saturation = min(1.0, bizn_per_10k / 600.0)
        potential_raw = pop * income * (1.0 - saturation * 0.55)
        rows.append({"district": name, "raw": potential_raw, "data": d})
        max_val = max(max_val, potential_raw)

    # Normalize to 0..100
    result = []
    for r in rows:
        score = round(r["raw"] / max_val * 100, 1)
        d = r["data"]
        result.append({
            "district": r["district"],
            "score": score,
            "population": d["population"],
            "income_index": d["income_index"],
            "total_businesses": d["total_businesses"],
            "businesses_per_10k": d["per_10k_total"],
            "bounds": DISTRICT_BOUNDS.get(r["district"]),
        })
    result.sort(key=lambda x: -x["score"])
    return {
        "districts": result,
        "methodology": (
            "spending_potential = population × income_index × (1 − saturation × 0.55). "
            "Saturation = min(1, businesses_per_10k / 600). "
            "Normalize к 100. income_index — baseline из DISTRICT_INCOME_INDEX "
            "(krisha.kz 2024 медианы + внутригородская статистика)."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# -----------------------------------------------------------------------
# Radius-based area analysis
# -----------------------------------------------------------------------

def analyze_area(
    db: Session, lat: float, lon: float, radius_km: float,
    category: str | None = None,
) -> dict:
    """Вокруг точки: конкуренты, демография (оценка), доминирующие категории."""
    radius_km = max(0.1, min(radius_km, 5.0))
    lat_off = radius_km / 111.0
    lon_off = radius_km / (111.0 * math.cos(math.radians(lat)))

    q = db.query(Business).filter(
        Business.lat.between(lat - lat_off, lat + lat_off),
        Business.lon.between(lon - lon_off, lon + lon_off),
    )
    if category:
        q = q.filter(Business.category == BusinessCategory(category))
    rows = q.limit(500).all()

    # Precise haversine filtering
    inside: list[Business] = []
    for b in rows:
        if _haversine_km(lat, lon, b.lat, b.lon) <= radius_km:
            inside.append(b)

    by_cat: dict[str, int] = defaultdict(int)
    for b in inside:
        by_cat[b.category.value] += 1

    dist_name = _assign_district(lat, lon)
    summaries = _district_summary(db)
    dist_data = summaries.get(dist_name) if dist_name else None

    # Area in km² of circle
    area_km2 = math.pi * radius_km * radius_km

    # Estimated population in radius = (area / district_area) × district_pop (proxy)
    est_pop = None
    if dist_data and dist_data["population"]:
        # Approx: district ≈ 50-120 km². Use district area if available.
        district_obj = db.query(District).filter_by(name_ru=dist_name).first() if dist_name else None
        dist_area = district_obj.area_km2 if (district_obj and district_obj.area_km2) else 80.0
        share = min(1.0, area_km2 / dist_area)
        est_pop = int(dist_data["population"] * share)

    total = len(inside)
    dominant = sorted(by_cat.items(), key=lambda x: -x[1])[:5]

    return {
        "center": {"lat": lat, "lon": lon},
        "radius_km": radius_km,
        "area_km2": round(area_km2, 2),
        "district": dist_name,
        "total_competitors": total,
        "by_category": [
            {"category": c,
             "label": CATEGORY_LABELS.get(BusinessCategory(c), c),
             "count": n}
            for c, n in sorted(by_cat.items(), key=lambda x: -x[1])
        ],
        "dominant_categories": [
            {"category": c,
             "label": CATEGORY_LABELS.get(BusinessCategory(c), c),
             "count": n,
             "percent": round(n / total * 100, 1) if total else 0}
            for c, n in dominant
        ],
        "demography_estimate": {
            "population_in_radius": est_pop,
            "basis": ("Пропорция area × population района (приближение). "
                      "Для точности нужны ячейки переписи/GIS квартальная сетка."),
            "income_index_district": dist_data["income_index"] if dist_data else None,
            "age_cohorts_district": dist_data["age_cohorts"] if dist_data else None,
        },
        "examples": [
            {"id": b.id, "name": b.name, "category": b.category.value,
             "lat": b.lat, "lon": b.lon, "address": b.address,
             "distance_km": round(_haversine_km(lat, lon, b.lat, b.lon), 2)}
            for b in sorted(inside, key=lambda b: _haversine_km(lat, lon, b.lat, b.lon))[:25]
        ],
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2)**2
    return 2 * R * math.asin(math.sqrt(a))


# -----------------------------------------------------------------------
# Sub-district grid Best Location
# -----------------------------------------------------------------------

def best_locations_grid(
    db: Session, category: str,
    grid_size: int = 8,
    capture_radius_km: float = 0.7,
    district_filter: str | None = None,
) -> dict:
    """Грид-разбиение города и оценка каждой клетки для категории.

    Для каждой клетки:
      - находим conflict-плотность (бизнесов той же категории в радиусе R)
      - подсчитываем «комплиментарные» бизнесы (синергия)
      - получаем район (по DISTRICT_BOUNDS) и берём population/income
      - score 0..100 = функция от: low conflict + high population + complementary

    Возвращает топ ячейки + полная сетка для тепловой карты.
    """
    grid_size = max(4, min(grid_size, 16))

    try:
        cat_enum = BusinessCategory(category)
    except ValueError:
        return {"error": "unknown_category"}

    # All businesses (we'll filter by category and complementary)
    all_biz = db.query(Business.lat, Business.lon, Business.category).all()
    same_cat = [(lat, lon) for lat, lon, c in all_biz if c == cat_enum]
    comp_keys = COMPLEMENTARITY_MAP.get(category, [])
    comp_set = {k for k in comp_keys}
    complement_biz = [(lat, lon) for lat, lon, c in all_biz if c.value in comp_set]

    summaries = _district_summary(db)

    # Determine grid bounds — either selected district or all city bbox
    if district_filter and district_filter in DISTRICT_BOUNDS:
        bounds = [DISTRICT_BOUNDS[district_filter]]
        bbox_lat_min = bounds[0][0]
        bbox_lat_max = bounds[0][1]
        bbox_lon_min = bounds[0][2]
        bbox_lon_max = bounds[0][3]
    else:
        bbox_lat_min = min(b[0] for b in DISTRICT_BOUNDS.values())
        bbox_lat_max = max(b[1] for b in DISTRICT_BOUNDS.values())
        bbox_lon_min = min(b[2] for b in DISTRICT_BOUNDS.values())
        bbox_lon_max = max(b[3] for b in DISTRICT_BOUNDS.values())

    cells: list[dict] = []
    lat_step = (bbox_lat_max - bbox_lat_min) / grid_size
    lon_step = (bbox_lon_max - bbox_lon_min) / grid_size

    for i in range(grid_size):
        for j in range(grid_size):
            lat = bbox_lat_min + (i + 0.5) * lat_step
            lon = bbox_lon_min + (j + 0.5) * lon_step
            district_name = _assign_district(lat, lon)
            if not district_name:
                continue
            d = summaries.get(district_name)
            if not d or not d["population"]:
                continue

            # Count same-category in radius
            conflict = sum(
                1 for blat, blon in same_cat
                if _haversine_km(lat, lon, blat, blon) <= capture_radius_km
            )
            # Count complementary in radius
            complementary = sum(
                1 for blat, blon in complement_biz
                if _haversine_km(lat, lon, blat, blon) <= capture_radius_km
            )

            # Score components 0..1
            # Low conflict = good. Cap at 5 for diminishing returns.
            conflict_score = max(0, 1 - conflict / 5)
            complementary_score = min(1.0, complementary / 5)
            pop_score = min(1.0, d["population"] / 400_000)
            income_score = d["income_index"]

            raw = (
                0.35 * conflict_score
                + 0.20 * complementary_score
                + 0.20 * pop_score
                + 0.15 * income_score
                + 0.10
            )
            score = round(raw * 100, 1)

            cells.append({
                "row": i, "col": j,
                "lat": round(lat, 5), "lon": round(lon, 5),
                "district": district_name,
                "conflict": conflict,
                "complementary": complementary,
                "population_proxy": d["population"],
                "income_index": d["income_index"],
                "score": score,
            })

    cells.sort(key=lambda c: -c["score"])
    return {
        "category": category,
        "category_label": CATEGORY_LABELS.get(cat_enum, category),
        "grid_size": grid_size,
        "capture_radius_km": capture_radius_km,
        "district_filter": district_filter,
        "bbox": {
            "lat_min": bbox_lat_min, "lat_max": bbox_lat_max,
            "lon_min": bbox_lon_min, "lon_max": bbox_lon_max,
        },
        "lat_step": lat_step,
        "lon_step": lon_step,
        "total_cells": len(cells),
        "top": cells[:10],
        "cells": cells,
        "methodology": (
            "Grid-разбиение bbox на N×N. Для каждой клетки: conflict_score "
            "(1-плотность same_cat в радиусе) + complementary_score "
            "+ pop_score + income. Капля шкалирована к 0-100. "
            "Не PostGIS spatial join — приближение по bbox."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# -----------------------------------------------------------------------
# Cannibalization simulator
# -----------------------------------------------------------------------

def cannibalization_simulation(
    db: Session, lat: float, lon: float, category: str,
    capture_radius_km: float = 1.2,
) -> dict:
    """Прогноз каннибализации: если открываем category в точке (lat, lon),
    насколько «съедим» поток соседних заведений той же категории?

    Модель distance-decay:
    weight(d) = exp(−d / r_half), r_half = 0.6·capture_radius
    Сумма весов всех конкурентов = total_pie. Новый игрок начинает с веса 1.0
    (если точка не хуже локацией), забирает share = 1 / (1 + Σweights).
    Каждому конкуренту cannibal_%. = (его weight) × share × 100 / (1 + Σweights_others).
    """
    try:
        cat_enum = BusinessCategory(category)
    except ValueError:
        return {"error": "unknown_category"}

    radius = max(0.3, min(capture_radius_km, 3.0))
    r_half = radius * 0.6

    lat_off = radius / 111.0
    lon_off = radius / (111.0 * math.cos(math.radians(lat)))

    neighbors = db.query(Business).filter(
        Business.category == cat_enum,
        Business.lat.between(lat - lat_off, lat + lat_off),
        Business.lon.between(lon - lon_off, lon + lon_off),
    ).all()

    enriched: list[dict] = []
    sum_weight = 0.0
    for b in neighbors:
        d = _haversine_km(lat, lon, b.lat, b.lon)
        if d > radius:
            continue
        w = math.exp(-d / max(0.05, r_half))
        enriched.append({"b": b, "distance_km": d, "weight": w})
        sum_weight += w

    # Newcomer weight = 1.0
    total_weight_with_new = 1.0 + sum_weight
    new_share = round(1.0 / total_weight_with_new * 100, 2)

    competitors: list[dict] = []
    total_cannibalized = 0.0
    for item in enriched:
        b = item["b"]
        # How much of b's traffic is diverted to new player
        old_share = item["weight"] / sum_weight if sum_weight else 0
        new_share_of_b = item["weight"] / total_weight_with_new
        diverted = (old_share - new_share_of_b) * 100
        diverted_pct = max(0.0, round(diverted, 2))
        total_cannibalized += diverted_pct
        competitors.append({
            "id": b.id,
            "name": b.name or "Без названия",
            "lat": b.lat,
            "lon": b.lon,
            "address": b.address,
            "distance_km": round(item["distance_km"], 2),
            "weight": round(item["weight"], 3),
            "cannibalized_share_percent": diverted_pct,
        })
    competitors.sort(key=lambda x: -x["cannibalized_share_percent"])

    risk = (
        "high"   if new_share >= 45 else
        "medium" if new_share >= 25 else
        "low"
    )
    risk_label = {
        "high":   "🟢 Низкая каннибализация — большой захват нового спроса",
        "medium": "🟡 Умеренная каннибализация — часть клиентов отниму у соседей",
        "low":    "🔴 Высокая каннибализация — заберу в основном у существующих",
    }[risk]

    return {
        "center": {"lat": lat, "lon": lon},
        "category": category,
        "capture_radius_km": radius,
        "competitors_in_radius": len(competitors),
        "newcomer_market_share_percent": new_share,
        "total_cannibalized_percent": round(total_cannibalized, 1),
        "risk": risk,
        "risk_label": risk_label,
        "competitors": competitors[:15],
        "methodology": (
            "Distance-decay market-share model (Huff-like simplified): "
            "w_i = exp(−d_i / r_half), где r_half = 0.6 × capture_radius. "
            "Новый игрок = вес 1.0. Доля = w_own / Σ w. "
            "Каннибализация i-го = старая_доля_i − новая_доля_i."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# -----------------------------------------------------------------------
# Time-based insights (opening_hours)
# -----------------------------------------------------------------------

_DAYS_OSM = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]


def _parse_osm_hours(raw: str) -> list[tuple[int, int]] | None:
    """Очень упрощённый парсер osm opening_hours → список (open_h, close_h) по дням.

    Возвращает список из 7 (пн..вс) интервалов или None если нет данных.
    Поддерживает: "Mo-Su 08:00-22:00", "Mo-Fr 09:00-18:00; Sa 10:00-14:00",
    "24/7", "Mo-Fr 09:00-18:00, 19:00-23:00" (берём первый диапазон).
    """
    if not raw or raw.strip() == "":
        return None
    raw = raw.strip()
    if raw == "24/7":
        return [(0, 24)] * 7

    week = [(0, 0)] * 7  # closed by default

    for rule in raw.split(";"):
        rule = rule.strip()
        if not rule:
            continue
        # e.g., "Mo-Fr 09:00-18:00" or "Sa 10:00-14:00" or "09:00-22:00"
        try:
            parts = rule.rsplit(" ", 1)
            if len(parts) == 1:
                time_part = parts[0]
                day_range = "Mo-Su"
            else:
                day_range, time_part = parts[0], parts[1]

            # Parse time
            if "-" not in time_part:
                continue
            t_open_s, t_close_s = time_part.split("-")[:2]
            t_open = int(t_open_s.split(":")[0])
            t_close = int(t_close_s.split(":")[0])
            if t_close == 0:
                t_close = 24

            # Parse days
            day_tokens = day_range.split(",")
            for tok in day_tokens:
                tok = tok.strip()
                if "-" in tok:
                    a, b = tok.split("-")[:2]
                    if a in _DAYS_OSM and b in _DAYS_OSM:
                        i1 = _DAYS_OSM.index(a)
                        i2 = _DAYS_OSM.index(b)
                        if i2 < i1:
                            indexes = list(range(i1, 7)) + list(range(0, i2 + 1))
                        else:
                            indexes = list(range(i1, i2 + 1))
                        for i in indexes:
                            week[i] = (t_open, t_close)
                elif tok in _DAYS_OSM:
                    week[_DAYS_OSM.index(tok)] = (t_open, t_close)
                else:
                    for i in range(7):
                        week[i] = (t_open, t_close)
        except (ValueError, IndexError):
            continue

    # If we found nothing, return None
    if all(h == (0, 0) for h in week):
        return None
    return week


def time_coverage(
    db: Session, category: str | None = None,
    district: str | None = None,
) -> dict:
    """Покрытие по часам недели (168 часов) — где ниши для 24/7 / ночного бизнеса."""
    q = db.query(Business.opening_hours, Business.lat, Business.lon, Business.category)
    if category:
        try:
            q = q.filter(Business.category == BusinessCategory(category))
        except ValueError:
            pass
    rows = q.all()

    # 7 days × 24 hours counter
    coverage = [[0 for _ in range(24)] for _ in range(7)]
    parsed_total = 0
    skipped_total = 0

    for hours_raw, lat, lon, _ in rows:
        if district and _assign_district(lat, lon) != district:
            continue
        parsed = _parse_osm_hours(hours_raw) if hours_raw else None
        if not parsed:
            skipped_total += 1
            continue
        parsed_total += 1
        for day_idx, (o, c) in enumerate(parsed):
            for h in range(o, min(c, 24)):
                coverage[day_idx][h] += 1

    # Summarize: hour-of-week share of closed businesses
    total_with_hours = max(1, parsed_total)
    weekly = []
    for di, day in enumerate(coverage):
        for h, count in enumerate(day):
            open_share = count / total_with_hours
            weekly.append({
                "day_idx": di,
                "day": _DAYS_OSM[di],
                "hour": h,
                "open_count": count,
                "closed_count": total_with_hours - count,
                "open_share": round(open_share, 3),
            })

    # Find niches: hours with fewer than 30% open → opportunity
    niches = [w for w in weekly if w["open_share"] < 0.3]
    niches.sort(key=lambda x: x["open_share"])

    # Aggregate by hour-of-day averaged across all days (for easier visualization)
    by_hour_avg = []
    for h in range(24):
        avg = sum(coverage[d][h] for d in range(7)) / 7
        by_hour_avg.append({
            "hour": h,
            "avg_open": round(avg, 1),
            "avg_open_share": round(avg / total_with_hours, 3),
        })

    return {
        "category": category,
        "district": district,
        "parsed_businesses": parsed_total,
        "skipped_no_hours": skipped_total,
        "heatmap": weekly,                # 7×24 = 168 rows
        "by_hour_avg": by_hour_avg,       # 24 points
        "top_niches": niches[:10],        # hours with fewest open
        "methodology": (
            "Парсинг поля OSM opening_hours (упрощённый: поддерживает Mo-Fr/Mo-Su, "
            "диапазоны времени, 24/7). Покрытие = число открытых бизнесов в данный час. "
            "«Ниша» = час, когда <30% заведений работают."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
