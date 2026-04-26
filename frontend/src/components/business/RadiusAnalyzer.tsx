import { useEffect, useState } from "react";
import { Circle, Popup, useMapEvents } from "react-leaflet";
import { IconReset, IconSparkles } from "../shell/Icons";
import { analyzeArea } from "../../services/api";
import type { AreaAnalysisResponse } from "../../types";

interface Props {
  categoryFilter: string | null;
  active: boolean;
}

// Map helper that listens for clicks and emits lat/lon upward via callback
export function RadiusClickCapturer({
  onPick, active,
}: { onPick: (lat: number, lon: number) => void; active: boolean }) {
  useMapEvents({
    click(e) {
      if (!active) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function RadiusAnalyzerPanel({
  center, radius, onRadiusChange, onReset, categoryFilter, data, loading,
}: {
  center: { lat: number; lon: number } | null;
  radius: number;
  onRadiusChange: (r: number) => void;
  onReset: () => void;
  categoryFilter: string | null;
  data: AreaAnalysisResponse | null;
  loading: boolean;
}) {
  return (
    <div className="card">
      <div className="card-title">🎯 Анализ территории (кликните по карте)</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        {center
          ? `Центр: ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`
          : "Режим активирован — кликните в любую точку карты."}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <label style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>
          Радиус: <strong style={{ color: "var(--brand-1)" }}>{radius.toFixed(1)} км</strong>
          <input
            type="range"
            min={0.3} max={3.0} step={0.1}
            value={radius}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
            style={{ marginLeft: 8, verticalAlign: "middle", width: 150 }}
          />
        </label>
        <button className="btn ghost sm" onClick={onReset}>
          <IconReset size={12} /> Сбросить
        </button>
      </div>

      {categoryFilter && (
        <div style={{ fontSize: 11, marginTop: 6, color: "var(--muted)" }}>
          Фильтр: только категория <b>{categoryFilter}</b>
        </div>
      )}

      {loading && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Считаем…</div>}

      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Kpi label="Всего объектов" value={String(data.total_competitors)} />
            <Kpi label="Район" value={(data.district ?? "—").replace(" район", "")} />
            <Kpi label="Площадь" value={`${data.area_km2} км²`} />
            <Kpi label="Жителей в зоне ~"
                 value={data.demography_estimate.population_in_radius?.toLocaleString("ru-RU") ?? "—"} />
          </div>

          {data.dominant_categories.length > 0 && (
            <div>
              <div className="section-title">Доминирующие категории</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {data.dominant_categories.slice(0, 5).map((d) => (
                  <div key={d.category} style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 12, padding: "4px 8px", borderRadius: 6,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                  }}>
                    <span>{d.label}</span>
                    <span style={{ fontWeight: 700 }}>{d.count} · {d.percent.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
            {data.demography_estimate.basis}
          </div>
        </div>
      )}
    </div>
  );
}

export function RadiusCircle({
  center, radius,
}: { center: { lat: number; lon: number }; radius: number }) {
  return (
    <Circle
      center={[center.lat, center.lon]}
      radius={radius * 1000}
      pathOptions={{
        color: "#2DD4BF", weight: 2.5,
        fillColor: "#2DD4BF", fillOpacity: 0.12,
        dashArray: "6 4",
      }}
    >
      <Popup>
        <div className="facility-popup">
          <div className="name">Зона анализа</div>
          <div className="type">{radius.toFixed(1)} км радиус</div>
        </div>
      </Popup>
    </Circle>
  );
}

// Thin helper for the page: coordinate radius analysis lifecycle (single point)
export function useRadiusAnalyzer() {
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(1.0);
  const [data, setData] = useState<AreaAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!center) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    analyzeArea(center.lat, center.lon, radius)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [center, radius]);

  return { center, setCenter, radius, setRadius, data, loading };
}

// Two-point compare hook + helpers
export interface TwoPointAnalyzerState {
  pointA: { lat: number; lon: number } | null;
  pointB: { lat: number; lon: number } | null;
  radius: number;
  active: "A" | "B" | null;
  dataA: AreaAnalysisResponse | null;
  dataB: AreaAnalysisResponse | null;
  loading: boolean;
}

export function useTwoPointAnalyzer() {
  const [pointA, setPointA] = useState<{ lat: number; lon: number } | null>(null);
  const [pointB, setPointB] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(1.0);
  const [active, setActive] = useState<"A" | "B" | null>("A");
  const [dataA, setDataA] = useState<AreaAnalysisResponse | null>(null);
  const [dataB, setDataB] = useState<AreaAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      pointA ? analyzeArea(pointA.lat, pointA.lon, radius) : Promise.resolve(null),
      pointB ? analyzeArea(pointB.lat, pointB.lon, radius) : Promise.resolve(null),
    ]).then(([ra, rb]) => {
      if (!alive) return;
      setDataA(ra);
      setDataB(rb);
    }).catch(() => { /* interceptor */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [pointA, pointB, radius]);

  const placePoint = (lat: number, lon: number) => {
    if (active === "A") {
      setPointA({ lat, lon });
      // Auto-advance to B if not yet placed
      if (!pointB) setActive("B");
    } else if (active === "B") {
      setPointB({ lat, lon });
    }
  };

  const reset = () => {
    setPointA(null);
    setPointB(null);
    setDataA(null);
    setDataB(null);
    setActive("A");
  };

  return {
    pointA, pointB, radius, active, dataA, dataB, loading,
    setActive, setRadius, placePoint, reset,
    setPointA, setPointB,
  };
}

// 2-point compare panel (sidebar)
export function TwoPointPanel({
  state, categoryFilter,
}: {
  state: ReturnType<typeof useTwoPointAnalyzer>;
  categoryFilter: string | null;
}) {
  const { pointA, pointB, dataA, dataB, radius, active, loading,
          setActive, setRadius, reset } = state;

  const Diff = ({ a, b, invert = false }:
    { a: number | null; b: number | null; invert?: boolean }) => {
    if (a == null || b == null) return null;
    const delta = b - a;
    if (delta === 0) return <span style={{ color: "var(--muted)" }}>=</span>;
    const positive = invert ? delta < 0 : delta > 0;
    return (
      <span style={{ fontSize: 11, color: positive ? "#10B981" : "#EF4444", fontWeight: 700, marginLeft: 6 }}>
        {delta > 0 ? "+" : ""}{delta}
      </span>
    );
  };

  return (
    <div className="card">
      <div className="card-title">📊 Сравнение двух точек</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        Поставьте две точки на карте — увидите side-by-side стат и разницу.
      </div>

      <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
        <button
          className={`pill-btn ${active === "A" ? "primary" : ""}`}
          style={{ fontSize: 11, flex: 1 }}
          onClick={() => setActive("A")}
        >
          📍 A {pointA ? "✓" : ""}
        </button>
        <button
          className={`pill-btn ${active === "B" ? "primary" : ""}`}
          style={{ fontSize: 11, flex: 1 }}
          onClick={() => setActive("B")}
        >
          📍 B {pointB ? "✓" : ""}
        </button>
        <button className="btn ghost sm" onClick={reset} title="Сброс обеих">
          <IconReset size={12} />
        </button>
      </div>

      <label style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, display: "block" }}>
        Радиус: <strong style={{ color: "var(--brand-1)" }}>{radius.toFixed(1)} км</strong>
        <input type="range" min={0.3} max={3.0} step={0.1}
               value={radius} onChange={(e) => setRadius(Number(e.target.value))}
               style={{ marginLeft: 8, verticalAlign: "middle", width: 130 }} />
      </label>

      {categoryFilter && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
          Фильтр: <b>{categoryFilter}</b>
        </div>
      )}

      {loading && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Считаем…</div>}

      {(dataA || dataB) && (
        <div style={{ marginTop: 12 }}>
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th style={{ textAlign: "left", padding: "4px 0" }}></th>
                <th style={{ textAlign: "right" }}>📍 A</th>
                <th style={{ textAlign: "right" }}>📍 B</th>
                <th style={{ textAlign: "right" }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--border)" }}>
                <td>Конкуренты</td>
                <td style={{ textAlign: "right" }}>{dataA?.total_competitors ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{dataB?.total_competitors ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <Diff a={dataA?.total_competitors ?? null}
                        b={dataB?.total_competitors ?? null} invert />
                </td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--border)" }}>
                <td>Жителей в зоне ~</td>
                <td style={{ textAlign: "right" }}>
                  {dataA?.demography_estimate.population_in_radius?.toLocaleString("ru-RU") ?? "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  {dataB?.demography_estimate.population_in_radius?.toLocaleString("ru-RU") ?? "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  <Diff
                    a={dataA?.demography_estimate.population_in_radius ?? null}
                    b={dataB?.demography_estimate.population_in_radius ?? null}
                  />
                </td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--border)" }}>
                <td>Доход-индекс района</td>
                <td style={{ textAlign: "right" }}>
                  {dataA?.demography_estimate.income_index_district?.toFixed(2) ?? "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  {dataB?.demography_estimate.income_index_district?.toFixed(2) ?? "—"}
                </td>
                <td style={{ textAlign: "right" }} />
              </tr>
            </tbody>
          </table>

          {dataA && dataB && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8,
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                Вердикт
              </div>
              <div style={{ fontSize: 11, color: "var(--text, #E5E7EB)", lineHeight: 1.5 }}>
                {(() => {
                  const less = dataA.total_competitors < dataB.total_competitors ? "A" : "B";
                  const more = dataA.total_competitors === dataB.total_competitors
                    ? null
                    : less === "A" ? "B" : "A";
                  if (!more) return "Конкуренция одинакова — другие факторы решают.";
                  return `Точка ${less} имеет меньше конкурентов на ${Math.abs(dataA.total_competitors - dataB.total_competitors)} объектов.`;
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Two circles + labels on map
export function TwoPointCircles({
  state,
}: { state: ReturnType<typeof useTwoPointAnalyzer> }) {
  const { pointA, pointB, radius } = state;
  return (
    <>
      {pointA && (
        <Circle
          center={[pointA.lat, pointA.lon]}
          radius={radius * 1000}
          pathOptions={{
            color: "#22D3EE", weight: 2.5,
            fillColor: "#22D3EE", fillOpacity: 0.10,
            dashArray: "6 4",
          }}
        >
          <Popup><div className="facility-popup">
            <div className="name">📍 Точка A</div>
            <div className="type">{radius.toFixed(1)} км радиус</div>
          </div></Popup>
        </Circle>
      )}
      {pointB && (
        <Circle
          center={[pointB.lat, pointB.lon]}
          radius={radius * 1000}
          pathOptions={{
            color: "#2DD4BF", weight: 2.5,
            fillColor: "#2DD4BF", fillOpacity: 0.10,
            dashArray: "6 4",
          }}
        >
          <Popup><div className="facility-popup">
            <div className="name">📍 Точка B</div>
            <div className="type">{radius.toFixed(1)} км радиус</div>
          </div></Popup>
        </Circle>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: 8, borderRadius: 6,
      background: "var(--surface-2)", border: "1px solid var(--border)",
    }}>
      <div style={{
        fontSize: 10, color: "var(--muted)", fontWeight: 700,
        letterSpacing: 0.4, textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export { IconSparkles };
