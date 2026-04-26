"""API routes for Business Mode."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.business import Business, BusinessCategory, CATEGORY_LABELS
from app.services.business_analytics import (
    find_best_locations,
    get_business_by_district,
    get_business_counts,
    get_category_groups,
    get_competition_index,
)
from app.services.business_recommender import (
    analyze_area, best_locations_grid, cannibalization_simulation,
    recommend_for_budget, recommend_for_district, spending_potential,
    time_coverage,
)

router = APIRouter(prefix="/business")


@router.get("/categories")
def list_categories():
    """All business categories with groups."""
    return {
        "groups": get_category_groups(),
        "all": [
            {"value": cat.value, "label": CATEGORY_LABELS.get(cat, cat.value)}
            for cat in BusinessCategory
            if cat != BusinessCategory.OTHER
        ],
    }


@router.get("/counts")
def business_counts(db: Session = Depends(get_db)):
    """Count of businesses by category."""
    return get_business_counts(db)


@router.get("/by-district")
def business_by_district(db: Session = Depends(get_db)):
    """Business stats per district."""
    return get_business_by_district(db)


@router.get("/geojson")
def business_geojson(
    category: BusinessCategory | None = None,
    db: Session = Depends(get_db),
):
    """GeoJSON of businesses with optional category filter."""
    query = db.query(Business)
    if category:
        query = query.filter(Business.category == category)

    businesses = query.all()
    features = []
    for b in businesses:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [b.lon, b.lat]},
            "properties": {
                "id": b.id,
                "name": b.name,
                "category": b.category.value,
                "address": b.address,
                "phone": b.phone,
                "cuisine": b.cuisine,
                "opening_hours": b.opening_hours,
            },
        })
    return {"type": "FeatureCollection", "features": features}


@router.get("/competition")
def competition_analysis(
    category: BusinessCategory,
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(default=1.0, le=5.0),
    db: Session = Depends(get_db),
):
    """Competition index for a given point and category."""
    return get_competition_index(db, category, lat, lon, radius_km)


@router.get("/best-locations")
def best_locations(
    category: BusinessCategory,
    top_n: int = Query(default=5, le=8),
    db: Session = Depends(get_db),
):
    """Find best districts for opening a business of given category."""
    return find_best_locations(db, category, top_n)


@router.get("/best-locations/grid")
def best_locations_grid_endpoint(
    category: str,
    grid_size: int = Query(8, ge=4, le=16),
    capture_radius_km: float = Query(0.7, gt=0.1, le=2.0),
    district: str | None = Query(None, description="Опционально — ограничить grid районом"),
    db: Session = Depends(get_db),
):
    """Sub-district grid: тепловая карта score по N×N ячейкам внутри района/города."""
    try:
        BusinessCategory(category)
    except ValueError:
        raise HTTPException(400, f"unknown_category: {category}")
    r = best_locations_grid(db, category, grid_size, capture_radius_km, district)
    if isinstance(r, dict) and "error" in r:
        raise HTTPException(404, r["error"])
    return r


@router.get("/summary")
def business_summary(db: Session = Depends(get_db)):
    """Overall business landscape summary."""
    total = db.query(Business).count()
    counts = get_business_counts(db)
    districts = get_business_by_district(db)

    # Top categories
    top_cats = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "total_businesses": total,
        "top_categories": [
            {"category": cat, "label": CATEGORY_LABELS.get(BusinessCategory(cat), cat), "count": cnt}
            for cat, cnt in top_cats if cnt > 0
        ],
        "districts": districts,
    }


# -----------------------------------------------------------------------
# New: recommend categories for a district
# -----------------------------------------------------------------------

@router.get("/recommend/district/{district_name}")
def recommend_district(
    district_name: str,
    top_n: int = Query(8, ge=1, le=20),
    max_capex_usd: int | None = Query(None, ge=0),
    db: Session = Depends(get_db),
):
    """Рекомендатор категорий для района: composite-score по демографии/спросу/конкуренции."""
    r = recommend_for_district(db, district_name, top_n=top_n, max_capex_usd=max_capex_usd)
    if isinstance(r, dict) and r.get("error") == "unknown_district":
        raise HTTPException(404, "unknown_district")
    return r


@router.get("/recommend/by-budget")
def recommend_by_budget(
    max_capex_usd: int = Query(..., ge=500, le=10_000_000),
    top_n: int = Query(6, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """Топ-N пар (категория, район) под заданный капекс."""
    return {"picks": recommend_for_budget(db, max_capex_usd, top_n)}


# -----------------------------------------------------------------------
# Spending potential heatmap
# -----------------------------------------------------------------------

@router.get("/spending-potential")
def spending_potential_endpoint(db: Session = Depends(get_db)):
    """Индекс spending_potential по районам — «тепло» для UI."""
    return spending_potential(db)


# -----------------------------------------------------------------------
# Radius-based area analysis
# -----------------------------------------------------------------------

@router.get("/area-analysis")
def area_analysis_endpoint(
    lat: float = Query(..., ge=43.0, le=44.0),
    lon: float = Query(..., ge=76.0, le=78.0),
    radius_km: float = Query(1.0, gt=0, le=5.0),
    category: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Анализ территории вокруг точки: конкуренты, демография, доминирующие категории."""
    if category:
        try:
            BusinessCategory(category)
        except ValueError:
            raise HTTPException(400, f"unknown_category: {category}")
    return analyze_area(db, lat, lon, radius_km, category)


# -----------------------------------------------------------------------
# Cannibalization simulator
# -----------------------------------------------------------------------

class CannibalRequest(BaseModel):
    lat: float = Field(..., ge=43.0, le=44.0)
    lon: float = Field(..., ge=76.0, le=78.0)
    category: str
    capture_radius_km: float = Field(1.2, gt=0, le=3.0)


@router.post("/cannibalization")
def cannibalization_endpoint(req: CannibalRequest, db: Session = Depends(get_db)):
    """Симулятор каннибализации: сколько отниму у соседей той же категории."""
    try:
        BusinessCategory(req.category)
    except ValueError:
        raise HTTPException(400, f"unknown_category: {req.category}")
    return cannibalization_simulation(db, req.lat, req.lon, req.category, req.capture_radius_km)


# -----------------------------------------------------------------------
# Time-based insights
# -----------------------------------------------------------------------

@router.get("/time-coverage")
def time_coverage_endpoint(
    category: str | None = Query(None),
    district: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Покрытие по часам недели: где 'час-ниша' (<30% открытых)."""
    if category:
        try:
            BusinessCategory(category)
        except ValueError:
            raise HTTPException(400, f"unknown_category: {category}")
    return time_coverage(db, category, district)
