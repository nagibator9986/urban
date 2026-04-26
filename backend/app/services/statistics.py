"""Detailed city/district statistics with norm comparisons."""

import math

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.facility import Facility, FacilityType
from app.models.population import PopulationStat
from app.schemas.schemas import (
    CityStatDetail,
    DistrictStatDetail,
    FacilityStatDetail,
)
from app.services.norms import NORMS

# Types we analyze (skip police — 0 data)
STAT_TYPES = [
    FacilityType.SCHOOL,
    FacilityType.HOSPITAL,
    FacilityType.CLINIC,
    FacilityType.KINDERGARTEN,
    FacilityType.PHARMACY,
    FacilityType.PARK,
    FacilityType.FIRE_STATION,
    FacilityType.BUS_STOP,
]


def _compute_facility_stat(
    ftype: FacilityType, actual_count: int, population: int
) -> FacilityStatDetail:
    norm = NORMS.get(ftype.value)
    if not norm:
        return FacilityStatDetail(
            facility_type=ftype.value,
            label_ru=ftype.value,
            actual_count=actual_count,
            norm_count=0,
            deficit=0,
            surplus=0,
            coverage_percent=0,
            actual_per_10k=0,
            norm_per_10k=0,
            total_capacity=0,
            needed_capacity=0,
            capacity_unit="",
            source="",
        )

    norm_count = norm.per_10k_norm * population / 10_000
    deficit = max(0, math.ceil(norm_count) - actual_count)
    surplus = max(0, actual_count - math.ceil(norm_count))
    coverage = (actual_count / norm_count * 100) if norm_count > 0 else 0

    actual_per_10k = (actual_count / population * 10_000) if population > 0 else 0
    total_capacity = actual_count * norm.avg_capacity
    needed_capacity = math.ceil(norm_count) * norm.avg_capacity

    return FacilityStatDetail(
        facility_type=ftype.value,
        label_ru=norm.label_ru,
        actual_count=actual_count,
        norm_count=round(norm_count, 1),
        deficit=deficit,
        surplus=surplus,
        coverage_percent=round(min(coverage, 200), 1),
        actual_per_10k=round(actual_per_10k, 2),
        norm_per_10k=norm.per_10k_norm,
        total_capacity=total_capacity,
        needed_capacity=needed_capacity,
        capacity_unit=norm.capacity_unit,
        source=norm.source,
    )


def _overall_score(stats: list[FacilityStatDetail]) -> float:
    """0-100 score based on how well norms are met."""
    if not stats:
        return 0
    scores = []
    for s in stats:
        if s.norm_per_10k > 0:
            scores.append(min(s.coverage_percent, 100))
    return round(sum(scores) / len(scores), 1) if scores else 0


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


def get_city_statistics(db: Session) -> CityStatDetail:
    """Full city statistics with norm comparisons."""
    districts = db.query(District).all()
    district_ids = [d.id for d in districts]
    district_pops = _load_latest_populations(db, district_ids)

    # City-wide counts (single aggregate query)
    city_count_rows = (
        db.query(Facility.facility_type, func.count(Facility.id))
        .filter(Facility.facility_type.in_(STAT_TYPES))
        .group_by(Facility.facility_type)
        .all()
    )
    city_counts: dict[FacilityType, int] = {ft: 0 for ft in STAT_TYPES}
    for ftype, cnt in city_count_rows:
        city_counts[ftype] = cnt

    # Per-district assignment counts (single aggregate query)
    assigned_rows = (
        db.query(
            Facility.facility_type,
            Facility.district_id,
            func.count(Facility.id),
        )
        .filter(
            Facility.facility_type.in_(STAT_TYPES),
            Facility.district_id.isnot(None),
        )
        .group_by(Facility.facility_type, Facility.district_id)
        .all()
    )
    assigned_counts: dict[FacilityType, dict[int, int]] = {
        ft: {} for ft in STAT_TYPES
    }
    for ftype, did, cnt in assigned_rows:
        assigned_counts[ftype][did] = cnt

    total_pop = sum(district_pops.get(d.id, 0) for d in districts)
    districts_data: list[DistrictStatDetail] = []

    for d in districts:
        population = district_pops.get(d.id, 0)
        pop_share = (population / total_pop) if total_pop > 0 else 0

        fstats = []
        for ftype in STAT_TYPES:
            assigned = assigned_counts[ftype].get(d.id, 0)
            count = assigned if assigned > 0 else round(city_counts[ftype] * pop_share)
            fstats.append(_compute_facility_stat(ftype, count, population))

        districts_data.append(DistrictStatDetail(
            district_id=d.id,
            district_name=d.name_ru,
            population=population,
            facilities=fstats,
            overall_score=_overall_score(fstats),
        ))

    # City-wide stats
    city_fstats = []
    total_facilities = 0
    for ftype in STAT_TYPES:
        total_facilities += city_counts[ftype]
        city_fstats.append(
            _compute_facility_stat(ftype, city_counts[ftype], total_pop)
        )

    return CityStatDetail(
        total_population=total_pop,
        total_facilities=total_facilities,
        overall_score=_overall_score(city_fstats),
        facilities=city_fstats,
        districts=districts_data,
    )
