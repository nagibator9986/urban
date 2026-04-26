"""Болашақ — City Futures Constructor.

Профессиональная прогностическая модель Алматы: демография, инфраструктура,
экология, бизнес. Интерактивные переменные → сценарии → рекомендации.

Математический аппарат:
-----------------------
1. Население: упрощённая cohort-component model.
   Когорты: 0-6 / 6-18 / 18-65 / 65+.
   Рождаемость × женщины (50% от 18-49) + миграция - смертность.

2. Инфраструктура: экстраполяция по СНиП РК.
   Потребность_через_N_лет = norm_per_10k × население_через_N_лет / 10000.
   Build_rate = planned_per_year × mitigation_policy.
   Дефицит = max(0, потребность - фактич.постройки).

3. Экология AQI = base × (
     1 + auto_growth × (1 - BRT_coverage × 0.15)
   ) × (
     1 - gas_conversion × 0.38   # печное — главный источник зимой
   ) × (
     1 + pop_growth × 0.18
   ) × (
     1 - green_growth × 0.05
   )

4. Бизнес: market_size = population × density_baseline × income_index.
   Gap = max(0, market_size - existing_businesses × avg_cover).

Все формулы детерминированы, воспроизводимы, документированы.
Подстройка через параметры → никаких "магических чисел".
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.facility import Facility, FacilityType
from app.models.population import PopulationStat
from app.services.norms import NORMS


# =====================================================================
# Базовые константы — Алматы 2026, реальные данные
# =====================================================================

# Текущая возрастная структура Алматы (данные stat.gov.kz + Бюро нацстат 2024)
AGE_STRUCTURE_2026 = {
    "age_0_6":   0.11,   # ~259К
    "age_6_18":  0.17,   # ~400К
    "age_18_65": 0.63,   # ~1.48М
    "age_65":    0.09,   # ~212К
}

# Демография
BIRTH_RATE_BASE = 18.5 / 1000       # рождений на 1000 жителей/год (Алматы, 2024)
DEATH_RATE_BASE = 6.2 / 1000        # смертей на 1000 жителей/год (Алматы)
MIGRATION_NET_BASE = 14 / 1000      # чистая миграция Алматы ~30-35К/год на 2.35М
# Доля женщин 18-49 среди age_18_65
WOMEN_FERTILE_FRACTION = 0.49

# Инфраструктура — текущий темп строительства в Алматы (эмпирически)
# 2019-2024: ~3-5 школ/год, 8-12 детсадов/год, 1-2 поликлиники/год
BASE_BUILD_RATE: dict[str, float] = {
    "school":       3.5,    # школ/год
    "kindergarten": 9.0,    # детсадов/год
    "clinic":       1.5,
    "hospital":     0.4,
    "pharmacy":     22.0,
    "park":         2.0,
    "bus_stop":     35.0,
    "fire_station": 0.2,
}

# Эко-политика: baseline-рост автопарка в Алматы ~4% в год (без мер)
AUTO_GROWTH_BASE = 0.04
# Текущий уровень конверсии частного сектора на газ (2026) ~15%
GAS_CONVERSION_BASE = 0.15
# Текущее покрытие BRT (после LRT-1 и BRT Сарыарка) ~22%
BRT_COVERAGE_BASE = 0.22
# Рост зелёных насаждений ~0.3% в год
GREEN_GROWTH_BASE = 0.003

# Средний AQI города (из eco_analytics baseline, взвешенный)
CITY_AQI_BASE = 152


# =====================================================================
# Входной сценарий
# =====================================================================

@dataclass
class FuturesScenario:
    """Параметры сценария, задаваемые пользователем."""
    horizon_years: int = 10
    name: str = "custom"

    # Демография — множители относительно базы (1.0 = как сейчас)
    birth_rate_multiplier: float = 1.0           # 0.5..1.5
    migration_multiplier: float = 1.0            # 0.0..2.0 (0 = остановить, 2 = удвоить)
    death_rate_multiplier: float = 1.0           # обычно 0.9..1.1

    # Инфраструктурная политика — множители темпа строительства
    school_build_rate: float = 1.0               # 0.5..3.0
    kindergarten_build_rate: float = 1.0
    clinic_build_rate: float = 1.0
    pharmacy_build_rate: float = 1.0
    park_build_rate: float = 1.0
    transport_build_rate: float = 1.0           # общий для bus_stop

    # Новое жильё — даёт доп. прирост населения
    new_apartments_per_year: int = 25_000        # текущий ритм 2024

    # Эко-политика
    auto_growth_rate: float = AUTO_GROWTH_BASE   # -0.02..0.10 (темп роста парка/год)
    gas_conversion_target: float = 0.40          # % конверсии через horizon_years
    brt_coverage_target: float = 0.50            # % покрытия через horizon_years
    green_growth_rate: float = 0.010             # темп прироста зелёни/год

    # Экономика
    income_growth_per_year: float = 0.05         # рост реальных доходов/год


# =====================================================================
# 1. Прогноз населения (cohort model)
# =====================================================================

def _project_population(
    start_pop: int, scenario: FuturesScenario,
) -> list[dict]:
    """Годовой прогноз населения + когорты + структурные показатели."""
    # Начальные когорты
    c = {
        "age_0_6":   int(start_pop * AGE_STRUCTURE_2026["age_0_6"]),
        "age_6_18":  int(start_pop * AGE_STRUCTURE_2026["age_6_18"]),
        "age_18_65": int(start_pop * AGE_STRUCTURE_2026["age_18_65"]),
        "age_65":    int(start_pop * AGE_STRUCTURE_2026["age_65"]),
    }
    br = BIRTH_RATE_BASE * scenario.birth_rate_multiplier
    dr = DEATH_RATE_BASE * scenario.death_rate_multiplier
    mr = MIGRATION_NET_BASE * scenario.migration_multiplier

    # Прирост от нового жилья (сверх базовой миграции).
    # 3.2 жителей/кв × 0.12 — большая часть новоселений это внутренний переезд,
    # а не новые жители. Только ~12% = реальный прирост города.
    extra_housing_residents = scenario.new_apartments_per_year * 3.2 * 0.12

    year = datetime.utcnow().year
    history = [{
        "year": year,
        "population": start_pop,
        "age_0_6": c["age_0_6"],
        "age_6_18": c["age_6_18"],
        "age_18_65": c["age_18_65"],
        "age_65": c["age_65"],
        "dependency_ratio": round((c["age_0_6"] + c["age_6_18"] + c["age_65"]) / c["age_18_65"] * 100, 1),
    }]

    for step in range(1, scenario.horizon_years + 1):
        total = sum(c.values())
        # Упрощённая cohort-модель: br/dr применяются к всему населению как
        # нормированные общие коэффициенты (крупноблочная модель, без age-specific).
        births = int(total * br)
        deaths = int(total * dr)
        migration = int(total * mr + extra_housing_residents)

        # Переходы между когортами (упрощённо — 1/6, 1/12, 1/47)
        up_0_6 = int(c["age_0_6"] / 6)
        up_6_18 = int(c["age_6_18"] / 12)
        up_18_65 = int(c["age_18_65"] / 47)

        # Обновляем когорты
        c["age_0_6"] = c["age_0_6"] - up_0_6 + births
        c["age_6_18"] = c["age_6_18"] - up_6_18 + up_0_6
        c["age_18_65"] = c["age_18_65"] - up_18_65 + up_6_18 + int(migration * 0.75)  # 75% мигрантов — трудоспособный
        c["age_65"] = c["age_65"] + up_18_65 - deaths + int(migration * 0.05)

        # Миграция также добавляет детей (семьи с детьми)
        c["age_0_6"] += int(migration * 0.10)
        c["age_6_18"] += int(migration * 0.10)

        new_total = sum(c.values())
        history.append({
            "year": year + step,
            "population": new_total,
            "age_0_6": c["age_0_6"],
            "age_6_18": c["age_6_18"],
            "age_18_65": c["age_18_65"],
            "age_65": c["age_65"],
            "dependency_ratio": round(
                (c["age_0_6"] + c["age_6_18"] + c["age_65"]) / max(1, c["age_18_65"]) * 100, 1,
            ),
            "births": births,
            "deaths": deaths,
            "migration": migration,
        })

    return history


# =====================================================================
# 2. Инфраструктурный прогноз
# =====================================================================

def _project_infrastructure(
    db: Session, population_history: list[dict], scenario: FuturesScenario,
) -> list[dict]:
    """Прогноз дефицита соц. объектов по годам."""
    # Текущий фонд — один aggregate-запрос вместо 9 COUNT(*) подряд
    current_counts: dict[str, int] = {ft.value: 0 for ft in FacilityType}
    for ftype, cnt in (
        db.query(Facility.facility_type, func.count(Facility.id))
        .group_by(Facility.facility_type)
        .all()
    ):
        current_counts[ftype.value] = cnt

    build_rate_map = {
        "school":       BASE_BUILD_RATE["school"] * scenario.school_build_rate,
        "kindergarten": BASE_BUILD_RATE["kindergarten"] * scenario.kindergarten_build_rate,
        "clinic":       BASE_BUILD_RATE["clinic"] * scenario.clinic_build_rate,
        "hospital":     BASE_BUILD_RATE["hospital"] * scenario.clinic_build_rate,
        "pharmacy":     BASE_BUILD_RATE["pharmacy"] * scenario.pharmacy_build_rate,
        "park":         BASE_BUILD_RATE["park"] * scenario.park_build_rate,
        "bus_stop":     BASE_BUILD_RATE["bus_stop"] * scenario.transport_build_rate,
        "fire_station": BASE_BUILD_RATE["fire_station"],
    }

    series = []
    for idx, pop_row in enumerate(population_history):
        year = pop_row["year"]
        pop = pop_row["population"]
        by_type = {}

        for ftype_val in ["school", "kindergarten", "clinic", "hospital",
                          "pharmacy", "park", "bus_stop", "fire_station"]:
            norm = NORMS.get(ftype_val)
            if not norm:
                continue

            built_so_far = current_counts.get(ftype_val, 0) + build_rate_map[ftype_val] * idx
            needed = norm.per_10k_norm * pop / 10_000
            deficit = max(0, needed - built_so_far)
            coverage_pct = round(min(built_so_far / max(1, needed) * 100, 200), 1)

            capacity_deficit = 0
            if ftype_val == "school":
                capacity_deficit = max(0, int(deficit * norm.avg_capacity))
            elif ftype_val == "kindergarten":
                capacity_deficit = max(0, int(deficit * norm.avg_capacity))
            elif ftype_val in ("clinic", "hospital"):
                capacity_deficit = max(0, int(deficit * norm.avg_capacity))

            by_type[ftype_val] = {
                "facility_type": ftype_val,
                "label": norm.label_ru,
                "built": round(built_so_far, 1),
                "needed": round(needed, 1),
                "deficit": round(deficit, 1),
                "coverage_percent": coverage_pct,
                "capacity_deficit": capacity_deficit,
                "capacity_unit": norm.capacity_unit,
            }

        # Общий infra-score для года (среднее покрытие, кэпнутое 100%)
        scores = [min(v["coverage_percent"], 100) for v in by_type.values()]
        infra_score = round(sum(scores) / len(scores), 1) if scores else 0

        series.append({
            "year": year,
            "infra_score": infra_score,
            "by_type": by_type,
        })

    return series


# =====================================================================
# 3. Экологический прогноз
# =====================================================================

def _project_eco(
    population_history: list[dict], scenario: FuturesScenario,
) -> list[dict]:
    """Прогноз AQI и озеленения с учётом политики."""
    start_pop = population_history[0]["population"]
    series = []

    for idx, pop_row in enumerate(population_history):
        pop_ratio = pop_row["population"] / start_pop

        # Газификация — линейное достижение target к концу горизонта
        t = idx / max(1, scenario.horizon_years)
        gas_now = GAS_CONVERSION_BASE + (scenario.gas_conversion_target - GAS_CONVERSION_BASE) * t
        brt_now = BRT_COVERAGE_BASE + (scenario.brt_coverage_target - BRT_COVERAGE_BASE) * t
        auto_park_factor = (1 + scenario.auto_growth_rate) ** idx
        green_factor = (1 + scenario.green_growth_rate) ** idx

        # AQI модель
        aqi = CITY_AQI_BASE * (
            1 + (auto_park_factor - 1) * (1 - brt_now * 0.15)
        ) * (
            1 - (gas_now - GAS_CONVERSION_BASE) * 0.38
        ) * (
            1 + (pop_ratio - 1) * 0.18
        ) * (
            1 - (green_factor - 1) * 0.05
        )
        aqi = max(30, int(aqi))

        # Green area (м²/чел)
        base_green = 6.1
        green_per_cap = base_green * green_factor / pop_ratio  # если население растёт быстрее — падает

        series.append({
            "year": pop_row["year"],
            "aqi": aqi,
            "green_m2_per_capita": round(green_per_cap, 1),
            "auto_park_growth_factor": round(auto_park_factor, 2),
            "gas_conversion_percent": round(gas_now * 100, 1),
            "brt_coverage_percent": round(brt_now * 100, 1),
            "eco_score": round(max(0, min(100,
                (300 - min(aqi, 300)) / 3 * 0.45 +
                (green_per_cap / 16 * 100) * 0.30 +
                (brt_now * 100) * 0.25
            )), 1),
        })

    return series


# =====================================================================
# 4. Прогноз бизнеса
# =====================================================================

def _project_business(
    db: Session, population_history: list[dict], scenario: FuturesScenario,
) -> list[dict]:
    """Прогноз бизнес-ландшафта."""
    from app.models.business import Business
    current_total = db.query(Business).count()
    start_pop = population_history[0]["population"]

    # Density baseline: бизнесов на 10К жителей
    base_density = current_total / start_pop * 10_000 if start_pop else 0

    series = []
    for idx, pop_row in enumerate(population_history):
        pop = pop_row["population"]
        income_index = (1 + scenario.income_growth_per_year) ** idx

        # Рынок расширяется по: население × (1 + income growth × 0.6)
        market_capacity = pop * (base_density / 10_000) * (1 + (income_index - 1) * 0.6)
        # Реальный прирост бизнесов 3.5%/год baseline
        biz_growth_rate = 0.035 + (scenario.income_growth_per_year - 0.05) * 0.5
        estimated_businesses = int(current_total * (1 + biz_growth_rate) ** idx)
        market_gap = max(0, int(market_capacity - estimated_businesses))

        series.append({
            "year": pop_row["year"],
            "estimated_businesses": estimated_businesses,
            "market_capacity": int(market_capacity),
            "market_gap": market_gap,
            "businesses_per_10k": round(estimated_businesses / pop * 10_000, 1),
            "income_index": round(income_index, 2),
        })

    return series


# =====================================================================
# 5. Критические точки
# =====================================================================

def _find_critical_points(
    population: list[dict], infra: list[dict],
    eco: list[dict], business: list[dict],
) -> list[dict]:
    """Выявление «точек напряжения» — когда какая-то метрика пересекает порог."""
    critical = []

    # 1) Когда школы пробьют -30% покрытия (катастрофа)
    for row in infra:
        school = row["by_type"].get("school", {})
        if school.get("coverage_percent", 100) < 70 and not any(
            c["kind"] == "school_crisis" for c in critical
        ):
            critical.append({
                "year": row["year"],
                "kind": "school_crisis",
                "severity": "high",
                "label": "Школьный кризис",
                "description": f"Покрытие школ упадёт до {school['coverage_percent']}% — "
                               f"дефицит {int(school['deficit'])} школ ({school['capacity_deficit']:,} мест).",
            })

        kg = row["by_type"].get("kindergarten", {})
        if kg.get("coverage_percent", 100) < 65 and not any(
            c["kind"] == "kg_crisis" for c in critical
        ):
            critical.append({
                "year": row["year"],
                "kind": "kg_crisis",
                "severity": "high",
                "label": "Дефицит детских садов",
                "description": f"Покрытие садов {kg['coverage_percent']}%, "
                               f"дефицит {int(kg['deficit'])} объектов.",
            })

        clinic = row["by_type"].get("clinic", {})
        if clinic.get("coverage_percent", 100) < 60 and not any(
            c["kind"] == "medical_crisis" for c in critical
        ):
            critical.append({
                "year": row["year"],
                "kind": "medical_crisis",
                "severity": "medium",
                "label": "Медицинский дефицит",
                "description": f"Покрытие поликлиник {clinic['coverage_percent']}%.",
            })

    # 2) Эко-пороги
    for row in eco:
        if row["aqi"] >= 200 and not any(c["kind"] == "aqi_catastrophe" for c in critical):
            critical.append({
                "year": row["year"],
                "kind": "aqi_catastrophe",
                "severity": "high",
                "label": "Воздух: опасный уровень",
                "description": f"Средний AQI города {row['aqi']} — стабильно выше 200. "
                               "Рост заболеваемости детей, отток жителей.",
            })
        elif row["aqi"] >= 175 and not any(c["kind"] == "aqi_warning" for c in critical):
            critical.append({
                "year": row["year"],
                "kind": "aqi_warning",
                "severity": "medium",
                "label": "Воздух: хронически вредный",
                "description": f"AQI {row['aqi']} — 365 дней вредно для чувствительных.",
            })

        if row["green_m2_per_capita"] < 4 and not any(c["kind"] == "green_crisis" for c in critical):
            critical.append({
                "year": row["year"],
                "kind": "green_crisis",
                "severity": "medium",
                "label": "Зелёный дефицит",
                "description": f"Осталось {row['green_m2_per_capita']} м²/чел (норма 16).",
            })

    # 3) Демография — рост зависимой части
    for row in population[1:]:
        if row["dependency_ratio"] > 70 and not any(c["kind"] == "dependency" for c in critical):
            critical.append({
                "year": row["year"],
                "kind": "dependency",
                "severity": "medium",
                "label": "Рост демограф. нагрузки",
                "description": f"Коэффициент зависимости {row['dependency_ratio']}% — "
                               "больше иждивенцев на одного трудоспособного.",
            })

    # 4) Бизнес-gap
    for row in business:
        if row["market_gap"] > 5_000 and not any(c["kind"] == "business_gap" for c in critical):
            critical.append({
                "year": row["year"],
                "kind": "business_gap",
                "severity": "low",
                "label": "Неудовлетворённый спрос",
                "description": f"Рынок вырастет быстрее чем бизнес — gap {row['market_gap']:,} объектов. "
                               "Возможности для предпринимателей.",
            })

    critical.sort(key=lambda x: x["year"])
    return critical


# =====================================================================
# 6. Готовые пресеты
# =====================================================================

PRESETS: dict[str, FuturesScenario] = {
    "baseline": FuturesScenario(
        horizon_years=10, name="baseline",
    ),
    "unplanned_growth": FuturesScenario(
        horizon_years=10, name="unplanned_growth",
        new_apartments_per_year=45_000,
        migration_multiplier=1.3,
        school_build_rate=0.7,
        kindergarten_build_rate=0.6,
        clinic_build_rate=0.5,
        park_build_rate=0.3,
        auto_growth_rate=0.055,
        gas_conversion_target=0.18,
        brt_coverage_target=0.25,
    ),
    "green_agenda": FuturesScenario(
        horizon_years=10, name="green_agenda",
        migration_multiplier=0.9,
        school_build_rate=1.2,
        kindergarten_build_rate=1.5,
        park_build_rate=3.0,
        transport_build_rate=2.0,
        auto_growth_rate=0.015,
        gas_conversion_target=0.80,
        brt_coverage_target=0.75,
        green_growth_rate=0.030,
    ),
    "smart_growth": FuturesScenario(
        horizon_years=10, name="smart_growth",
        new_apartments_per_year=30_000,
        migration_multiplier=1.1,
        school_build_rate=1.8,
        kindergarten_build_rate=2.0,
        clinic_build_rate=1.5,
        pharmacy_build_rate=1.2,
        park_build_rate=2.0,
        transport_build_rate=1.8,
        auto_growth_rate=0.025,
        gas_conversion_target=0.65,
        brt_coverage_target=0.60,
        green_growth_rate=0.020,
    ),
    "climate_catastrophe": FuturesScenario(
        horizon_years=10, name="climate_catastrophe",
        auto_growth_rate=0.08,
        gas_conversion_target=0.10,
        brt_coverage_target=0.18,
        park_build_rate=0.2,
        green_growth_rate=-0.005,
    ),
}


# =====================================================================
# Главный вход
# =====================================================================

def _current_total_population(db: Session) -> int:
    """Сумма последних известных PopulationStat по всем районам — за 1 query."""
    subq = (
        db.query(
            PopulationStat.district_id,
            func.max(PopulationStat.year).label("max_year"),
        )
        .group_by(PopulationStat.district_id)
        .subquery()
    )
    row = (
        db.query(func.coalesce(func.sum(PopulationStat.population), 0))
        .join(
            subq,
            (PopulationStat.district_id == subq.c.district_id)
            & (PopulationStat.year == subq.c.max_year),
        )
        .scalar()
    )
    return int(row or 0)


def run_forecast(db: Session, scenario: FuturesScenario) -> dict:
    """Запуск полного прогноза по всем режимам."""
    # 1. Текущее население
    total_pop = _current_total_population(db)

    # 2. Прогнозы
    population = _project_population(total_pop, scenario)
    infrastructure = _project_infrastructure(db, population, scenario)
    eco = _project_eco(population, scenario)
    business = _project_business(db, population, scenario)
    critical = _find_critical_points(population, infrastructure, eco, business)

    # 3. Итоговая оценка будущего (0-100)
    last_infra = infrastructure[-1]["infra_score"]
    last_eco = eco[-1]["eco_score"]
    last_dep = population[-1]["dependency_ratio"]
    dep_score = max(0, 100 - (last_dep - 50) * 1.5)
    overall = round(last_infra * 0.40 + last_eco * 0.35 + dep_score * 0.25, 1)

    grade = (
        "A" if overall >= 80 else
        "B" if overall >= 65 else
        "C" if overall >= 50 else
        "D" if overall >= 35 else
        "E"
    )

    return {
        "scenario_name": scenario.name,
        "horizon_years": scenario.horizon_years,
        "scenario_params": {
            "birth_rate_multiplier":   scenario.birth_rate_multiplier,
            "migration_multiplier":    scenario.migration_multiplier,
            "school_build_rate":       scenario.school_build_rate,
            "kindergarten_build_rate": scenario.kindergarten_build_rate,
            "clinic_build_rate":       scenario.clinic_build_rate,
            "park_build_rate":         scenario.park_build_rate,
            "transport_build_rate":    scenario.transport_build_rate,
            "new_apartments_per_year": scenario.new_apartments_per_year,
            "auto_growth_rate":        scenario.auto_growth_rate,
            "gas_conversion_target":   scenario.gas_conversion_target,
            "brt_coverage_target":     scenario.brt_coverage_target,
            "green_growth_rate":       scenario.green_growth_rate,
            "income_growth_per_year":  scenario.income_growth_per_year,
        },
        "final_year": population[-1]["year"],
        "final_population": population[-1]["population"],
        "population_delta": population[-1]["population"] - population[0]["population"],
        "population_series": population,
        "infrastructure_series": infrastructure,
        "eco_series": eco,
        "business_series": business,
        "critical_points": critical,
        "overall_future_score": overall,
        "overall_grade": grade,
        "comparison_to_today": {
            "infra_delta": round(last_infra - infrastructure[0]["infra_score"], 1),
            "eco_delta": round(last_eco - eco[0]["eco_score"], 1),
            "population_growth_percent": round(
                (population[-1]["population"] / population[0]["population"] - 1) * 100, 1,
            ),
        },
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
