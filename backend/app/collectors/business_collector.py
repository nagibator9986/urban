"""Collect business/commercial data from OpenStreetMap for Almaty."""

import json
import logging
import time

import httpx
from geoalchemy2 import WKTElement
from sqlalchemy.orm import Session

from app.models.business import Business, BusinessCategory

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
MAX_RETRIES = 3
RETRY_DELAY = 30

# OSM tag -> our category mapping
# Each entry: (overpass_filter, category)
OSM_BUSINESS_QUERIES: list[tuple[str, BusinessCategory]] = [
    # Food & Drink
    ('node["amenity"="restaurant"](area.a);way["amenity"="restaurant"](area.a);', BusinessCategory.RESTAURANT),
    ('node["amenity"="cafe"](area.a);way["amenity"="cafe"](area.a);', BusinessCategory.CAFE),
    ('node["amenity"="bar"](area.a);way["amenity"="bar"](area.a);', BusinessCategory.BAR),
    ('node["amenity"="fast_food"](area.a);way["amenity"="fast_food"](area.a);', BusinessCategory.FAST_FOOD),
    # Shops
    ('node["shop"="supermarket"](area.a);way["shop"="supermarket"](area.a);', BusinessCategory.SUPERMARKET),
    ('node["shop"="convenience"](area.a);way["shop"="convenience"](area.a);', BusinessCategory.CONVENIENCE),
    ('node["shop"="greengrocer"](area.a);way["shop"="greengrocer"](area.a);node["shop"="grocery"](area.a);', BusinessCategory.GROCERY),
    ('node["shop"="clothes"](area.a);way["shop"="clothes"](area.a);', BusinessCategory.CLOTHING),
    ('node["shop"="electronics"](area.a);way["shop"="electronics"](area.a);', BusinessCategory.ELECTRONICS),
    ('node["shop"="beauty"](area.a);way["shop"="beauty"](area.a);node["shop"="hairdresser"](area.a);', BusinessCategory.BEAUTY_SALON),
    ('node["shop"="bakery"](area.a);way["shop"="bakery"](area.a);', BusinessCategory.BAKERY),
    ('node["shop"="butcher"](area.a);way["shop"="butcher"](area.a);', BusinessCategory.BUTCHER),
    ('node["shop"="mall"](area.a);way["shop"="mall"](area.a);', BusinessCategory.MALL),
    ('node["shop"="furniture"](area.a);way["shop"="furniture"](area.a);', BusinessCategory.FURNITURE),
    ('node["shop"="doityourself"](area.a);way["shop"="doityourself"](area.a);', BusinessCategory.HARDWARE),
    ('node["shop"="books"](area.a);way["shop"="books"](area.a);', BusinessCategory.BOOKSHOP),
    ('node["shop"="florist"](area.a);way["shop"="florist"](area.a);', BusinessCategory.FLORIST),
    ('node["shop"="jewelry"](area.a);way["shop"="jewelry"](area.a);', BusinessCategory.JEWELRY),
    ('node["shop"="optician"](area.a);way["shop"="optician"](area.a);', BusinessCategory.OPTICIAN),
    ('node["shop"="mobile_phone"](area.a);way["shop"="mobile_phone"](area.a);', BusinessCategory.MOBILE_PHONE),
    ('node["shop"="computer"](area.a);way["shop"="computer"](area.a);', BusinessCategory.COMPUTER),
    ('node["shop"="stationery"](area.a);way["shop"="stationery"](area.a);', BusinessCategory.STATIONERY),
    ('node["shop"="toys"](area.a);way["shop"="toys"](area.a);', BusinessCategory.TOYS),
    ('node["shop"="sports"](area.a);way["shop"="sports"](area.a);', BusinessCategory.SPORTS),
    ('node["shop"="pet"](area.a);way["shop"="pet"](area.a);', BusinessCategory.PET_SHOP),
    # Services
    ('node["tourism"="hotel"](area.a);way["tourism"="hotel"](area.a);node["tourism"="hostel"](area.a);', BusinessCategory.HOTEL),
    ('node["amenity"="bank"](area.a);way["amenity"="bank"](area.a);', BusinessCategory.BANK),
    ('node["amenity"="atm"](area.a);', BusinessCategory.ATM),
    ('node["amenity"="fuel"](area.a);way["amenity"="fuel"](area.a);', BusinessCategory.FUEL),
    ('node["amenity"="car_wash"](area.a);way["amenity"="car_wash"](area.a);', BusinessCategory.CAR_WASH),
    ('node["shop"="car_repair"](area.a);way["shop"="car_repair"](area.a);node["shop"="car"](area.a);', BusinessCategory.CAR_REPAIR),
    ('node["amenity"="dentist"](area.a);way["amenity"="dentist"](area.a);', BusinessCategory.DENTIST),
    ('node["amenity"="veterinary"](area.a);way["amenity"="veterinary"](area.a);', BusinessCategory.VETERINARY),
    # Fitness & Leisure
    ('node["leisure"="fitness_centre"](area.a);way["leisure"="fitness_centre"](area.a);', BusinessCategory.GYM),
    ('node["amenity"="nightclub"](area.a);way["amenity"="nightclub"](area.a);', BusinessCategory.NIGHTCLUB),
]


