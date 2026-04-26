from sqlalchemy import Column, Float, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class PopulationStat(Base):
    __tablename__ = "population_stats"

    id = Column(Integer, primary_key=True)
    district_id = Column(
        Integer, ForeignKey("districts.id"), nullable=False, index=True
    )
    year = Column(Integer, nullable=False)
    population = Column(Integer, nullable=False)
    density_per_km2 = Column(Float)

    district = relationship("District", back_populates="population")

    __table_args__ = (
        UniqueConstraint("district_id", "year", name="uq_population_district_year"),
        Index("ix_population_district_year", "district_id", "year"),
    )
