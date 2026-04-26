"""Collect infrastructure data from OpenStreetMap Overpass API for Almaty."""

import json
import logging
import time

import httpx
from geoalchemy2 import WKTElement
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.facility import Facility, FacilityType

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
MAX_RETRIES = 3
RETRY_DELAY = 30  # seconds

# Mapping of OSM amenity tags to our FacilityType
OSM_QUERIES = {
    FacilityType.SCHOOL: 'node["amenity"="school"](area.a);way["amenity"="school"](area.a);',
    FacilityType.HOSPITAL: 'node["amenity"="hospital"](area.a);way["amenity"="hospital"](area.a);',
    FacilityType.CLINIC: 'node["amenity"="clinic"](area.a);way["amenity"="clinic"](area.a);',
    FacilityType.KINDERGARTEN: 'node["amenity"="kindergarten"](area.a);way["amenity"="kindergarten"](area.a);',
    FacilityType.PHARMACY: 'node["amenity"="pharmacy"](area.a);way["amenity"="pharmacy"](area.a);',
    FacilityType.PARK: 'node["leisure"="park"](area.a);way["leisure"="park"](area.a);relation["leisure"="park"](area.a);',
    FacilityType.POLICE: 'node["amenity"="police"](area.a);way["amenity"="police"](area.a);',
    FacilityType.FIRE_STATION: 'node["amenity"="fire_station"](area.a);way["amenity"="fire_station"](area.a);',
    FacilityType.BUS_STOP: 'node["highway"="bus_stop"](area.a);',
}


def _build_query(osm_filter: str) -> str:
    return f"""
    [out:json][timeout:120];
    area[name="Алматы"]->.a;
    ({osm_filter});
    out center;
    """


def _overpass_request(query: str) -> dict:
    """Make Overpass API request with retries.

    Sends explicit User-Agent (Overpass blocks default httpx UA with 406).
    """
    headers = {
        "User-Agent": "AQYL-CITY/1.0 (urban analytics; contact: dev@aqyl.city)",
        "Accept": "application/json",
    }
    for attempt in range(MAX_RETRIES):
        try:
            response = httpx.post(
                OVERPASS_URL,
                data={"data": query},
                headers=headers,
                timeout=120,
            )
            if response.status_code == 429 or response.status_code >= 500:
                wait = RETRY_DELAY * (attempt + 1)
                logger.warning(f"Overpass {response.status_code}, retry in {wait}s...")
                time.sleep(wait)
                continue
            if response.status_code == 406:
                # Bad Accept or UA — log body for debug
                logger.error("Overpass 406. Body: %s", response.text[:300])
                response.raise_for_status()
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


def collect_facilities(db: Session, facility_type: FacilityType) -> int:
    """Fetch facilities of given type from OSM and store in DB.

    Atomic: либо все элементы коммитятся, либо ничего (rollback при ошибке).
    """
    query = _build_query(OSM_QUERIES[facility_type])
    data = _overpass_request(query)

    count = 0
    try:
        for element in data.get("elements", []):
            coords = _extract_coords(element)
            if not coords:
                continue

            lat, lon = coords
            tags = element.get("tags", {})
            name = tags.get("name", tags.get("name:ru", tags.get("name:kk", "")))

            existing = db.query(Facility).filter_by(
                source="osm",
                source_id=str(element["id"]),
            ).first()
            if existing:
                continue

            facility = Facility(
                name=name or None,
                facility_type=facility_type,
                source="osm",
                source_id=str(element["id"]),
                address=tags.get("addr:street", ""),
                lat=lat,
                lon=lon,
                location=WKTElement(f"POINT({lon} {lat})", srid=4326),
                extra_data=json.dumps(
                    {k: v for k, v in tags.items() if k != "name"},
                    ensure_ascii=False,
                ),
            )
            db.add(facility)
            count += 1

        db.commit()
        logger.info(f"OSM: loaded {count} {facility_type.value} facilities")
        return count
    except Exception:
        db.rollback()
        logger.exception(f"OSM: failed to commit {facility_type.value} facilities")
        raise


def collect_district_boundaries(db: Session) -> int:
    """Fetch Almaty district boundaries from OSM."""
    query = """
    [out:json][timeout:120];
    area[name="Алматы"]->.a;
    relation["admin_level"="6"](area.a);
    out tags;
    """
    data = _overpass_request(query)

    count = 0
    try:
        for element in data.get("elements", []):
            tags = element.get("tags", {})
            name_ru = tags.get("name:ru", tags.get("name", ""))
            name_kz = tags.get("name:kk", "")

            if not name_ru or "район" not in name_ru.lower():
                continue

            existing = db.query(District).filter_by(name_ru=name_ru).first()
            if existing:
                continue

            district = District(
                name_ru=name_ru,
                name_kz=name_kz,
                osm_id=element.get("id"),
            )
            db.add(district)
            count += 1

        db.commit()
        logger.info(f"OSM: loaded {count} districts")
        return count
    except Exception:
        db.rollback()
        logger.exception("OSM: failed to commit districts")
        raise


def collect_all(db: Session):
    """Run all OSM collectors with rate limiting."""
    logger.info("Starting OSM data collection for Almaty...")
    collect_district_boundaries(db)

    for ftype in OSM_QUERIES:
        try:
            collect_facilities(db, ftype)
        except Exception as e:
            logger.error(f"OSM: failed to collect {ftype.value}: {e}")
        time.sleep(15)  # Overpass rate limit

    logger.info("OSM collection complete.")
