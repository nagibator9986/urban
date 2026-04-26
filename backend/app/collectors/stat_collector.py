"""Collect population data from stat.gov.kz XLSX files."""

import io
import logging

import httpx
import openpyxl
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.population import PopulationStat

logger = logging.getLogger(__name__)

# Direct download URL for Almaty population by districts
STAT_URL = "https://stat.gov.kz/api/iblock/element/region/480403/file/ru/"

# Fallback: hardcoded data from stat.gov.kz (March 2026)
POPULATION_2026 = {
    "Алмалинский район": 273422,
    "Алатауский район": 402867,
    "Ауэзовский район": 360568,
    "Бостандыкский район": 349503,
    "Жетысуский район": 198512,
    "Медеуский район": 255147,
    "Наурызбайский район": 242444,
    "Турксибский район": 272273,
}


def _normalize_district_name(name: str) -> str:
    """Normalize district name for matching: 'Алмалинский район' -> 'Алмалинский'."""
    return name.replace(" район", "").strip()


def _try_parse_xlsx(content: bytes) -> dict[str, int] | None:
    """Try to parse population from downloaded XLSX."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        ws = wb.active
        result = {}
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and len(row) >= 2:
                name = str(row[0]).strip() if row[0] else ""
                pop = row[-1] if isinstance(row[-1], (int, float)) else None
                if name and pop and "район" in name.lower():
                    result[name] = int(pop)
        return result if result else None
    except Exception as e:
        logger.warning(f"Failed to parse XLSX: {e}")
        return None


def collect_population(db: Session) -> int:
    """Fetch population data and store per district."""
    population_data = None

    try:
        response = httpx.get(STAT_URL, timeout=30, follow_redirects=True)
        if response.status_code == 200 and len(response.content) > 100:
            population_data = _try_parse_xlsx(response.content)
    except Exception as e:
        logger.warning(f"Failed to download from stat.gov.kz: {e}")

    if not population_data:
        logger.info("Using hardcoded population data (stat.gov.kz March 2026)")
        population_data = POPULATION_2026

    count = 0
    try:
        for district_name, population in population_data.items():
            normalized = _normalize_district_name(district_name)

            district = db.query(District).filter(
                District.name_ru.ilike(f"%{normalized}%")
            ).first()

            if not district:
                district = District(name_ru=f"{normalized} район")
                db.add(district)
                db.flush()

            existing = db.query(PopulationStat).filter_by(
                district_id=district.id, year=2026
            ).first()

            if existing:
                existing.population = population
            else:
                stat = PopulationStat(
                    district_id=district.id,
                    year=2026,
                    population=population,
                )
                db.add(stat)
            count += 1

        db.commit()
        logger.info(f"stat.gov.kz: loaded population for {count} districts")
        return count
    except Exception:
        db.rollback()
        logger.exception("stat.gov.kz: failed to commit population data")
        raise


def collect_all(db: Session):
    logger.info("Starting stat.gov.kz data collection...")
    collect_population(db)
    logger.info("stat.gov.kz collection complete.")
