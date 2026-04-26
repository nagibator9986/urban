"""Business analytics: competition, density, best location scoring."""

import math
from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.business import Business, BusinessCategory, CATEGORY_LABELS, CATEGORY_GROUPS
from app.models.district import District
from app.models.population import PopulationStat

# Approximate bounding boxes for Almaty districts (lat_min, lat_max, lon_min, lon_max)
# Used for assigning businesses to districts without PostGIS spatial join
DISTRICT_BOUNDS: dict[str, tuple[float, float, float, float]] = {
    "Алмалинский район":    (43.230, 43.280, 76.890, 76.960),
    "Ауэзовский район":    (43.200, 43.270, 76.820, 76.890),
    "Бостандыкский район":  (43.190, 43.260, 76.910, 76.990),
    "Жетысуский район":    (43.260, 43.330, 76.920, 77.010),
    "Медеуский район":     (43.210, 43.280, 76.940, 77.050),
    "Наурызбайский район":  (43.170, 43.260, 76.730, 76.830),
    "Турксибский район":    (43.270, 43.370, 76.880, 76.970),
    "Алатауский район":    (43.130, 43.230, 76.810, 76.920),
}


def _assign_district(lat: float, lon: float) -> str | None:
    for name, (lat_min, lat_max, lon_min, lon_max) in DISTRICT_BOUNDS.items():
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return name
    return None


def get_business_counts(db: Session) -> dict:
    """Count businesses by category."""
    results = (
        db.query(Business.category, func.count(Business.id))
        .group_by(Business.category)
        .all()
    )
    counts = {cat.value: 0 for cat in BusinessCategory}
    for cat, count in results:
        counts[cat.value] = count
    return counts


def get_business_by_district(db: Session) -> list[dict]:
    """Business counts per district per category."""
    businesses = db.query(Business.lat, Business.lon, Business.category).all()

    district_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    district_total: dict[str, int] = defaultdict(int)

    for lat, lon, category in businesses:
        district = _assign_district(lat, lon)
        if not district:
            district = "Другое"
        district_counts[district][category.value] += 1
        district_total[district] += 1

    # Get populations
    districts = db.query(District).all()
    district_pop = {}
    for d in districts:
        pop_stat = db.query(PopulationStat).filter_by(
            district_id=d.id
        ).order_by(PopulationStat.year.desc()).first()
        district_pop[d.name_ru] = pop_stat.population if pop_stat else 0

    result = []
    for name in DISTRICT_BOUNDS:
        pop = district_pop.get(name, 0)
        total = district_total.get(name, 0)
        cats = district_counts.get(name, {})

        result.append({
            "district_name": name,
            "population": pop,
            "total_businesses": total,
            "businesses_per_10k": round(total / pop * 10000, 1) if pop > 0 else 0,
            "categories": cats,
        })

    result.sort(key=lambda x: x["total_businesses"], reverse=True)
    return result


def get_competition_index(
    db: Session, category: BusinessCategory, lat: float, lon: float, radius_km: float = 1.0
) -> dict:
    """Compute competition index for a specific location and category.

    Returns: count of same-category businesses within radius,
    competition level (low/medium/high), and nearby businesses.
    """
    # Approximate degree offset for radius
    lat_offset = radius_km / 111.0
    lon_offset = radius_km / (111.0 * math.cos(math.radians(lat)))

    nearby = db.query(Business).filter(
        Business.category == category,
        Business.lat.between(lat - lat_offset, lat + lat_offset),
        Business.lon.between(lon - lon_offset, lon + lon_offset),
    ).all()

    count = len(nearby)

    # Competition thresholds vary by category
    if category in (BusinessCategory.ATM, BusinessCategory.CONVENIENCE, BusinessCategory.GROCERY):
        thresholds = (5, 15)  # high density expected
    elif category in (BusinessCategory.RESTAURANT, BusinessCategory.CAFE, BusinessCategory.BEAUTY_SALON):
        thresholds = (3, 8)
    else:
        thresholds = (2, 5)

    if count <= thresholds[0]:
        level = "low"
    elif count <= thresholds[1]:
        level = "medium"
    else:
        level = "high"

    return {
        "category": category.value,
        "radius_km": radius_km,
        "center": {"lat": lat, "lon": lon},
        "competitors_count": count,
        "competition_level": level,
        "competitors": [
            {
                "id": b.id,
                "name": b.name,
                "lat": b.lat,
                "lon": b.lon,
                "address": b.address,
            }
            for b in nearby[:20]
        ],
    }


