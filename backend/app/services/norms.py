"""Social infrastructure norms for Kazakhstan.

Based on СНиП РК 3.01-01-2008 and WHO recommendations.
These are normative values: how many facilities / capacity per N people.
"""

from dataclasses import dataclass


@dataclass
class FacilityNorm:
    facility_type: str
    label_ru: str
    # How many of this facility per 10,000 people (norm)
    per_10k_norm: float
    # Average capacity per single facility
    avg_capacity: int
    # Capacity unit
    capacity_unit: str
    # What this capacity means
    capacity_desc: str
    # Source/basis
    source: str


# Normative data for Kazakhstan (СНиП + WHO + actual averages)
NORMS: dict[str, FacilityNorm] = {
    "school": FacilityNorm(
        facility_type="school",
        label_ru="Школы",
        per_10k_norm=1.5,
        avg_capacity=850,
        capacity_unit="учеников",
        capacity_desc="Мест в школе",
        source="СНиП РК 3.01-01-2008: 180 мест на 1000 жителей",
    ),
    "hospital": FacilityNorm(
        facility_type="hospital",
        label_ru="Больницы",
        per_10k_norm=0.4,
        avg_capacity=250,
        capacity_unit="коек",
        capacity_desc="Коечный фонд",
        source="Норматив МЗ РК: 40 коек на 10 000 населения",
    ),
    "clinic": FacilityNorm(
        facility_type="clinic",
        label_ru="Поликлиники",
        per_10k_norm=0.5,
        avg_capacity=500,
        capacity_unit="посещений/смена",
        capacity_desc="Посещений в смену",
        source="Норматив МЗ РК: 181 посещение на 10 000 населения в смену",
    ),
    "kindergarten": FacilityNorm(
        facility_type="kindergarten",
        label_ru="Детские сады",
        per_10k_norm=1.2,
        avg_capacity=200,
        capacity_unit="мест",
        capacity_desc="Мест в детском саду",
        source="СНиП РК: 100 мест на 1000 жителей (дети 1-6 лет ~10%)",
    ),
    "pharmacy": FacilityNorm(
        facility_type="pharmacy",
        label_ru="Аптеки",
        per_10k_norm=1.5,
        avg_capacity=0,
        capacity_unit="",
        capacity_desc="Точка обслуживания",
        source="Рекомендация ВОЗ: 1 аптека на 5000-7000 населения",
    ),
    "park": FacilityNorm(
        facility_type="park",
        label_ru="Парки",
        per_10k_norm=0.5,
        avg_capacity=0,
        capacity_unit="га",
        capacity_desc="Зелёная зона",
        source="СНиП: 6 м² зелёных насаждений на жителя",
    ),
    "fire_station": FacilityNorm(
        facility_type="fire_station",
        label_ru="Пожарные части",
        per_10k_norm=0.1,
        avg_capacity=0,
        capacity_unit="",
        capacity_desc="Пожарное депо",
        source="Норматив: радиус обслуживания 3 км",
    ),
    "bus_stop": FacilityNorm(
        facility_type="bus_stop",
        label_ru="Остановки",
        per_10k_norm=8.0,
        avg_capacity=0,
        capacity_unit="",
        capacity_desc="Остановочный пункт",
        source="Рекомендация: 300-500м между остановками",
    ),
}


def get_norm(facility_type: str) -> FacilityNorm | None:
    return NORMS.get(facility_type)
