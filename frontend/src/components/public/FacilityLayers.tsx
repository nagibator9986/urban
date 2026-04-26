import { useEffect, useMemo, useState } from "react";
import { CircleMarker, Popup, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { getFacilitiesGeoJSON } from "../../services/api";
import type { FacilityType, GeoJSONFeature } from "../../types";
import { FACILITY_COLORS, FACILITY_LABELS } from "../../types";

const ZOOM_MIN: Partial<Record<FacilityType, number>> = { bus_stop: 14 };

interface Props {
  activeLayers: Set<FacilityType>;
  onTotalsChange?: (totals: Partial<Record<FacilityType, number>>) => void;
}

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) });
  return null;
}

function radius(type: FacilityType, z: number) {
  const base: Record<FacilityType, number> = {
    school: 7, hospital: 8, clinic: 6, kindergarten: 6, pharmacy: 5,
    park: 8, police: 7, fire_station: 7, bus_stop: 4,
  };
  const r = base[type] ?? 6;
  if (z >= 16) return r + 2;
  if (z >= 14) return r;
  return Math.max(r - 2, 3);
}

function clusterIcon(cluster: any) {
  const c = cluster.getChildCount();
  const size = c < 20 ? 32 : c < 100 ? 42 : 52;
  return L.divIcon({ html: `<span>${c}</span>`, className: "marker-cluster", iconSize: L.point(size, size) });
}

export default function FacilityLayers({ activeLayers, onTotalsChange }: Props) {
  const [map, setMap] = useState<Map<FacilityType, GeoJSONFeature[]>>(new Map());
  const [zoom, setZoom] = useState(12);

  const key = useMemo(() => [...activeLayers].sort().join(","), [activeLayers]);

  useEffect(() => {
    const types = key.split(",").filter(Boolean) as FacilityType[];
    if (!types.length) { setMap(new Map()); onTotalsChange?.({}); return; }
    let cancelled = false;
    Promise.all(types.map(async (t) => {
      try {
        const g = await getFacilitiesGeoJSON({ facility_type: t });
        return [t, g.features] as [FacilityType, GeoJSONFeature[]];
      } catch {
        return [t, [] as GeoJSONFeature[]] as [FacilityType, GeoJSONFeature[]];
      }
    })).then((rs) => {
      if (cancelled) return;
      const m = new Map<FacilityType, GeoJSONFeature[]>(rs);
      setMap(m);
      const totals: Partial<Record<FacilityType, number>> = {};
      for (const [t, f] of rs) totals[t] = f.length;
      onTotalsChange?.(totals);
    });
    return () => { cancelled = true; };
  }, [key, onTotalsChange]);

  const features = useMemo(() => {
    const out: GeoJSONFeature[] = [];
    for (const [t, f] of map) {
      if (zoom < (ZOOM_MIN[t] ?? 0)) continue;
      out.push(...f);
    }
    return out;
  }, [map, zoom]);

  return (
    <>
      <ZoomTracker onZoom={setZoom} />
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={40}
        spiderfyOnMaxZoom
        showCoverageOnHover={false}
        iconCreateFunction={clusterIcon}
        disableClusteringAtZoom={16}
      >
        {features.map((f) => (
          <CircleMarker
            key={`${f.properties.type}-${f.properties.id}`}
            center={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
            radius={radius(f.properties.type, zoom)}
            pathOptions={{
              color: "#ffffff", weight: 2,
              fillColor: FACILITY_COLORS[f.properties.type], fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div className="facility-popup">
                <div className="name">{f.properties.name || "Без названия"}</div>
                <div className="type">{FACILITY_LABELS[f.properties.type]}</div>
                {f.properties.address && <div className="address">{f.properties.address}</div>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MarkerClusterGroup>
    </>
  );
}