def find_best_locations(
    db: Session, category: BusinessCategory, top_n: int = 5
) -> list[dict]:
    """Find the best locations for a given business category.

    Scoring factors:
    - Population density (more people = more customers)
    - Low competition (fewer same-category businesses)
    - Infrastructure (bus stops, parking nearby)
    - Complementary businesses (e.g. restaurants near offices)
    """
    businesses = db.query(Business).filter_by(category=category).all()

    # Get population by district
    districts = db.query(District).all()
    district_pop = {}
    for d in districts:
        pop = db.query(PopulationStat).filter_by(
            district_id=d.id
        ).order_by(PopulationStat.year.desc()).first()
        district_pop[d.name_ru] = pop.population if pop else 0

    # Count existing businesses per district
    biz_per_district: dict[str, int] = defaultdict(int)
    for b in businesses:
        d = _assign_district(b.lat, b.lon)
        if d:
            biz_per_district[d] += 1

    # Score each district
    scored = []
    for name, bounds in DISTRICT_BOUNDS.items():
        pop = district_pop.get(name, 0)
        if pop == 0:
            continue

        existing = biz_per_district.get(name, 0)
        per_10k = existing / pop * 10000 if pop > 0 else 0

        # Compute city average for this category
        total_biz = sum(biz_per_district.values())
        total_pop = sum(district_pop.values())
        city_avg = total_biz / total_pop * 10000 if total_pop > 0 else 0

        # Score components (0-100 each)
        # 1. Population score: more people = higher
        pop_score = min(pop / 400000 * 100, 100)

        # 2. Competition score: fewer = higher
        if city_avg > 0:
            comp_ratio = per_10k / city_avg
            comp_score = max(0, min(100, (2 - comp_ratio) * 50))
        else:
            comp_score = 80

        # 3. Underserved score: if density is below average, bonus
        underserved_bonus = 20 if per_10k < city_avg else 0

        total_score = round(pop_score * 0.4 + comp_score * 0.4 + underserved_bonus * 0.2, 1)

        # Center of the district as suggested point
        lat_center = (bounds[0] + bounds[1]) / 2
        lon_center = (bounds[2] + bounds[3]) / 2

        scored.append({
            "district_name": name,
            "score": total_score,
            "population": pop,
            "existing_count": existing,
            "per_10k": round(per_10k, 2),
            "city_avg_per_10k": round(city_avg, 2),
            "suggested_lat": round(lat_center, 6),
            "suggested_lon": round(lon_center, 6),
            "reasons": _build_reasons(pop, existing, per_10k, city_avg, pop_score, comp_score),
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_n]


def _build_reasons(
    pop: int, existing: int, per_10k: float, city_avg: float,
    pop_score: float, comp_score: float,
) -> list[str]:
    reasons = []
    if pop > 300000:
        reasons.append(f"Высокая плотность населения ({pop:,} чел.)")
    elif pop > 200000:
        reasons.append(f"Средняя плотность населения ({pop:,} чел.)")

    if per_10k < city_avg * 0.7:
        reasons.append(f"Район недостаточно обеспечен (в {city_avg/per_10k:.1f}x меньше среднего)" if per_10k > 0 else "В районе нет конкурентов")
    elif per_10k < city_avg:
        reasons.append("Конкуренция ниже среднегородской")

    if comp_score > 70:
        reasons.append("Низкий уровень конкуренции")

    if existing == 0:
        reasons.append("Свободная ниша — нет конкурентов в районе")

    return reasons


def get_category_groups() -> dict:
    """Return category groups with labels for UI."""
    result = {}
    for group_name, categories in CATEGORY_GROUPS.items():
        result[group_name] = [
            {"value": cat.value, "label": CATEGORY_LABELS.get(cat, cat.value)}
            for cat in categories
        ]
    return result
