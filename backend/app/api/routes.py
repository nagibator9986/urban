"""API routes for Almaty Urban Analytics.

All endpoints are defensive: if DB is empty/unreachable they return
empty-but-valid shapes instead of 500. Frontend already handles empty data.
"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.district import District
from app.models.facility import Facility, FacilityType
from app.models.population import PopulationStat
from app.schemas.schemas import (
    CityOverview, CityStatDetail, DistrictAnalytics, DistrictOut, FacilityOut,
)
from app.services.analytics import get_city_overview, get_district_analytics
from app.services.statistics import get_city_statistics
from app.services.norms import NORMS

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/districts/geojson")
def districts_geojson(db: Session = Depends(get_db)):
    """Polygon-GeoJSON всех районов + метрики для choropleth-слоя.

    Defensive: empty FeatureCollection on any DB-side failure.
    """
    try:
        return _build_districts_geojson(db)
    except Exception as e:
        logger.exception("/districts/geojson failed: %s", e)
        return {"type": "FeatureCollection", "features": []}


def _build_districts_geojson(db: Session) -> dict:
    from app.services.statistics import get_city_statistics
    from app.services.eco_analytics import (
        DISTRICT_BASELINE_AQI, GREEN_INDEX, TRAFFIC_INDEX, _district_aqi,
    )
    from geoalchemy2.shape import to_shape
    from shapely.geometry import mapping

    stats = get_city_statistics(db)
    scores = {d.district_id: d.overall_score for d in stats.districts}
    pops = {d.district_id: d.population for d in stats.districts}
    name_by_id = {d.district_id: d.district_name for d in stats.districts}

    # Business per 10K
    biz_per_10k_by_name: dict[str, float] = {}
    try:
        from app.services.business_analytics import get_business_by_district
        for d in get_business_by_district(db):
            biz_per_10k_by_name[d["district_name"]] = d.get("businesses_per_10k", 0)
    except Exception:
        pass

    # 15-min city
    fifteen_by_id: dict[int, float] = {}
    try:
        from app.services.public_advanced import fifteen_min_city
        for x in fifteen_min_city(db)["districts"]:
            fifteen_by_id[x["district_id"]] = x.get("score_15min", 0)
    except Exception:
        pass

    features: list[dict] = []
    districts = db.query(District).order_by(District.id).all()
    for d in districts:
        geom = None
        if d.geometry is not None:
            try:
                geom = mapping(to_shape(d.geometry))
            except Exception:
                geom = None
        if not geom:
            # Fallback rectangle around approximate bounds (for MVP w/o OSM geometry)
            from app.services.business_analytics import DISTRICT_BOUNDS
            b = DISTRICT_BOUNDS.get(d.name_ru)
            if b:
                lat_min, lat_max, lon_min, lon_max = b
                geom = {
                    "type": "Polygon",
                    "coordinates": [[
                        [lon_min, lat_min], [lon_max, lat_min],
                        [lon_max, lat_max], [lon_min, lat_max],
                        [lon_min, lat_min],
                    ]],
                }
        if not geom:
            continue
        score = scores.get(d.id, 0)
        # Eco metrics (lookup by name_ru — those tables are name-keyed)
        aqi = None
        try:
            if d.name_ru in DISTRICT_BASELINE_AQI:
                aqi = _district_aqi(d.name_ru)
        except Exception:
            aqi = None
        green = GREEN_INDEX.get(d.name_ru)
        traffic = TRAFFIC_INDEX.get(d.name_ru)
        # Compute eco_score similarly to eco_analytics
        eco_score = None
        if aqi is not None and green is not None and traffic is not None:
            eco_score = round(max(0.0, min(100.0,
                (300 - min(aqi, 300)) / 3 * 0.45
                + (green / 16 * 100) * 0.30
                + (max(0, 100 - traffic / 5)) * 0.25,
            )), 1)

        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "district_id": d.id,
                "name_ru": d.name_ru,
                "name_kz": d.name_kz,
                "overall_score": score,
                "population": pops.get(d.id, 0),
                "area_km2": d.area_km2,
                # Multi-metric extension:
                "aqi": aqi,
                "green_m2_per_capita": green,
                "traffic_per_1000": traffic,
                "eco_score": eco_score,
                "businesses_per_10k": biz_per_10k_by_name.get(d.name_ru, 0),
                "fifteen_min_score": fifteen_by_id.get(d.id, 0),
            },
        })

    _ = name_by_id  # quiet linter
    return {"type": "FeatureCollection", "features": features}


@router.get("/districts", response_model=list[DistrictOut])
def list_districts(db: Session = Depends(get_db)):
    """Get all Almaty districts with population (latest year)."""
    try:
        districts = db.query(District).order_by(District.id).all()
    except Exception as e:
        logger.exception("/districts query failed: %s", e)
        return []
    if not districts:
        return []

    # Latest PopulationStat per district in one query
    ids = [d.id for d in districts]
    subq = (
        db.query(
            PopulationStat.district_id,
            func.max(PopulationStat.year).label("max_year"),
        )
        .filter(PopulationStat.district_id.in_(ids))
        .group_by(PopulationStat.district_id)
        .subquery()
    )
    pop_rows = (
        db.query(PopulationStat)
        .join(
            subq,
            (PopulationStat.district_id == subq.c.district_id)
            & (PopulationStat.year == subq.c.max_year),
        )
        .all()
    )
    pop_map = {r.district_id: r for r in pop_rows}

    result = []
    for d in districts:
        pop = pop_map.get(d.id)
        result.append(DistrictOut(
            id=d.id,
            name_ru=d.name_ru,
            name_kz=d.name_kz,
            population=pop.population if pop else None,
            area_km2=d.area_km2,
            density_per_km2=pop.density_per_km2 if pop else None,
        ))
    return result


@router.get("/facilities", response_model=list[FacilityOut])
def list_facilities(
    facility_type: FacilityType | None = None,
    district_id: int | None = None,
    limit: int = Query(default=1000, le=5000),
    db: Session = Depends(get_db),
):
    """Get facilities with optional filters."""
    try:
        query = db.query(Facility)
        if facility_type:
            query = query.filter(Facility.facility_type == facility_type)
        if district_id:
            query = query.filter(Facility.district_id == district_id)
        return query.limit(limit).all()
    except Exception as e:
        logger.exception("/facilities query failed: %s", e)
        return []


@router.get("/facilities/geojson")
def facilities_geojson(
    facility_type: FacilityType | None = None,
    district_id: int | None = None,
    limit: int = Query(default=5000, ge=1, le=20000),
    db: Session = Depends(get_db),
):
    """Get facilities as GeoJSON FeatureCollection."""
    try:
        query = db.query(Facility)
        if facility_type:
            query = query.filter(Facility.facility_type == facility_type)
        if district_id:
            query = query.filter(Facility.district_id == district_id)
        facilities = query.limit(limit).all()
    except Exception as e:
        logger.exception("/facilities/geojson query failed: %s", e)
        return {"type": "FeatureCollection", "features": []}

    features = []
    for f in facilities:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [f.lon, f.lat],
            },
            "properties": {
                "id": f.id,
                "name": f.name,
                "type": f.facility_type.value,
                "source": f.source,
                "address": f.address,
                "district_id": f.district_id,
            },
        })

    return {"type": "FeatureCollection", "features": features}


@router.get("/analytics/districts", response_model=list[DistrictAnalytics])
def district_analytics(db: Session = Depends(get_db)):
    """Per-district infrastructure analytics."""
    try:
        return get_district_analytics(db)
    except Exception as e:
        logger.exception("/analytics/districts failed: %s", e)
        return []


@router.get("/analytics/overview", response_model=CityOverview)
def city_overview(db: Session = Depends(get_db)):
    """Full city overview with coverage gaps."""
    try:
        return get_city_overview(db)
    except Exception as e:
        logger.exception("/analytics/overview failed: %s", e)
        return CityOverview(total_population=0, districts=[], coverage_gaps=[])


@router.get("/analytics/facility-types")
def facility_type_counts(db: Session = Depends(get_db)):
    """Count of facilities by type (single aggregate query)."""
    counts = {ft.value: 0 for ft in FacilityType}
    try:
        rows = (
            db.query(Facility.facility_type, func.count(Facility.id))
            .group_by(Facility.facility_type)
            .all()
        )
        for ftype, cnt in rows:
            counts[ftype.value] = cnt
    except Exception as e:
        logger.exception("/analytics/facility-types failed: %s", e)
    return counts


@router.get("/statistics", response_model=CityStatDetail)
def city_statistics(db: Session = Depends(get_db)):
    """Detailed city statistics with norms comparison."""
    try:
        return get_city_statistics(db)
    except Exception as e:
        logger.exception("/statistics failed: %s", e)
        return CityStatDetail(
            total_population=0, total_facilities=0, overall_score=0,
            facilities=[], districts=[],
        )


@router.get("/statistics/norms")
def facility_norms():
    """Get all facility norms/standards."""
    return {k: {
        "facility_type": v.facility_type,
        "label_ru": v.label_ru,
        "per_10k_norm": v.per_10k_norm,
        "avg_capacity": v.avg_capacity,
        "capacity_unit": v.capacity_unit,
        "capacity_desc": v.capacity_desc,
        "source": v.source,
    } for k, v in NORMS.items()}
