"""Прогноз температурных инверсий на 72 часа.

Фетчит метеоданные с Open-Meteo (бесплатный, без ключа) и рассчитывает
вероятность температурной инверсии — когда холодный воздух у земли оказывается
под слоем более тёплого воздуха, препятствуя рассеиванию смога.

Источник: https://open-meteo.com/en/docs (ERA5 + GFS reanalysis)

Модель инверсии:
----------------
ΔT = T_850hPa − T_2m
T_850hPa — температура на высоте ~1500 м
T_2m — температура на 2 м над поверхностью

ΔT > 0°C  → инверсия (smog trap)
ΔT > 3°C  → сильная инверсия (критическая)

Дополнительно учитываем:
· wind_speed_10m < 2 м/с — нет вентиляции
· boundary_layer_height < 300 м — низкий PBL усугубляет

Итоговый inversion_score 0-100, где 0 = нет риска, 100 = сильная застойная инверсия.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

ALMATY_LAT = 43.238
ALMATY_LON = 76.946

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Key meteorological variables Open-Meteo provides
_HOURLY_VARS = [
    "temperature_2m",
    "temperature_850hPa",
    "wind_speed_10m",
    "wind_direction_10m",
    "boundary_layer_height",
    "surface_pressure",
    "relative_humidity_2m",
]


def _compute_inversion_score(
    t2m: float, t850: float, wind: float, pbl: float,
) -> tuple[int, str]:
    """Возвращает (score 0..100, severity label)."""
    delta = t850 - t2m  # positive → inversion

    # Base score from inversion strength
    if delta <= -2:
        base = 0
    elif delta <= 0:
        base = int((delta + 2) * 15)          # 0..30
    elif delta <= 3:
        base = 30 + int(delta * 15)           # 30..75
    else:
        base = min(100, 75 + int((delta - 3) * 8))

    # Wind factor: low wind → trapping
    if wind < 1.5:
        base += 12
    elif wind < 3.0:
        base += 6

    # PBL height: low boundary layer → smog trap
    if pbl and pbl < 200:
        base += 10
    elif pbl and pbl < 400:
        base += 5

    score = max(0, min(100, base))
    if score >= 70:
        label = "critical"
    elif score >= 45:
        label = "high"
    elif score >= 25:
        label = "moderate"
    else:
        label = "low"
    return score, label


def _label_ru(severity: str) -> str:
    return {
        "critical": "Критическая инверсия",
        "high":     "Сильная инверсия",
        "moderate": "Слабая инверсия",
        "low":      "Нет инверсии",
    }[severity]


def fetch_inversion_forecast(hours: int = 72) -> dict[str, Any]:
    """Запрос к Open-Meteo + расчёт инверсий по часам."""
    hours = max(24, min(hours, 168))
    params = {
        "latitude": ALMATY_LAT,
        "longitude": ALMATY_LON,
        "hourly": ",".join(_HOURLY_VARS),
        "forecast_hours": hours,
        "timezone": "Asia/Almaty",
    }

    try:
        r = httpx.get(OPEN_METEO_URL, params=params, timeout=15.0)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        logger.warning("Open-Meteo fetch failed: %s", exc)
        return {
            "error": "weather_api_unavailable",
            "detail": str(exc),
        }

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    t2m = hourly.get("temperature_2m", [])
    t850 = hourly.get("temperature_850hPa", [])
    wind = hourly.get("wind_speed_10m", [])
    pbl = hourly.get("boundary_layer_height", [])
    rh = hourly.get("relative_humidity_2m", [])
    pressure = hourly.get("surface_pressure", [])

    points: list[dict] = []
    daily_buckets: dict[str, list[int]] = {}

    for i, ts in enumerate(times):
        try:
            _t2 = float(t2m[i])
            _t850 = float(t850[i]) if t850 and t850[i] is not None else _t2 - 6.5
            _w = float(wind[i]) if wind and wind[i] is not None else 2.0
            _pbl = float(pbl[i]) if pbl and pbl[i] is not None else 800.0
        except (IndexError, TypeError, ValueError):
            continue

        score, severity = _compute_inversion_score(_t2, _t850, _w, _pbl)
        points.append({
            "ts": ts,
            "t2m": round(_t2, 1),
            "t850hPa": round(_t850, 1),
            "delta_t": round(_t850 - _t2, 2),
            "wind_speed_mps": round(_w, 1),
            "pbl_height_m": round(_pbl, 0) if _pbl else None,
            "humidity_percent": round(float(rh[i]), 0) if rh and i < len(rh) and rh[i] is not None else None,
            "surface_pressure_hpa": round(float(pressure[i]), 0) if pressure and i < len(pressure) and pressure[i] is not None else None,
            "inversion_score": score,
            "severity": severity,
            "severity_label": _label_ru(severity),
        })
        day = ts[:10]
        daily_buckets.setdefault(day, []).append(score)

    # Aggregate per-day averages
    daily = [
        {
            "date": day,
            "avg_inversion_score": round(sum(scores) / len(scores), 1),
            "max_inversion_score": max(scores),
            "hours_with_inversion": sum(1 for s in scores if s >= 45),
        }
        for day, scores in sorted(daily_buckets.items())
    ]

    # Worst 3h windows (3-hour rolling average)
    worst_windows: list[dict] = []
    if len(points) >= 3:
        rolling = [
            (i, sum(p["inversion_score"] for p in points[i:i+3]) / 3)
            for i in range(len(points) - 2)
        ]
        rolling.sort(key=lambda x: -x[1])
        seen_starts: set[str] = set()
        for i, avg in rolling[:10]:
            day_key = points[i]["ts"][:10]
            if day_key in seen_starts:
                continue
            seen_starts.add(day_key)
            worst_windows.append({
                "start": points[i]["ts"],
                "end": points[i + 2]["ts"],
                "avg_score": round(avg, 1),
                "severity": _label_ru(
                    "critical" if avg >= 70 else
                    "high" if avg >= 45 else
                    "moderate" if avg >= 25 else
                    "low",
                ),
            })
            if len(worst_windows) >= 3:
                break

    # Overall forecast summary
    total_inversion_hours = sum(1 for p in points if p["inversion_score"] >= 45)
    total_critical_hours = sum(1 for p in points if p["inversion_score"] >= 70)
    any_critical = total_critical_hours > 0

    return {
        "city": "Алматы",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source": "Open-Meteo (GFS + ERA5)",
        "hours_requested": hours,
        "points": points,
        "daily": daily,
        "worst_windows": worst_windows,
        "summary": {
            "total_inversion_hours": total_inversion_hours,
            "total_critical_hours": total_critical_hours,
            "any_critical": any_critical,
            "alert_message": _build_alert(any_critical, total_inversion_hours, total_critical_hours),
        },
        "methodology": (
            "Инверсия рассчитывается как ΔT = T_850hPa − T_2m. "
            "При ΔT > 0 тёплый воздух лежит сверху, холодный внизу — "
            "смог не рассеивается. Скорость ветра < 2 м/с и высота "
            "пограничного слоя < 300 м усугубляют ситуацию. "
            "Данные: Open-Meteo (GFS/ERA5 reanalysis)."
        ),
    }


def _build_alert(any_critical: bool, total: int, critical: int) -> str:
    if any_critical:
        return (
            f"⚠️ В ближайшие 72 часа — {critical} ч критической инверсии. "
            "Ожидается задержка смога в городе, особенно ночью и утром."
        )
    if total >= 12:
        return f"ℹ️ {total} ч слабой/умеренной инверсии — смог может скапливаться по ночам."
    return "✅ Вентиляция атмосферы в норме — смог будет рассеиваться."
