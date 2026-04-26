import { useEffect, useState } from "react";
import {
  Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { getCitiesCompare } from "../../services/api";
import type { CitiesCompareResponse, CityCompareItem } from "../../types";
import { sanitizeBackendHtml } from "../ui/markdown";

type ViewMode = "bars" | "map";

export default function CitiesCompareCard() {
  const [data, setData] = useState<CitiesCompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("bars");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCitiesCompare()
      .then((d) => { if (alive) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="card" style={{ fontSize: 12, color: "var(--muted)" }}>Загружаем сравнение городов…</div>;
  if (!data) return null;

  const chartData = data.all_ranked.map((c) => ({
    city: c.city,
    pm25: c.pm25_annual,
    color: c.group_color,
    group: c.group_label,
    who_x: c.who_times_over,
    year: c.source_year,
    is_self: c.group === "self",
  }));

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="card-title" style={{ margin: 0 }}>
          🌐 Алматы vs мир (PM2.5 · µg/m³ год)
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className={`pill-btn ${view === "bars" ? "primary" : ""}`}
            onClick={() => setView("bars")}
            style={{ fontSize: 11 }}
          >
            📊 Bars
          </button>
          <button
            className={`pill-btn ${view === "map" ? "primary" : ""}`}
            onClick={() => setView("map")}
            style={{ fontSize: 11 }}
          >
            🗺 Map
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}
           dangerouslySetInnerHTML={{ __html: sanitizeBackendHtml(data.summary_html) }} />

      {view === "map" ? (
        <WorldMapView cities={data.all_ranked} who={data.who_annual_guideline} />
      ) : (
      <>
      <div style={{ marginTop: 12 }}>
        <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 26)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <YAxis type="category" dataKey="city" tick={{ fontSize: 11, fill: "var(--muted)" }} width={100} />
            <Tooltip
              contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number, _n, p: any) => [
                `${v} µg/m³ (×${p.payload.who_x} от нормы ВОЗ)`,
                `${p.payload.group}${p.payload.is_self ? "" : ` · ${p.payload.year}`}`,
              ]}
            />
            <ReferenceLine x={data.who_annual_guideline} stroke="#10B981" strokeDasharray="3 3"
                           label={{ value: `ВОЗ ${data.who_annual_guideline}`, fill: "#10B981", fontSize: 10, position: "top" }} />
            <Bar dataKey="pm25">
              {chartData.map((c, i) => (
                <Cell
                  key={i}
                  fill={c.color}
                  stroke={c.is_self ? "#FFFFFF" : undefined}
                  strokeWidth={c.is_self ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        {data.groups.concat([{ key: "self", label: "Алматы (сейчас)", color: "#2DD4BF" }]).map((g) => (
          <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2, background: g.color,
              border: g.key === "self" ? "1px solid #fff" : undefined,
            }} />
            {g.label}
          </div>
        ))}
      </div>
      </>
      )}

      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
        {data.methodology}
      </div>
    </div>
  );
}

// =====================================================================
// World Map View — pin cities, size and color by PM2.5
// =====================================================================
function WorldMapView({ cities, who }: { cities: CityCompareItem[]; who: number }) {
  const radiusFor = (pm: number) => {
    // Square-root scale so big values don't dominate.
    return Math.max(8, Math.min(28, 4 + Math.sqrt(pm) * 1.8));
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        height: 460, borderRadius: 12, overflow: "hidden",
        border: "1px solid var(--border)",
      }}>
        <MapContainer
          center={[35, 60]}
          zoom={2}
          minZoom={1}
          maxZoom={6}
          style={{ height: "100%", width: "100%", background: "#0A0F1A" }}
          worldCopyJump
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap, &copy; CARTO'
          />
          {cities.map((city) => {
            const r = radiusFor(city.pm25_annual);
            const isSelf = city.group === "self";
            return (
              <CircleMarker
                key={city.city}
                center={[city.lat, city.lon]}
                radius={r}
                pathOptions={{
                  color: isSelf ? "#FFFFFF" : "#000000",
                  weight: isSelf ? 2 : 0.5,
                  fillColor: city.group_color,
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <div className="facility-popup">
                    <div className="name">
                      {isSelf ? "📍 " : ""}{city.city}, {city.country}
                    </div>
                    <div className="type">
                      PM2.5: <strong style={{ color: city.group_color }}>{city.pm25_annual} µg/m³</strong>
                    </div>
                    <div className="type">
                      AQI ≈ {city.aqi_approx} · ×{city.who_times_over} от ВОЗ ({who} µg/m³)
                    </div>
                    <div className="type">{city.group_label}</div>
                    <div className="address" style={{ fontSize: 10 }}>
                      {city.source_note} ({city.source_year})
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>
        Размер кружка ∝ √PM2.5. Алматы выделена белым контуром.
      </div>
    </div>
  );
}
