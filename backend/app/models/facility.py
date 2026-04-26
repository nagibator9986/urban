import enum

from geoalchemy2 import Geometry
from sqlalchemy import Column, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class FacilityType(str, enum.Enum):
    SCHOOL = "school"
    HOSPITAL = "hospital"
    CLINIC = "clinic"
    KINDERGARTEN = "kindergarten"
    PHARMACY = "pharmacy"
    PARK = "park"
    POLICE = "police"
    FIRE_STATION = "fire_station"
    BUS_STOP = "bus_stop"


class Facility(Base):
    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True)
    name = Column(String(500))
    facility_type = Column(Enum(FacilityType), nullable=False, index=True)
    source = Column(String(20))  # osm, alag, egov
    source_id = Column(String(100))
    address = Column(Text)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    location = Column(Geometry("POINT", srid=4326))
    district_id = Column(Integer, ForeignKey("districts.id"), index=True)
    extra_data = Column(Text)  # JSON string for additional fields

    district = relationship("District", back_populates="facilities")

    __table_args__ = (
        Index("ix_facility_type_district", "facility_type", "district_id"),
        Index(
            "ix_facility_source_sourceid",
            "source",
            "source_id",
            unique=False,
        ),
    )
