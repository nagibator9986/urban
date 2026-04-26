"""Карта источников загрязнения Алматы.

Собирает из OpenStreetMap (Overpass API):
- ТЭЦ / ТЭЦ-ветка (man_made=works + power=plant)
- Промышленные зоны (landuse=industrial)
- Основные магистрали (highway=trunk|primary)
- Зоны частного сектора (landuse=residential + building=house/detached)
- АЗС (amenity=fuel)

Результат — GeoJSON FeatureCollection с типом источника и оценкой
интенсивности (relative), чтобы frontend мог построить слой.

Данные кэшируются 6 часов в process memory — OSM не любит частые запросы
к большим regions.
"""

from __future__ import annotations

import logging
import math
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 45.0
CACHE_TTL_SECONDS = 6 * 3600  # 6h

_cache: dict[str, Any] = {"at": 0.0, "payload": None}


# Each category maps to an Overpass query fragment and display metadata.
SOURCE_QUERIES: list[dict[str, Any]] = [
    {
        "key": "power_plant",
        "label": "ТЭЦ / электростанции",
        "color": "#64748B",
        "intensity": 95,
        "description": "Уголь/газ/мазут — крупнейший зимний источник PM2.5, SO₂.",
        "overpass": """
            node["power"="plant"](area.a);
            way["power"="plant"](area.a);
            node["man_made"="works"]["product"~"coal|electricity|heat"](area.a);
        """,
    },
    {
        "key": "industrial_zone",
        "label": "Промзоны",
        "color": "#A855F7",
        "intensity": 70,
        "description": "Металлургия, цемент, химические заводы.",
        "overpass": """
            way["landuse"="industrial"](area.a);
            relation["landuse"="industrial"](area.a);
        """,
    },
    {
        "key": "major_road",
        "label": "Магистрали (trunk/primary)",
        "color": "#EF4444",
        "intensity": 80,
        "description": "Основные автомагистрали — NO₂, PM10 от авто.",
        "overpass": """
            way["highway"~"trunk|primary"](area.a);
        """,
    },
    {
        "key": "fuel_station",
        "label": "АЗС",
        "color": "#EAB308",
        "intensity": 40,
        "description": "Точечные источники VOC (бензольные группы).",
        "overpass": """
            node["amenity"="fuel"](area.a);
            way["amenity"="fuel"](area.a);
        """,
    },
    {
        "key": "private_housing",
        "label": "Зоны частного сектора",
        "color": "#F59E0B",
        "intensity": 75,
        "description": "Печное отопление зимой — до 45% загрязнения в периферийных районах.",
        "overpass": """
            way["landuse"="residential"]["residential"="rural"](area.a);
            way["building"="detached"](area.a);
            way["building"="house"](area.a);
        """,
    },
]


def _build_query() -> str:
    """Собирает единый Overpass-запрос по всем категориям с out:center."""
    blocks = "\n".join(f'(\n{q["overpass"].strip()}\n);\nout center tags 1500;'
                       for q in SOURCE_QUERIES)
    return f"""
    [out:json][timeout:{int(OVERPASS_TIMEOUT)}];
    area["name"~"Алматы|Almaty"]->.a;
    {blocks}
    """


def _coord_of(element: dict) -> tuple[float, float] | None:
    if "lat" in element and "lon" in element:
        return element["lat"], element["lon"]
    center = element.get("center")
    if center and "lat" in center:
        return center["lat"], center["lon"]
    return None


def _match_source(tags: dict) -> dict | None:
    """Сопоставляет tags элемента с категорией источника."""
    if tags.get("power") == "plant" or (
        tags.get("man_made") == "works"
        and any(k in (tags.get("product") or "") for k in ("coal", "heat", "electricity"))
    ):
        return SOURCE_QUERIES[0]
    if tags.get("landuse") == "industrial":
        return SOURCE_QUERIES[1]
    if tags.get("highway") in ("trunk", "primary"):
        return SOURCE_QUERIES[2]
    if tags.get("amenity") == "fuel":
        return SOURCE_QUERIES[3]
    if (tags.get("residential") == "rural"
            or tags.get("building") in ("detached", "house")):
        return SOURCE_QUERIES[4]
    return None


