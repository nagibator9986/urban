"""Run all data collectors to populate the database."""

import logging

from app.database import Base, SessionLocal, engine
from app.collectors import osm_collector, alag_collector, stat_collector, egov_collector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _run_safe(name: str, fn, db):
    """Run a collector, catching errors so others still run."""
    try:
        fn(db)
    except Exception as e:
        logger.error(f"{name} collector failed: {e}")
        db.rollback()


def main():
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        logger.info("=== Starting data collection for Almaty ===")

        _run_safe("OSM", osm_collector.collect_all, db)
        _run_safe("alag.kz", alag_collector.collect_all, db)
        _run_safe("stat.gov.kz", stat_collector.collect_all, db)
        _run_safe("data.egov.kz", egov_collector.collect_all, db)

        logger.info("=== All collectors finished ===")
    finally:
        db.close()


if __name__ == "__main__":
    main()