def _overpass_request(query: str) -> dict:
    for attempt in range(MAX_RETRIES):
        try:
            response = httpx.post(
                OVERPASS_URL, data={"data": query}, timeout=120,
            )
            if response.status_code == 429 or response.status_code >= 500:
                wait = RETRY_DELAY * (attempt + 1)
                logger.warning(f"Overpass {response.status_code}, retry in {wait}s...")
                time.sleep(wait)
                continue
            response.raise_for_status()
            return response.json()
        except httpx.TimeoutException:
            wait = RETRY_DELAY * (attempt + 1)
            logger.warning(f"Overpass timeout, retry {attempt+1}/{MAX_RETRIES} in {wait}s...")
            time.sleep(wait)
    raise RuntimeError(f"Overpass API failed after {MAX_RETRIES} retries")


def _extract_coords(element: dict) -> tuple[float, float] | None:
    if "center" in element:
        return element["center"]["lat"], element["center"]["lon"]
    if "lat" in element and "lon" in element:
        return element["lat"], element["lon"]
    return None


def collect_category(db: Session, osm_filter: str, category: BusinessCategory) -> int:
    query = f"""
    [out:json][timeout:120];
    area[name="Алматы"]->.a;
    ({osm_filter});
    out center;
    """
    data = _overpass_request(query)
    count = 0

    for element in data.get("elements", []):
        coords = _extract_coords(element)
        if not coords:
            continue

        lat, lon = coords
        osm_id = f"{element['type']}_{element['id']}"

        existing = db.query(Business).filter_by(osm_id=osm_id).first()
        if existing:
            continue

        tags = element.get("tags", {})
        name = tags.get("name", tags.get("name:ru", tags.get("name:en", "")))
        address_parts = [
            tags.get("addr:street", ""),
            tags.get("addr:housenumber", ""),
        ]
        address = " ".join(p for p in address_parts if p).strip()

        biz = Business(
            name=name or None,
            category=category,
            osm_id=osm_id,
            lat=lat,
            lon=lon,
            location=WKTElement(f"POINT({lon} {lat})", srid=4326),
            address=address or None,
            phone=tags.get("phone", tags.get("contact:phone")),
            website=tags.get("website", tags.get("contact:website")),
            opening_hours=tags.get("opening_hours"),
            cuisine=tags.get("cuisine"),
            extra_data=json.dumps(
                {k: v for k, v in tags.items()
                 if k not in ("name", "name:ru", "name:en", "addr:street",
                              "addr:housenumber", "phone", "website",
                              "opening_hours", "cuisine", "contact:phone",
                              "contact:website")},
                ensure_ascii=False,
            ) if tags else None,
        )
        db.add(biz)
        count += 1

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(f"business_collector: failed to commit category {category.value}")
        raise
    return count


def collect_all(db: Session):
    """Collect all business data from OSM."""
    logger.info("Starting business data collection from OSM...")
    total = 0

    for i, (osm_filter, category) in enumerate(OSM_BUSINESS_QUERIES):
        try:
            count = collect_category(db, osm_filter, category)
            total += count
            logger.info(f"[{i+1}/{len(OSM_BUSINESS_QUERIES)}] {category.value}: {count} businesses")
        except Exception as e:
            logger.error(f"Failed to collect {category.value}: {e}")
        time.sleep(15)

    logger.info(f"Business collection complete. Total: {total}")
    return total


if __name__ == "__main__":
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

    from app.database import Base, SessionLocal, engine
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        collect_all(db)
    finally:
        db.close()
