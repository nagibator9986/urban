"""Collect school data from alag.kz GeoJSON API."""

import json
import logging

import httpx
from geoalchemy2 import WKTElement
from sqlalchemy.orm import Session

from app.models.facility import Facility, FacilityType

logger = logging.getLogger(__name__)

ALAG_BASE = "https://alag.kz/api/list"


def collect_schools(db: Session) -> int:
    """Fetch all schools from alag.kz for Almaty using cursor pagination."""
    count = 0
    cursor = None
    max_pages = 10
    page = 0

    while page < max_pages:
        page += 1
        params: dict = {
            "lang": "ru",
            "collection": "school",
            "context[admterr_id]": "kz.75",
            "limit": 30,
        }
        if cursor:
            params["cursor"] = cursor

        response = httpx.get(ALAG_BASE, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        features = data.get("features", [])
        if not features:
            break

        for feature in features:
            props = feature.get("properties", {})
            geometry = feature.get("geometry", {})
            bbox = geometry.get("bbox", [])

            if not bbox or len(bbox) < 2:
                continue

            lon = bbox[0] if len(bbox) == 2 else (bbox[0] + bbox[2]) / 2
            lat = bbox[1] if len(bbox) == 2 else (bbox[1] + bbox[3]) / 2

            source_id = f"alag_{feature.get('id', count)}"
            existing = db.query(Facility).filter_by(
                source="alag", source_id=source_id
            ).first()
            if existing:
                continue

            name = props.get("name", "")
            district_name = props.get(
                "admterr_id/district_admterr_id/name", ""
            )
            street = props.get("building_addreg_id/geonim_id/name", "")
            number = props.get("building_addreg_id/number", "")
            address = f"{street} {number}".strip() if street else ""

            facility = Facility(
                name=name,
                facility_type=FacilityType.SCHOOL,
                source="alag",
                source_id=source_id,
                address=address,
                lat=lat,
                lon=lon,
                location=WKTElement(f"POINT({lon} {lat})", srid=4326),
                extra_data=json.dumps(
                    {"bin": props.get("bin", ""), "district": district_name},
                    ensure_ascii=False,
                ),
            )
            db.add(facility)
            count += 1

        # Cursor pagination: continuation[1] is the next cursor
        continuation = data.get("continuation")
        if not continuation or len(continuation) < 2:
            break
        new_cursor = continuation[1]
        if new_cursor == cursor:
            break  # API returning same cursor = no more pages
        cursor = new_cursor

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("alag.kz: failed to commit schools")
        raise
    logger.info(f"alag.kz: loaded {count} schools")
    return count


def collect_all(db: Session):
    logger.info("Starting alag.kz data collection...")
    try:
        collect_schools(db)
    except Exception:
        db.rollback()
        logger.exception("alag.kz collect_all failed; rolled back")
        raise
    logger.info("alag.kz collection complete.")
