import { useEffect, useState } from "react";
import { getHealthImpact } from "../../services/api";
import type { HealthImpact } from "../../types";

interface Props { district: string | null; }

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#7F1D1D", high: "#EF4444", moderate: "#F59E0B", low: "#10B981",
};
const SEVERITY_LABEL: Record<string, string> = {
  critical: "Критический риск", high: "Высокий риск",
  moderate: "Умеренный риск", low: "Низкий риск",
};

export default function HealthImpactCard({ district }: Props) {
  const [data, setData] = useState<HealthImpact | null>(null);

  useEffect(() => {
    if (!district) { setData(null); return; }
    getHealthImpact(district).then(setData).catch(() => setData(null));
  }, [district]);

  if (!district || !data) return null;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="card-title">Медицинский след · на 100К/год</div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 60, height: 60, borderRadius: 14,
          background: SEVERITY_COLOR[data.severity],
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em",
          boxShadow: `0 0 20px ${SEVERITY_COLOR[data.severity]}66`,
        }}>
          {data.pm25_current}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>PM2.5 сейчас: <span style={{ color: SEVERITY_COLOR[data.severity] }}>{data.pm25_current} µg/m³</span></div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            Превышение ВОЗ на {data.pm25_excess} µg/m³ · {SEVERITY_LABEL[data.severity]}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.impacts.map((i) => (
          <div key={i.key} style={{
            padding: "10px 12px", borderRadius: 10,
            background: "var(--surface-2)", border: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                {i.label}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: SEVERITY_COLOR[data.severity] }}>
                +{i.extra_cases_per_100k_year.toLocaleString("ru-RU")}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 10, color: "var(--muted)" }}>
              <span>Базовый уровень {i.baseline_per_100k_year.toLocaleString("ru-RU")}</span>
              <span>+{i.extra_percent}% сверх нормы</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12, padding: "10px 12px", borderRadius: 8,
        background: "rgba(34,211,238,0.05)", border: "1px dashed var(--border-2)",
        fontSize: 11, color: "var(--muted)", lineHeight: 1.5,
      }}>
        📊 <b>Методология:</b> {data.methodology}
      </div>
    </div>
  );
}
