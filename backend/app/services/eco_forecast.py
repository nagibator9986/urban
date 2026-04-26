"""AQI-прогноз на 72 часа.

Без внешних моделей — воспроизводимая детерминированная модель, которая
опирается на реальные закономерности Алматы:
  • Базовый AQI района (DISTRICT_BASELINE_AQI)
  • Сезонный коэффициент (зима ×1.4, межсезон ×1.2, лето ×0.85)
  • Часовой паттерн (утренний/вечерний пик трафика, ночной штиль+инверсия)
  • Недельный паттерн (будни > выходные из-за трафика)
  • Температурная инверсия (ночь + зима → +20-40%)
  • Случайный шум, зашитый в seed от даты (стабильно при перезапросе)

Результат: массив точек (ts, aqi, category, main_driver) на 72 часа вперёд
плюс агрегированные суточные сводки с «когда лучше гулять».

Как заменить на настоящий ML: меняется только функция _predict_hour(...)
— остальное API остаётся стабильным.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.services.eco_analytics import (
    DISTRICT_BASELINE_AQI, TRAFFIC_INDEX, categorize_aqi,
)


# --- Факторы ---

def _season_factor(month: int) -> float:
    if month in (12, 1, 2): return 1.40
    if month in (11, 3):    return 1.20
    if month in (6, 7, 8):  return 0.85
    return 1.00


def _hour_factor(hour: int) -> float:
    """Почасовой паттерн Алматы (на основе airkaz.org 2023-2024):
    пик утром 7-10 (трафик), дневной провал 12-15, вечерний пик 18-22,
    ночная инверсия 00-05 задерживает выбросы."""
    return {
        0: 1.15, 1: 1.18, 2: 1.22, 3: 1.25, 4: 1.22, 5: 1.15,
        6: 1.05, 7: 1.20, 8: 1.30, 9: 1.25, 10: 1.10, 11: 0.95,
        12: 0.85, 13: 0.80, 14: 0.82, 15: 0.88, 16: 0.98, 17: 1.10,
        18: 1.28, 19: 1.32, 20: 1.25, 21: 1.15, 22: 1.10, 23: 1.12,
    }[hour]


def _weekday_factor(wd: int) -> float:
    """0=пн..6=вс. Выходные чуть чище."""
    return {0: 1.05, 1: 1.06, 2: 1.06, 3: 1.07, 4: 1.08, 5: 0.90, 6: 0.85}[wd]


def _inversion_bonus(hour: int, month: int) -> float:
    """Температурная инверсия: ночью зимой. Даёт +20-40% к AQI."""
    if month in (11, 12, 1, 2) and hour in (0, 1, 2, 3, 4, 5, 22, 23):
        return 1.30
    if month in (3, 10) and hour in (2, 3, 4, 5):
        return 1.15
    return 1.00


def _traffic_factor(district: str) -> float:
    t = TRAFFIC_INDEX.get(district, 380)
    return 1.0 + (t - 380) / 1500  # ≈ ±8%


def _deterministic_noise(district: str, ts: datetime) -> float:
    """Стабильный шум по (район, час) — при перезапросе не «прыгает»."""
    key = f"{district}-{ts.strftime('%Y-%m-%d-%H')}"
    h = int(hashlib.md5(key.encode()).hexdigest()[:8], 16)
    return ((h % 21) - 10) * 0.8  # ±8 AQI


def _predict_hour(district: str, ts: datetime) -> dict:
    base = DISTRICT_BASELINE_AQI.get(district, 140)
    season = _season_factor(ts.month)
    hour = _hour_factor(ts.hour)
    wd = _weekday_factor(ts.weekday())
    inv = _inversion_bonus(ts.hour, ts.month)
    traffic = _traffic_factor(district)
    noise = _deterministic_noise(district, ts)

    aqi_raw = base * season * hour * wd * inv * traffic + noise
    aqi = max(15, int(aqi_raw))

    # Определяем главный драйвер
    factors = {
        "season": abs(season - 1),
        "traffic": abs(hour - 1) + abs(traffic - 1),
        "inversion": abs(inv - 1),
        "weekend": abs(wd - 1),
    }
    driver_key = max(factors, key=factors.get)
    driver_labels = {
        "season": "сезонный (зима/смог)",
        "traffic": "транспортные выбросы",
        "inversion": "температурная инверсия",
        "weekend": "недельный паттерн",
    }

    cat = categorize_aqi(aqi)
    return {
        "ts": ts.isoformat(),
        "aqi": aqi,
        "level": cat.level,
        "label": cat.label_ru,
        "color": cat.color,
        "main_driver": driver_labels.get(driver_key, "—"),
    }


@dataclass
class Window:
    start: str
    end: str
    avg_aqi: int
    label: str
    kind: Literal["best", "worst"]


def _find_windows(points: list[dict], kind: str) -> list[dict]:
    """Скользящее окно 3 часа. Возвращает top-2 best и top-2 worst по суткам."""
    results: dict[str, list[Window]] = {}
    for day_offset in range(3):
        day_start = day_offset * 24
        day_end = day_start + 24
        if day_end > len(points):
            break
        day_points = points[day_start:day_end]
        windows = []
        for i in range(len(day_points) - 2):
            slc = day_points[i : i + 3]
            avg = sum(p["aqi"] for p in slc) / 3
            windows.append({
                "start": slc[0]["ts"], "end": slc[-1]["ts"], "avg": avg,
                "cat": categorize_aqi(int(avg)).label_ru,
            })
        windows.sort(key=lambda w: w["avg"])
        day_key = day_points[0]["ts"][:10]
        results[day_key] = windows

    out = []
    for day, windows in results.items():
        if kind == "best":
            best = windows[0] if windows else None
            if best:
                out.append({
                    "date": day,
                    "start": best["start"], "end": best["end"],
                    "avg_aqi": round(best["avg"]),
                    "label": best["cat"],
                    "kind": "best",
                })
        else:
            worst = windows[-1] if windows else None
            if worst:
                out.append({
                    "date": day,
                    "start": worst["start"], "end": worst["end"],
                    "avg_aqi": round(worst["avg"]),
                    "label": worst["cat"],
                    "kind": "worst",
                })
    return out


def forecast_district(district: str, hours: int = 72) -> dict:
    """Прогноз AQI на N часов вперёд для района."""
    if district not in DISTRICT_BASELINE_AQI:
        return {"error": "unknown_district"}

    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    points = []
    for h in range(hours + 1):
        ts = now + timedelta(hours=h)
        points.append(_predict_hour(district, ts))

    # Суточные сводки
    daily = []
    for day in range(3):
        start = day * 24
        end = start + 24
        if end > len(points):
            break
        slc = points[start:end]
        avg = sum(p["aqi"] for p in slc) / len(slc)
        peak = max(slc, key=lambda p: p["aqi"])
        low = min(slc, key=lambda p: p["aqi"])
        cat = categorize_aqi(int(avg))
        daily.append({
            "date": slc[0]["ts"][:10],
            "avg_aqi": round(avg),
            "peak_aqi": peak["aqi"],
            "peak_at": peak["ts"],
            "low_aqi": low["aqi"],
            "low_at": low["ts"],
            "category": cat.label_ru,
            "color": cat.color,
        })

    best = _find_windows(points, "best")
    worst = _find_windows(points, "worst")

    # Алерт-статус
    alert = None
    if daily:
        max_peak = max(d["peak_aqi"] for d in daily)
        if max_peak >= 200:
            alert = {
                "level": "high",
                "title": "⚠️ Опасный уровень воздуха в ближайшие 3 дня",
                "message": f"Ожидается пик AQI {max_peak}. Закройте окна, ограничьте прогулки, особенно детям и пожилым.",
            }
        elif max_peak >= 150:
            alert = {
                "level": "medium",
                "title": "Внимание: вредный уровень для чувствительных групп",
                "message": f"Пик AQI {max_peak}. Астматикам, детям и пожилым — меньше активности на улице.",
            }

    return {
        "district": district,
        "generated_at": now.replace(tzinfo=timezone.utc).isoformat(),
        "hours": hours,
        "points": points,
        "daily": daily,
        "best_windows": best,
        "worst_windows": worst,
        "alert": alert,
    }


def forecast_city(hours: int = 72) -> dict:
    """Прогноз усреднённый по городу + рейтинг районов."""
    districts = []
    for name in DISTRICT_BASELINE_AQI:
        f = forecast_district(name, hours)
        districts.append({
            "district": name,
            "daily": f["daily"],
            "alert": f["alert"],
        })

    # Городской средний за каждый день
    city_daily = []
    for day in range(3):
        day_avg = [d["daily"][day]["avg_aqi"] for d in districts if len(d["daily"]) > day]
        if not day_avg:
            continue
        avg = sum(day_avg) / len(day_avg)
        cat = categorize_aqi(int(avg))
        city_daily.append({
            "date": districts[0]["daily"][day]["date"],
            "avg_aqi": round(avg),
            "category": cat.label_ru,
            "color": cat.color,
        })

    return {
        "generated_at": datetime.utcnow().replace(tzinfo=timezone.utc).isoformat(),
        "city_daily": city_daily,
        "districts": districts,
    }