def fetch_sources_map() -> dict[str, Any]:
    """Публичная функция. Возвращает GeoJSON с типизированными источниками.

    Кэш 6 часов — чтобы не нагружать Overpass.
    """
    now = time.time()
    if _cache["payload"] is not None and now - _cache["at"] < CACHE_TTL_SECONDS:
        return _cache["payload"]

    query = _build_query()
    try:
        r = httpx.post(
            OVERPASS_URL, data={"data": query}, timeout=OVERPASS_TIMEOUT,
        )
        r.raise_for_status()
        osm = r.json()
    except Exception as exc:
        logger.warning("Overpass sources fetch failed: %s", exc)
        if _cache["payload"]:
            return {**_cache["payload"], "warning": "stale_cache"}
        return {
            "error": "overpass_unavailable",
            "detail": str(exc),
            "categories": [_strip_query(q) for q in SOURCE_QUERIES],
        }

    by_category: dict[str, list[dict]] = {q["key"]: [] for q in SOURCE_QUERIES}

    for el in osm.get("elements", []):
        tags = el.get("tags") or {}
        category = _match_source(tags)
        if not category:
            continue
        coord = _coord_of(el)
        if not coord:
            continue
        by_category[category["key"]].append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [coord[1], coord[0]]},
            "properties": {
                "source_key": category["key"],
                "label": category["label"],
                "color": category["color"],
                "intensity": category["intensity"],
                "name": tags.get("name") or tags.get("operator") or category["label"],
                "osm_id": el.get("id"),
                "osm_type": el.get("type"),
            },
        })

    # Flatten features
    features = [feat for items in by_category.values() for feat in items]

    # Compute rough exposure heatmap per district center: count of nearby
    # high-intensity sources within 2.5 km radius
    from app.services.eco_analytics import DISTRICT_BASELINE_AQI

    district_centers = {
        "Алмалинский район":    (43.255, 76.925),
        "Ауэзовский район":     (43.233, 76.855),
        "Бостандыкский район":  (43.225, 76.945),
        "Жетысуский район":     (43.295, 76.965),
        "Медеуский район":      (43.245, 76.990),
        "Наурызбайский район":  (43.215, 76.780),
        "Турксибский район":    (43.320, 76.925),
        "Алатауский район":     (43.180, 76.865),
    }

    def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        p = math.pi / 180
        a = (0.5 - math.cos((lat2 - lat1) * p) / 2
             + math.cos(lat1 * p) * math.cos(lat2 * p)
             * (1 - math.cos((lon2 - lon1) * p)) / 2)
        return 2 * 6371 * math.asin(math.sqrt(a))

    exposure = []
    for name in DISTRICT_BASELINE_AQI:
        if name not in district_centers:
            continue
        lat, lon = district_centers[name]
        counts: dict[str, int] = {q["key"]: 0 for q in SOURCE_QUERIES}
        for feat in features:
            coords = feat["geometry"]["coordinates"]
            if _km(lat, lon, coords[1], coords[0]) <= 2.5:
                counts[feat["properties"]["source_key"]] += 1
        total_intensity = sum(
            counts[q["key"]] * q["intensity"] for q in SOURCE_QUERIES
        )
        exposure.append({
            "district": name,
            "counts": counts,
            "total_intensity": total_intensity,
        })

    payload = {
        "city": "Алматы",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        "source": "OpenStreetMap via Overpass API",
        "total_features": len(features),
        "by_category_count": {k: len(v) for k, v in by_category.items()},
        "categories": [_strip_query(q) for q in SOURCE_QUERIES],
        "features": features,
        "district_exposure": sorted(exposure, key=lambda x: -x["total_intensity"]),
        "methodology": (
            "Источники собраны из OpenStreetMap (Overpass API). "
            "Intensity — экспертная балльная оценка относительного вклада "
            "категории в загрязнение воздуха (0-100). district_exposure — "
            "суммарная интенсивность источников в радиусе 2.5 км от центра района."
        ),
    }
    _cache["payload"] = payload
    _cache["at"] = now
    return payload


def _strip_query(q: dict) -> dict:
    """Remove overpass-specific fields for API response."""
    return {k: v for k, v in q.items() if k != "overpass"}
