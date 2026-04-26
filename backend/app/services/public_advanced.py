"""Расширенная аналитика общественного режима:
  1) 15-minute city index — % жителей с 15-мин доступом к ключевым сервисам
  2) District comparison — бок о бок 2-3 района по 20+ метрикам
  3) Developer pre-check — оценка нагрузки нового ЖК на инфраструктуру
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy.orm import Session

from app.models.district import District
from app.models.facility import Facility, FacilityType
from app.models.population import PopulationStat
from app.services.norms import NORMS
from app.services.statistics import _compute_facility_stat, _overall_score, STAT_TYPES


# ---------- 15-minute city ----------

# Пешком ~5 км/ч → за 15 мин ~1.25 км = ~0.0113° широты
WALK_RADIUS_15_MIN_KM = 1.25

# Сервисы, которые должны быть в 15-мин доступе (базовая корзина по Морено).
# Дети: школа, сад, парк. Здоровье: поликлиника, аптека. Транспорт: остановка.
FIFTEEN_MIN_SERVICES: list[FacilityType] = [
    FacilityType.SCHOOL,
    FacilityType.KINDERGARTEN,
    FacilityType.CLINIC,
    FacilityType.PHARMACY,
    FacilityType.PARK,
    FacilityType.BUS_STOP,
]

# Центры районов (из eco_analytics) — используются как приближённый «центроид»
# Когда нет real population density, приближение достаточное для оценки
DISTRICT_CENTERS: dict[str, tuple[float, float]] = {
    "Алмалинский район":    (43.255, 76.925),
    "Ауэзовский район":    (43.233, 76.855),
    "Бостандыкский район":  (43.225, 76.945),
    "Жетысуский район":    (43.295, 76.965),
    "Медеуский район":     (43.245, 76.990),
    "Наурызбайский район":  (43.215, 76.780),
    "Турксибский район":    (43.320, 76.925),
    "Алатауский район":    (43.180, 76.865),
}


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def _grid_coverage(
    db: Session, district_id: int, district_name: str,
) -> dict:
    """Строим сетку точек в районе и считаем, сколько из них имеют
    все 6 ключевых сервисов в пешей досягаемости (1.25 км).

    Использует bounding box района (приближение) 0.04° × 0.04° вокруг центра,
    сетка 12×12 = 144 точки. Веса — равномерные.
    """
    if district_name not in DISTRICT_CENTERS:
        return {"score_15min": 0, "covered_percent": 0, "by_service": {}}

    lat0, lon0 = DISTRICT_CENTERS[district_name]
    # Квадрат ~4.5×4.5 км
    side = 0.02
    steps = 12

    # Собираем все объекты каждого типа
    by_type: dict[FacilityType, list[tuple[float, float]]] = {}
    for ft in FIFTEEN_MIN_SERVICES:
        rows = db.query(Facility.lat, Facility.lon).filter(
            Facility.facility_type == ft
        ).all()
        by_type[ft] = [(r[0], r[1]) for r in rows]

    total_points = 0
    covered_all = 0
    by_service_hits: dict[str, int] = {ft.value: 0 for ft in FIFTEEN_MIN_SERVICES}

    for i in range(steps):
        for j in range(steps):
            lat = lat0 - side/2 + (i / (steps-1)) * side
            lon = lon0 - side/2 + (j / (steps-1)) * side
            total_points += 1
            all_ok = True
            for ft in FIFTEEN_MIN_SERVICES:
                pts = by_type[ft]
                has = any(
                    _haversine_km(lat, lon, p[0], p[1]) <= WALK_RADIUS_15_MIN_KM
                    for p in pts
                )
                if has:
                    by_service_hits[ft.value] += 1
                else:
                    all_ok = False
            if all_ok:
                covered_all += 1

    by_service_pct = {
        k: round(v / total_points * 100, 1) for k, v in by_service_hits.items()
    }
    covered_pct = round(covered_all / total_points * 100, 1)

    # Итоговый 15-min score: среднее покрытие по сервисам, но весомее "все 6"
    service_avg = sum(by_service_pct.values()) / len(by_service_pct)
    score = round(0.4 * covered_pct + 0.6 * service_avg, 1)

    return {
        "score_15min": score,
        "covered_all_services_percent": covered_pct,
        "by_service": by_service_pct,
        "grid_size": steps * steps,
        "walk_radius_km": WALK_RADIUS_15_MIN_KM,
    }


def fifteen_min_city(db: Session) -> dict:
    """Индекс 15-мин города по всем 8 районам."""
    districts = db.query(District).all()
    out = []
    for d in districts:
        cov = _grid_coverage(db, d.id, d.name_ru)
        out.append({
            "district_id": d.id,
            "district_name": d.name_ru,
            **cov,
        })

    out.sort(key=lambda x: x["score_15min"], reverse=True)
    city_avg = round(sum(x["score_15min"] for x in out) / len(out), 1) if out else 0

    # Классификация
    def grade(s):
        if s >= 85: return "A"
        if s >= 70: return "B"
        if s >= 55: return "C"
        if s >= 40: return "D"
        return "E"

    for x in out:
        x["grade"] = grade(x["score_15min"])

    return {
        "city_avg_score": city_avg,
        "districts": out,
        "methodology": (
            "Концепция 15-мин города (Carlos Moreno, 2016). Сетка 12×12 точек "
            "(≈144 точки на район), для каждой проверяется наличие 6 сервисов "
            "(школа, детсад, поликлиника, аптека, парк, остановка) "
            "в радиусе 1.25 км (≈15 минут пешком). "
            "Score = 40% доля точек где ДОСТУПНЫ ВСЕ 6 + 60% среднее покрытие по сервисам."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# ---------- District comparison ----------

def compare_districts(db: Session, ids: list[int]) -> dict:
    """Расширенная таблица сравнения 2-3 районов бок о бок."""
    from app.services.statistics import get_city_statistics
    from app.services.eco_analytics import (
        DISTRICT_BASELINE_AQI, GREEN_INDEX, TRAFFIC_INDEX,
    )

    stats = get_city_statistics(db)

    result = []
    fifteen = {x["district_id"]: x for x in fifteen_min_city(db)["districts"]}

    for did in ids:
        dd = next((d for d in stats.districts if d.district_id == did), None)
        if not dd:
            continue
        district = db.query(District).filter_by(id=did).first()
        name = district.name_ru if district else "?"

        # Эко-данные
        aqi_baseline = DISTRICT_BASELINE_AQI.get(name)
        green = GREEN_INDEX.get(name)
        traffic = TRAFFIC_INDEX.get(name)

        facilities_by_type = {
            f.facility_type: {
                "count": f.actual_count,
                "norm": f.norm_count,
                "coverage_percent": f.coverage_percent,
                "per_10k": f.actual_per_10k,
            }
            for f in dd.facilities if f.norm_per_10k > 0
        }

        fm = fifteen.get(did, {})

        result.append({
            "district_id": did,
            "district_name": name,
            "population": dd.population,
            "area_km2": district.area_km2 if district else None,
            "density_per_km2": (dd.population / district.area_km2) if district and district.area_km2 else None,
            "score_infrastructure": dd.overall_score,
            "score_15min": fm.get("score_15min", 0),
            "aqi_baseline": aqi_baseline,
            "green_m2_per_capita": green,
            "traffic_per_1000": traffic,
            "facilities_by_type": facilities_by_type,
            "fifteen_min_by_service": fm.get("by_service", {}),
        })

    # Определяем «лидера» по каждой метрике
    if result:
        leaders: dict[str, dict] = {}
        for key in ["score_infrastructure", "score_15min", "green_m2_per_capita"]:
            vals = [(r["district_id"], r.get(key) or 0) for r in result]
            winner = max(vals, key=lambda x: x[1])
            leaders[key] = {"district_id": winner[0], "value": winner[1]}
        # AQI и трафик — меньше лучше
        for key in ["aqi_baseline", "traffic_per_1000"]:
            vals = [(r["district_id"], r.get(key) or 9999) for r in result]
            winner = min(vals, key=lambda x: x[1])
            leaders[key] = {"district_id": winner[0], "value": winner[1]}
    else:
        leaders = {}

    return {
        "districts": result,
        "leaders": leaders,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# ---------- Developer pre-check ----------

# Среднее число жителей на квартиру в Алматы (данные Komek, 2024)
AVG_RESIDENTS_PER_APARTMENT = 3.2
# Средний размер семьи с детьми 0-6 (садик)
SHARE_KIDS_0_6 = 0.11
# Средний размер семьи с детьми 6-18 (школа)
SHARE_KIDS_6_18 = 0.17
# % людей с хроническими заболеваниями (требующими регулярной поликлиники)
SHARE_CHRONIC = 0.28


def developer_pre_check(
    db: Session,
    district_name: str,
    apartments: int,
    class_type: Literal["economy", "comfort", "business", "premium"] = "comfort",
    has_own_school: bool = False,
    has_own_kindergarten: bool = False,
    has_own_clinic: bool = False,
) -> dict:
    """Оценка нагрузки нового ЖК на соц. инфраструктуру района.

    Для застройщика и банка: сколько дополнительных школ, садов, поликлиник
    потребуется; как просядет покрытие нормативов; каковы compensation-меры.
    """
    district = db.query(District).filter(District.name_ru == district_name).first()
    if not district:
        return {"error": "district_not_found"}

    # Текущее население района
    ps = (db.query(PopulationStat).filter_by(district_id=district.id)
          .order_by(PopulationStat.year.desc()).first())
    current_pop = ps.population if ps else 0

    # Класс недвижимости → коэффициент жителей на квартиру
    class_factor = {
        "economy": 1.15, "comfort": 1.00, "business": 0.85, "premium": 0.70,
    }[class_type]
    new_residents = int(apartments * AVG_RESIDENTS_PER_APARTMENT * class_factor)
    new_kids_0_6 = int(new_residents * SHARE_KIDS_0_6)
    new_kids_6_18 = int(new_residents * SHARE_KIDS_6_18)
    new_chronic = int(new_residents * SHARE_CHRONIC)

    # Сколько нужно ДОПОЛНИТЕЛЬНЫХ объектов по нормативам
    requirements = []
    for ft, extra_pop in [
        ("school",       new_residents),
        ("kindergarten", new_residents),
        ("clinic",       new_residents),
        ("pharmacy",     new_residents),
        ("park",         new_residents),
        ("bus_stop",     new_residents),
    ]:
        norm = NORMS.get(ft)
        if not norm:
            continue
        need_extra = norm.per_10k_norm * extra_pop / 10_000
        capacity_extra = 0
        if ft == "school":
            capacity_extra = new_kids_6_18
        elif ft == "kindergarten":
            capacity_extra = new_kids_0_6
        elif ft == "clinic":
            capacity_extra = new_chronic * 4  # 4 визита/год
        requirements.append({
            "facility_type": ft,
            "label": norm.label_ru,
            "extra_facilities_needed": round(need_extra, 2),
            "extra_facilities_rounded": math.ceil(need_extra),
            "extra_capacity_needed": capacity_extra,
            "capacity_unit": norm.capacity_unit,
            "norm_per_10k": norm.per_10k_norm,
            "avg_capacity": norm.avg_capacity,
        })

    # Пересчитываем оценку района с новым населением
    from app.services.simulator import _district_counts
    from app.services.statistics import _load_latest_populations
    all_districts = db.query(District).all()
    all_pops = _load_latest_populations(db, [x.id for x in all_districts])
    total_all = sum(all_pops.values()) or 1
    pop_share_here = current_pop / total_all
    before_counts = _district_counts(db, district.id, pop_share_here)
    new_pop = current_pop + new_residents

    before_stats = [
        _compute_facility_stat(ft, before_counts.get(ft.value, 0), current_pop)
        for ft in STAT_TYPES
    ]
    after_stats = [
        _compute_facility_stat(ft, before_counts.get(ft.value, 0), new_pop)
        for ft in STAT_TYPES
    ]
    score_before = _overall_score(before_stats)
    score_after = _overall_score(after_stats)

    # С учётом компенсационных мер застройщика
    mitigations = []
    mitigated_counts = dict(before_counts)
    if has_own_school:
        mitigated_counts["school"] = mitigated_counts.get("school", 0) + 1
        mitigations.append({"type": "school", "count": 1})
    if has_own_kindergarten:
        mitigated_counts["kindergarten"] = mitigated_counts.get("kindergarten", 0) + 1
        mitigations.append({"type": "kindergarten", "count": 1})
    if has_own_clinic:
        mitigated_counts["clinic"] = mitigated_counts.get("clinic", 0) + 1
        mitigations.append({"type": "clinic", "count": 1})

    mitigated_stats = [
        _compute_facility_stat(ft, mitigated_counts.get(ft.value, 0), new_pop)
        for ft in STAT_TYPES
    ]
    score_mitigated = _overall_score(mitigated_stats)

    # Средняя стоимость соц. объекта в USD 2026 (справочно)
    typical_costs = {
        "school":        "$4-7 млн",
        "kindergarten":  "$1-2 млн",
        "clinic":        "$2-4 млн",
        "pharmacy":      "$100-300 тыс",
        "park":          "$200-800 тыс (благоустройство)",
        "bus_stop":      "$5-20 тыс",
    }

    # Определить risk level для банка
    drop = score_before - score_mitigated
    if drop > 8:
        risk = "high"
        risk_label = "Высокий: проект усугубит дефицит, вероятны жалобы жителей и задержки сдачи"
    elif drop > 4:
        risk = "medium"
        risk_label = "Средний: инфраструктура района просядет, требуется compliance-пакет"
    else:
        risk = "low"
        risk_label = "Низкий: нагрузка в рамках нормативов, компенсации достаточны"

    return {
        "district": district_name,
        "current_population": current_pop,
        "new_residents": new_residents,
        "new_population": new_pop,
        "apartments": apartments,
        "class_type": class_type,
        "demographics": {
            "kids_0_6": new_kids_0_6,
            "kids_6_18": new_kids_6_18,
            "chronic_patients": new_chronic,
        },
        "requirements": [
            {**r, "typical_cost_usd": typical_costs.get(r["facility_type"], "—")}
            for r in requirements
        ],
        "score_impact": {
            "before": score_before,
            "after_no_mitigation": score_after,
            "after_with_mitigation": score_mitigated,
            "delta_no_mitigation": round(score_after - score_before, 1),
            "delta_with_mitigation": round(score_mitigated - score_before, 1),
        },
        "mitigations": mitigations,
        "risk": {
            "level": risk,
            "label": risk_label,
        },
        "recommendations": _developer_recommendations(
            district_name, requirements, risk, has_own_school,
            has_own_kindergarten, has_own_clinic,
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def _developer_recommendations(
    district, requirements, risk,
    has_school, has_kg, has_clinic,
) -> list[str]:
    recs = []
    # Топ-3 самых острых нужды
    top_need = sorted(requirements, key=lambda x: -x["extra_facilities_needed"])[:3]
    if top_need and top_need[0]["extra_facilities_rounded"] > 0:
        need = top_need[0]
        recs.append(
            f"В первую очередь в {district} не хватит «{need['label'].lower()}» "
            f"(+{need['extra_facilities_rounded']} объект{'а' if need['extra_facilities_rounded'] < 5 else 'ов'} "
            f"при текущей плотности). Заложите compensation в проект."
        )

    if not has_school and any(r["facility_type"] == "school" and r["extra_facilities_needed"] > 0.5 for r in requirements):
        recs.append("🏫 Рассмотрите встроенную школу или соглашение с акиматом о финансировании новой школы рядом.")
    if not has_kg and any(r["facility_type"] == "kindergarten" and r["extra_facilities_needed"] > 0.3 for r in requirements):
        recs.append("🧸 Встроенный детский сад — фактически must-have для комфорт-класса.")
    if not has_clinic and any(r["facility_type"] == "clinic" and r["extra_facilities_needed"] > 0.2 for r in requirements):
        recs.append("🩺 Договор с частной клиникой о размещении филиала в ЖК — усилит маркетинг.")

    if risk == "high":
        recs.append("⚠️ Для банка-кредитора и акимата: подготовьте compliance-отчёт с графиком ввода соц. объектов.")
    elif risk == "medium":
        recs.append("ℹ️ Отразите в проектной декларации конкретные меры компенсации нагрузки.")

    recs.append("💡 Используйте AQYL CITY симулятор для моделирования «ЖК + школа + сад» — покажите банку, что оценка района не упадёт.")

    return recs
