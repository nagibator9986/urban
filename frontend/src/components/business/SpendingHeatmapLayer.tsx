import { useEffect, useState } from "react";
import { Rectangle, Tooltip } from "react-leaflet";
import { getSpendingPotential } from "../../services/api";
import type { SpendingPotentialResponse } from "../../types";

export function SpendingHeatmapLayer({ visible }: { visible: boolean }) {
  const [data, setData] = useState<SpendingPotentialResponse | null>(null);

  useEffect(() => {
    if (!visible || data) return;
    let alive = true;
    getSpendingPotential().then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, data]);

  if (!visible || !data) return null;

  return (
    <>
      {data.districts.map((d) => {
        if (!d.bounds) return null;
        const [lat_min, lat_max, lon_min, lon_max] = d.bounds;
        const c = heatColor(d.score);
        return (
          <Rectangle
            key={d.district}
            bounds={[[lat_min, lon_min], [lat_max, lon_max]]}
            pathOptions={{
              color: c, weight: 1.5,
              fillColor: c, fillOpacity: 0.35,
            }}
          >
            <Tooltip sticky>
              <div style={{ fontSize: 12 }}>
                <strong>{d.district}</strong>
                <div>Spending-потенциал: <b>{d.score.toFixed(1)}/100</b></div>
                <div>Доход-индекс: {(d.income_index * 100).toFixed(0)}</div>
                <div>Бизнесов: {d.total_businesses}</div>
              </div>
            </Tooltip>
          </Rectangle>
        );
      })}
    </>
  );
}

export function SpendingLegend({ data }: { data: SpendingPotentialResponse | null }) {
  if (!data) {
    return (
      <div className="card">
        <div className="card-title">💰 Spending potential</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Загружаем…</div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-title">💰 Spending-потенциал по районам</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        Нормированный 0-100: население × доход × (1 − насыщенность).
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {data.districts.map((d, i) => (
          <div key={d.district} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", borderRadius: 8,
            background: "var(--surface-2)", border: "1px solid var(--border)",
            fontSize: 12,
          }}>
            <span style={{ fontWeight: 700, width: 18 }}>#{i + 1}</span>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: heatColor(d.score),
            }} />
            <span style={{ flex: 1 }}>{d.district.replace(" район", "")}</span>
            <span style={{ fontWeight: 800 }}>{d.score.toFixed(0)}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
        {data.methodology}
      </div>
    </div>
  );
}

// Green → yellow → red scale (high score = green/opportunity)
function heatColor(score: number): string {
  if (score >= 80) return "#10B981";
  if (score >= 60) return "#22D3EE";
  if (score >= 40) return "#F59E0B";
  if (score >= 20) return "#F97316";
  return "#EF4444";
}
