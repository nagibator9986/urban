"""'What-if' simulator: добавление/удаление соц.объектов в районе
с автоматическим пересчётом нормативов и оценки района.

Идея: пользователь в общественном режиме перетаскивает иконку школы/садика/парка
в район на карте — и получает обновлённую оценку района в реальном времени.
"""

from __future__ import annotations

from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.facility import Facility, FacilityType
from app.models.population import PopulationStat
from app.services.statistics import (
    STAT_TYPES,
    _compute_facility_stat,
    _load_latest_populations,
    _overall_score,
)


FacilityTypeStr = Literal[
    "school", "hospital", "clinic", "kindergarten",
    "pharmacy", "park", "fire_station", "bus_stop",
]

# Sanity limits so malformed input can't blow up the model
MAX_ADDITIONS_PER_TYPE = 500
MAX_REMOVALS_PER_TYPE = 10_000
VALID_TYPES: set[str] = {ft.value for ft in STAT_TYPES}


def _district_counts(
    db: Session,
    district_id: int,
    pop_share: float,
) -> dict[str, int]:
    """Текущее количество объектов каждого типа в районе (смешанно:
    фактический district_id если есть, иначе пропорционально населению).
    Делает один aggregate-запрос на город + один на район."""
    city_rows = (
        db.query(Facility.facility_type, func.count(Facility.id))
        .filter(Facility.facility_type.in_(STAT_TYPES))
        .group_by(Facility.facility_type)
        .all()
    )
    city_counts = {ft.value: 0 for ft in STAT_TYPES}
    for ftype, cnt in city_rows:
        city_counts[ftype.value] = cnt

    assigned_rows = (
        db.query(Facility.facility_type, func.count(Facility.id))
        .filter(
            Facility.facility_type.in_(STAT_TYPES),
            Facility.district_id == district_id,
        )
        .group_by(Facility.facility_type)
        .all()
    )
    assigned = {ftype.value: cnt for ftype, cnt in assigned_rows}

    counts: dict[str, int] = {}
    for ft in STAT_TYPES:
        v = assigned.get(ft.value, 0)
        counts[ft.value] = v if v > 0 else round(city_counts[ft.value] * pop_share)
    return counts


def simulate_district(
    db: Session,
    district_id: int,
    additions: dict[str, int],
    removals: dict[str, int] | None = None,
) -> dict:
    """Смоделировать район с добавленными/удалёнными объектами.
    Возвращает: оценка до/после, дельты по каждому типу, новые % покрытия."""
    removals = removals or {}
    d = db.query(District).filter_by(id=district_id).first()
    if not d:
        return {"error": "district_not_found"}

    # Latest population for *all* districts in one query (for pop_share)
    all_districts = db.query(District).all()
    district_pops = _load_latest_populations(db, [x.id for x in all_districts])
    total_pop = sum(district_pops.values())
    population = district_pops.get(district_id, 0)
    pop_share = (population / total_pop) if total_pop else 0

    before_counts = _district_counts(db, district_id, pop_share)

    def _sanitize(src: dict[str, int], cap: int) -> dict[str, int]:
        clean: dict[str, int] = {}
        for k, v in (src or {}).items():
            if k not in VALID_TYPES:
                continue
            try:
                iv = int(v)
            except (TypeError, ValueError):
                continue
            if iv <= 0:
                continue
            clean[k] = min(iv, cap)
        return clean

    adds_clean = _sanitize(additions, MAX_ADDITIONS_PER_TYPE)
    rems_clean = _sanitize(removals, MAX_REMOVALS_PER_TYPE)

    after_counts = dict(before_counts)
    for k, v in adds_clean.items():
        after_counts[k] = after_counts.get(k, 0) + v
    for k, v in rems_clean.items():
        after_counts[k] = max(0, after_counts.get(k, 0) - v)

    before_stats = [
        _compute_facility_stat(ft, before_counts.get(ft.value, 0), population)
        for ft in STAT_TYPES
    ]
    after_stats = [
        _compute_facility_stat(ft, after_counts.get(ft.value, 0), population)
        for ft in STAT_TYPES
    ]

    before_score = _overall_score(before_stats)
    after_score = _overall_score(after_stats)

    def _serialize(stats):
        return [s.model_dump() if hasattr(s, "model_dump") else s.__dict__ for s in stats]

    deltas = {}
    for ft in STAT_TYPES:
        b = before_counts.get(ft.value, 0)
        a = after_counts.get(ft.value, 0)
        if a != b:
            deltas[ft.value] = {"before": b, "after": a, "delta": a - b}

    recommendations = []
    for s in after_stats:
        if s.coverage_percent < 100 and s.norm_per_10k > 0 and s.deficit > 0:
            recommendations.append({
                "facility_type": s.facility_type,
                "label": s.label_ru,
                "still_needed": s.deficit,
                "current_coverage_percent": s.coverage_percent,
            })
    recommendations.sort(key=lambda x: x["current_coverage_percent"])

    return {
        "district_id": district_id,
        "district_name": d.name_ru,
        "population": population,
        "before": {
            "score": before_score,
            "facilities": _serialize(before_stats),
        },
        "after": {
            "score": after_score,
            "facilities": _serialize(after_stats),
        },
        "delta_score": round(after_score - before_score, 1),
        "deltas_by_type": deltas,
        "recommendations": recommendations[:5],
        "applied": {"additions": adds_clean, "removals": rems_clean},
    }
