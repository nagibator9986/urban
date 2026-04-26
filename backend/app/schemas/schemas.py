from pydantic import BaseModel

from app.models.facility import FacilityType


class DistrictOut(BaseModel):
    id: int
    name_ru: str
    name_kz: str | None = None
    population: int | None = None
    area_km2: float | None = None
    density_per_km2: float | None = None

    model_config = {"from_attributes": True}


class FacilityOut(BaseModel):
    id: int
    name: str | None = None
    facility_type: FacilityType
    source: str | None = None
    address: str | None = None
    lat: float
    lon: float
    district_id: int | None = None

    model_config = {"from_attributes": True}


class DistrictAnalytics(BaseModel):
    district_id: int
    district_name: str
    population: int
    schools: int
    hospitals: int
    clinics: int
    kindergartens: int
    pharmacies: int
    parks: int
    police: int
    fire_stations: int
    bus_stops: int
    schools_per_10k: float
    hospitals_per_10k: float
    clinics_per_10k: float
    kindergartens_per_10k: float
    pharmacies_per_10k: float


class CoverageGap(BaseModel):
    district_name: str
    facility_type: str
    current_count: int
    per_10k: float
    city_avg_per_10k: float
    deficit_percent: float
    status: str  # "critical", "below_average", "ok"


class CityOverview(BaseModel):
    total_population: int
    districts: list[DistrictAnalytics]
    coverage_gaps: list[CoverageGap]


# --- Detailed statistics schemas ---

class FacilityNormOut(BaseModel):
    facility_type: str
    label_ru: str
    per_10k_norm: float
    avg_capacity: int
    capacity_unit: str
    capacity_desc: str
    source: str


class FacilityStatDetail(BaseModel):
    facility_type: str
    label_ru: str
    actual_count: int
    norm_count: float
    deficit: int
    surplus: int
    coverage_percent: float
    actual_per_10k: float
    norm_per_10k: float
    total_capacity: int
    needed_capacity: int
    capacity_unit: str
    source: str


class DistrictStatDetail(BaseModel):
    district_id: int
    district_name: str
    population: int
    facilities: list[FacilityStatDetail]
    overall_score: float  # 0-100


class CityStatDetail(BaseModel):
    total_population: int
    total_facilities: int
    overall_score: float
    facilities: list[FacilityStatDetail]
    districts: list[DistrictStatDetail]
