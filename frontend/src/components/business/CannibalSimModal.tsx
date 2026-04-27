import { useEffect, useState } from "react";
import { IconClose, IconSparkles } from "../shell/Icons";
import { cannibalizationSim } from "../../services/api";
import type {
  BusinessCategories, CannibalizationResponse,
} from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: BusinessCategories | null;
  presetLat?: number;
  presetLon?: number;
  presetCategory?: string;
}

export default function CannibalSimModal({
  open, onClose, categories, presetLat, presetLon, presetCategory,
}: Props) {
  const [lat, setLat] = useState<number>(presetLat ?? 43.238);
  const [lon, setLon] = useState<number>(presetLon ?? 76.946);
  const [category, setCategory] = useState<string>(presetCategory ?? "cafe");
  const [radius, setRadius] = useState<number>(1.2);
  const [data, setData] = useState<CannibalizationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (presetLat !== undefined) setLat(presetLat);
    if (presetLon !== undefined) setLon(presetLon);
    if (presetCategory) setCategory(presetCategory);
  }, [presetLat, presetLon, presetCategory]);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await cannibalizationSim(lat, lon, category, radius));
    } catch (e: any) {
      setErr(e?.message ?? "failed");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const riskColor = data ? (
    { low: "#EF4444", medium: "#F59E0B", high: "#10B981" }[data.risk] ?? "#64748B"
  ) : "#64748B";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: "94%", maxHeight: "92vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>🍽 Симулятор каннибализации</h2>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Сколько трафика заберу у соседей той же категории?
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="section-title">Категория</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={sel}
            >
              {categories?.all.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="section-title">Радиус захвата (км)</span>
            <input
              type="number" min={0.3} max={3} step={0.1}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              style={sel}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="section-title">Latitude</span>
            <input type="number" step={0.0001} value={lat}
                   onChange={(e) => setLat(Number(e.target.value))} style={sel} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="section-title">Longitude</span>
            <input type="number" step={0.0001} value={lon}
                   onChange={(e) => setLon(Number(e.target.value))} style={sel} />
          </label>
        </div>

        <button className="cta-gradient" onClick={run} disabled={loading}>
          <IconSparkles size={14} />
          {loading ? "Моделируем…" : "Запустить симуляцию"}
        </button>
        {err && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 6 }}>{err}</div>}

        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            <div className="card" style={{ borderLeft: `4px solid ${riskColor}` }}>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
                gap: 10,
              }}>
                <Kpi label="Моя доля рынка" value={`${data.newcomer_market_share_percent}%`} />
                <Kpi label="Каннибализировано" value={`${data.total_cannibalized_percent}%`} />
                <Kpi label="Конкурентов" value={String(data.competitors_in_radius)} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: riskColor }}>
                {data.risk_label}
              </div>
            </div>

            {data.competitors.length > 0 && (
              <div className="card">
                <div className="card-title">📉 У кого отниму клиентов</div>
                <div className="table-scroll" style={{ marginTop: 8 }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 320 }}>
                  <thead>
                    <tr style={{ color: "var(--muted)" }}>
                      <th style={{ textAlign: "left", padding: "4px 0" }}>Заведение</th>
                      <th style={{ textAlign: "right" }}>Расст.</th>
                      <th style={{ textAlign: "right" }}>Отниму</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.competitors.map((c) => (
                      <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "4px 0" }}>{c.name}</td>
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>{c.distance_km} км</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#EF4444" }}>
                          {c.cannibalized_share_percent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
              {data.methodology}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: 10, borderRadius: 8, background: "var(--surface-2)",
      border: "1px solid var(--border)",
    }}>
      <div style={{
        fontSize: 10, color: "var(--muted)", fontWeight: 700,
        letterSpacing: 0.6, textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const sel: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  color: "var(--text, #E5E7EB)", fontSize: 13,
};
