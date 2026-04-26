"""Collect data from data.egov.kz API v4 (Elasticsearch-based).

Note: As of 2026, the medical_organizations dataset on data.egov.kz
does NOT contain name, address, or geoposition fields for Almaty
facilities — only area_name, id, and status. We still attempt collection
but expect 0 results with coordinates. Primary medical data comes from OSM.
"""

import json
import logging

import httpx
from geoalchemy2 import WKTElement
from sqlalchemy.orm import Session

from app.config import settings
from app.models.facility import Facility, FacilityType

logger = logging.getLogger(__name__)

EGOV_BASE = "https://data.egov.kz/api/v4"


def _egov_request(dataset: str, version: str, query: dict) -> list[dict]:
    """Make a request to data.egov.kz API."""
    source = json.dumps(query, ensure_ascii=False)
    url = f"{EGOV_BASE}/{dataset}/{version}"
    params = {"apiKey": settings.egov_api_key, "source": source}

    response = httpx.get(url, params=params, timeout=30)
    if response.status_code == 404:
        logger.warning(f"egov dataset {dataset}/{version} not found")
        return []
    response.raise_for_status()

    data = response.json()
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "error" in data:
        logger.warning(f"egov error: {data['error']}")
        return []
    return []


def collect_medical_organizations(db: Session) -> int:
    """Fetch medical organizations for Almaty from data.egov.kz."""
    query = {
        "size": 500,
        "query": {
            "bool": {
                "must": [{"match": {"area_name": "Алматы"}}]
            }
        },
    }

    records = _egov_request("medical_organizations", "v1", query)

    count = 0
    for record in records:
        # Try multiple possible geo field names
        geo = record.get("geoposition", record.get("geo", ""))
        if not geo:
            continue

        try:
            parts = [p.strip() for p in str(geo).split(",")]
            lat, lon = float(parts[0]), float(parts[1])
        except (ValueError, IndexError):
            continue

        if lat == 0.0 or lon == 0.0:
            continue

        source_id = f"egov_med_{record.get('id', count)}"
        existing = db.query(Facility).filter_by(
            source="egov", source_id=source_id
        ).first()
        if existing:
            continue

        name = record.get("name", record.get("name_ru", "")).strip()
        address = record.get("address", "").strip()

        facility = Facility(
            name=name or None,
            facility_type=FacilityType.CLINIC,
            source="egov",
            source_id=source_id,
            address=address,
            lat=lat,
            lon=lon,
            location=WKTElement(f"POINT({lon} {lat})", srid=4326),
        )
        db.add(facility)
        count += 1

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("egov: failed to commit medical organizations")
        raise
    logger.info(f"egov: loaded {count} medical organizations")
    return count


def collect_all(db: Session):
    logger.info("Starting data.egov.kz data collection...")
    collect_medical_organizations(db)
    logger.info("data.egov.kz collection complete.")
