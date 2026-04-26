import { useEffect, useState } from "react";
import { Rectangle, Tooltip } from "react-leaflet";
import { getBestLocationsGrid } from "../../services/api";
import type { BestLocationGridResponse } from "../../types";

interface Props {
  category: string | null;
  district?: string;
  gridSize?: number;
  captureRadius?: number;
}

function cellColor(score: number): string {
  if (score >= 80) return "#10B981";
  if (score >= 65) return "#84CC16";
  if (score >= 50) return "#EAB308";
  if (score >= 35) return "#F97316";
  return "#EF4444";
}

export function BestLocationGridLayer({
  category, district, gridSize = 8, captureRadius = 0.7,
}: Props) {
  const [data, setData] = useState<BestLocationGridResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!category) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    getBestLocationsGrid(category, {
      grid_size: gridSize,
      capture_radius_km: captureRadius,
      district,
    })
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category, district, gridSize, captureRadius]);

  if (!data) return null;

  return (
    <>
      {data.cells.map((c) => {
        const lat0 = c.lat - data.lat_step / 2;
        const lat1 = c.lat + data.lat_step / 2;
        const lon0 = c.lon - data.lon_step / 2;
        const lon1 = c.lon + data.lon_step / 2;
        const color = cellColor(c.score);
        // Top 3 — bigger emphasis
        const isTop = data.top.slice(0, 3).some(
          (t) => t.row === c.row && t.col === c.col,
        );
        return (
          <Rectangle
            key={`${c.row}-${c.col}`}
            bounds={[[lat0, lon0], [lat1, lon1]]}
            pathOptions={{
              color: isTop ? "#FFFFFF" : color,
              weight: isTop ? 2 : 0.5,
              fillColor: color,
              fillOpacity: isTop ? 0.55 : 0.35,
            }}
          >
            <Tooltip sticky>
              <div style={{ fontSize: 12 }}>
                <strong>Score: {c.score}/100</strong>
                <div>{c.district}</div>
                <div>Конкурентов в радиусе: {c.conflict}</div>
                <div>Комплиментарных: {c.complementary}</div>
                <div>Доход-индекс: {(c.income_index * 100).toFixed(0)}</div>
              </div>
            </Tooltip>
          </Rectangle>
        );
      })}
      {loading && null}
    </>
  );
}

export function BestLocationGridLegend({
  data,
}: { data: BestLocationGridResponse | null }) {
  return (
    <div className="card">
      <div className="card-title">⭐ Sub-district grid</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        {data ? `Категория: ${data.category_label}. ${data.total_cells} ячеек ${data.grid_size}×${data.grid_size}.` : "Загружаем…"}
      </div>
      {data && (
        <>
          <div style={{ marginTop: 10 }}>
            <div className="section-title">Топ-5 точек</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {data.top.slice(0, 5).map((c, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 8px", borderRadius: 6,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  fontSize: 11,
                }}>
                  <span style={{ fontWeight: 700, marginRight: 6 }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 10, color: "var(--muted)" }}>
                    {c.district.replace(" район", "")} · конкурентов {c.conflict}
                  </span>
                  <span style={{
                    fontWeight: 800,
                    color: cellColor(c.score),
                  }}>{c.score}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
            {data.methodology}
          </div>
        </>
      )}
    </div>
  );
}

// Helper hook to share data with the map
export function useBestLocationsGrid(category: string | null, district?: string) {
  const [data, setData] = useState<BestLocationGridResponse | null>(null);
  useEffect(() => {
    if (!category) {
      setData(null);
      return;
    }
    let alive = true;
    getBestLocationsGrid(category, { district })
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [category, district]);
  return data;
}
