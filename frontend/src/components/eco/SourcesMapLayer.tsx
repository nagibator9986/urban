import { useEffect, useState } from "react";
import { CircleMarker, Popup } from "react-leaflet";
import { getSourcesMap } from "../../services/api";
import type { SourcesMapResponse } from "../../types";

interface Props {
  visibleKeys: Set<string>;
}

export default function SourcesMapLayer({ visibleKeys }: Props) {
  const [data, setData] = useState<SourcesMapResponse | null>(null);

  useEffect(() => {
    let alive = true;
    getSourcesMap().then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data) return null;

  return (
    <>
      {data.features
        .filter((f) => visibleKeys.has(f.properties.source_key))
        .map((f, i) => {
          const [lon, lat] = f.geometry.coordinates;
          const color = f.properties.color;
          const radius = Math.max(4, Math.min(10, f.properties.intensity / 10));
          return (
            <CircleMarker
              key={`${f.properties.osm_id}-${i}`}
              center={[lat, lon]}
              radius={radius}
              pathOptions={{
                color: "#ffffff",
                weight: 1,
                fillColor: color,
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <div className="facility-popup">
                  <div className="name">{f.properties.name}</div>
                  <div className="type">{f.properties.label}</div>
                  <div className="type" style={{ color: "#64748B" }}>
                    Интенсивность: {f.properties.intensity}/100
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
    </>
  );
}

export function SourcesLegend({ data, visibleKeys, onToggle }: {
  data: SourcesMapResponse | null;
  visibleKeys: Set<string>;
  onToggle: (k: string) => void;
}) {
  if (!data) return null;
  return (
    <div className="card">
      <div className="card-title">🏭 Слои источников загрязнения</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        Источник: {data.source}. Включите нужные слои:
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {data.categories.map((c) => {
          const cnt = data.by_category_count[c.key] ?? 0;
          const on = visibleKeys.has(c.key);
          return (
            <button
              key={c.key}
              onClick={() => onToggle(c.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                borderRadius: 8,
                background: on ? `${c.color}22` : "var(--surface-2)",
                border: on ? `1px solid ${c.color}` : "1px solid var(--border)",
                color: "var(--text, #E5E7EB)", cursor: "pointer", textAlign: "left",
                fontSize: 12,
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: 3, background: c.color,
              }} />
              <span style={{ flex: 1 }}>{c.label}</span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>{cnt}</span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
        {data.methodology}
      </div>
    </div>
  );
}
