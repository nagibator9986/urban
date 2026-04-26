import enum

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, Column, Enum, Float, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class District(Base):
    __tablename__ = "districts"

    id = Column(Integer, primary_key=True)
    name_ru = Column(String(100), nullable=False, unique=True)
    name_kz = Column(String(100))
    osm_id = Column(BigInteger)
    geometry = Column(Geometry("MULTIPOLYGON", srid=4326))
    area_km2 = Column(Float)

    population = relationship("PopulationStat", back_populates="district")
    facilities = relationship("Facility", back_populates="district")
