"""Analytics service: compute per-district stats and coverage gaps.

Since we don't have PostGIS spatial assignment of facilities to districts,
we distribute facility counts proportionally by population share.
This gives a reasonable estimate for the MVP.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.facility import Facility, FacilityType
from app.models.population import PopulationStat
from app.schemas.schemas import CityOverview, CoverageGap, DistrictAnalytics

ANALYZED_TYPES = [
    FacilityType.SCHOOL,
    FacilityType.HOSPITAL,
    FacilityType.CLINIC,
    FacilityType.KINDERGARTEN,
    FacilityType.PHARMACY,
]

# Map facility type to schema field names (handles irregular plurals)
FIELD_NAMES = {
    FacilityType.SCHOOL: ("schools", "schools_per_10k"),
    FacilityType.HOSPITAL: ("hospitals", "hospitals_per_10k"),
    FacilityType.CLINIC: ("clinics", "clinics_per_10k"),
    FacilityType.KINDERGARTEN: ("kindergartens", "kindergartens_per_10k"),
    FacilityType.PHARMACY: ("pharmacies", "pharmacies_per_10k"),
}


def _per_10k(count: int, population: int) -> float:
    if population == 0:
        return 0.0
    return round(count / population * 10000, 2)


def _load_latest_populations(db: Session, district_ids: list[int]) -> dict[int, int]:
    """Fetch the latest PopulationStat per district in a single query."""
    if not district_ids:
        return {}
    subq = (
        db.query(
            PopulationStat.district_id,
            func.max(PopulationStat.year).label("max_year"),
        )
        .filter(PopulationStat.district_id.in_(district_ids))
        .group_by(PopulationStat.district_id)
        .subquery()
    )
    rows = (
        db.query(PopulationStat)
        .join(
            subq,
            (PopulationStat.district_id == subq.c.district_id)
            & (PopulationStat.year == subq.c.max_year),
        )
        .all()
    )
    return {r.district_id: r.population for r in rows}


def _load_facility_counts(
    db: Session,
) -> tuple[dict[FacilityType, int], dict[FacilityType, dict[int, int]]]:
    """City-wide and per-district facility counts in 2 aggregate queries."""
    city_rows = (
        db.query(Facility.facility_type, func.count(Facility.id))
        .group_by(Facility.facility_type)
        .all()
    )
    city_counts: dict[FacilityType, int] = {ft: 0 for ft in FacilityType}
    for ftype, cnt in city_rows:
        city_counts[ftype] = cnt

    assigned_rows = (
        db.query(Facility.facility_type, Facility.district_id, func.count(Facility.id))
        .filter(Facility.district_id.isnot(None))
        .group_by(Facility.facility_type, Facility.district_id)
        .all()
    )
    assigned_counts: dict[FacilityType, dict[int, int]] = {ft: {} for ft in FacilityType}
    for ftype, did, cnt in assigned_rows:
        assigned_counts[ftype][did] = cnt

    return city_counts, assigned_counts


def get_district_analytics(db: Session) -> list[DistrictAnalytics]:
    """Compute analytics for each district.

    Uses actual district_id assignment where available, falls back to
    proportional distribution by population share.
    """
    districts = db.query(District).all()
    if not districts:
        return []

    city_counts, assigned_counts = _load_facility_counts(db)
    district_pops = _load_latest_populations(db, [d.id for d in districts])

    total_pop = sum(district_pops.get(d.id, 0) for d in districts)

    results: list[DistrictAnalytics] = []
    for d in districts:
        population = district_pops.get(d.id, 0)
        pop_share = population / total_pop if total_pop > 0 else 0

        counts: dict[FacilityType, int] = {}
        for ftype in FacilityType:
            assigned = assigned_counts[ftype].get(d.id, 0)
            if assigned > 0:
                counts[ftype] = assigned
            else:
                counts[ftype] = round(city_counts[ftype] * pop_share)

        results.append(DistrictAnalytics(
            district_id=d.id,
            district_name=d.name_ru,
            population=population,
            schools=counts[FacilityType.SCHOOL],
            hospitals=counts[FacilityType.HOSPITAL],
            clinics=counts[FacilityType.CLINIC],
            kindergartens=counts[FacilityType.KINDERGARTEN],
            pharmacies=counts[FacilityType.PHARMACY],
            parks=counts[FacilityType.PARK],
            police=counts[FacilityType.POLICE],
            fire_stations=counts[FacilityType.FIRE_STATION],
            bus_stops=counts[FacilityType.BUS_STOP],
            schools_per_10k=_per_10k(counts[FacilityType.SCHOOL], population),
            hospitals_per_10k=_per_10k(counts[FacilityType.HOSPITAL], population),
            clinics_per_10k=_per_10k(counts[FacilityType.CLINIC], population),
            kindergartens_per_10k=_per_10k(counts[FacilityType.KINDERGARTEN], population),
            pharmacies_per_10k=_per_10k(counts[FacilityType.PHARMACY], population),
        ))

    return results


def get_coverage_gaps(db: Session) -> list[CoverageGap]:
    """Find districts where facility coverage is below city average."""
    analytics = get_district_analytics(db)
    return _coverage_gaps_from_analytics(analytics)


def _coverage_gaps_from_analytics(
    analytics: list[DistrictAnalytics],
) -> list[CoverageGap]:
    if not analytics:
        return []

    gaps: list[CoverageGap] = []

    for ftype in ANALYZED_TYPES:
        count_field, per10k_field = FIELD_NAMES[ftype]
        values = [getattr(a, per10k_field) for a in analytics if a.population > 0]
        if not values:
            continue
        city_avg = sum(values) / len(values)
        if city_avg == 0:
            continue

        for a in analytics:
            if a.population == 0:
                continue
            val = getattr(a, per10k_field)
            if val < city_avg:
                deficit = round((1 - val / city_avg) * 100, 1)
                status = "critical" if deficit > 40 else "below_average"
                gaps.append(CoverageGap(
                    district_name=a.district_name,
                    facility_type=ftype.value,
                    current_count=getattr(a, count_field),
                    per_10k=val,
                    city_avg_per_10k=round(city_avg, 2),
                    deficit_percent=deficit,
                    status=status,
                ))

    gaps.sort(key=lambda g: g.deficit_percent, reverse=True)
    return gaps


def get_city_overview(db: Session) -> CityOverview:
    """Full city overview with analytics and gaps — computed once."""
    analytics = get_district_analytics(db)
    gaps = _coverage_gaps_from_analytics(analytics)
    total_pop = sum(a.population for a in analytics)

    return CityOverview(
        total_population=total_pop,
        districts=analytics,
        coverage_gaps=gaps,
    )
