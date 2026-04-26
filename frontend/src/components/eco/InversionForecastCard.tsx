import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { getInversionForecast } from "../../services/api";
import type { InversionForecast } from "../../types";

const SEV_COLORS = {
  critical: "#A855F7",
  high:     "#EF4444",
  moderate: "#F97316",
  low:      "#10B981",
} as const;

export default function InversionForecastCard() {
  const [data, setData] = useState<InversionForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getInversionForecast(72)
      .then((d) => { if (alive) setData(d); })
      .catch((e: any) => { if (alive) setErr(e?.message ?? "failed"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return <div className="card" style={{ fontSize: 12, color: "var(--muted)" }}>Загружаем прогноз инверсий…</div>;
  }
  if (err || !data || data.error) {
    return (
      <div className="card">
        <div className="card-title">🌡 Прогноз инверсий (72 ч)</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          Нет связи с Open-Meteo сейчас. Инверсия — когда тёплый воздух лежит над холодным
          и задерживает смог. Проверьте позже.
        </div>
      </div>
    );
  }

  const anyCritical = data.summary.any_critical;
  const alertColor = anyCritical ? "#A855F7"
    : data.summary.total_inversion_hours >= 12 ? "#F97316"
    : "#10B981";

  return (
    <div className="card" style={{ borderLeft: `4px solid ${alertColor}` }}>
      <div className="card-title">🌡 Температурная инверсия · 72 часа</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        {data.summary.alert_message}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))",
        gap: 10, marginTop: 12,
      }}>
        <KpiBlock label="Часов с инверсией" value={data.summary.total_inversion_hours} />
        <KpiBlock label="Из них критических" value={data.summary.total_critical_hours}
                  color={data.summary.total_critical_hours > 0 ? "#A855F7" : undefined} />
        <KpiBlock label="Источник" value="Open-Meteo" small />
      </div>

      {/* Chart: inversion score + ΔT */}
      <div style={{ marginTop: 14 }}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data.points}>
            <defs>
              <linearGradient id="inv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#A855F7" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#A855F7" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="ts"
              tick={{ fontSize: 9, fill: "var(--muted)" }}
              tickFormatter={(t: string) => t.slice(5, 13).replace("T", " ")}
              minTickGap={40}
            />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(t: string) => new Date(t).toLocaleString("ru-RU")}
              formatter={(v: number, name) => [v, name]}
            />
            <Area type="monotone" dataKey="inversion_score" name="Сила инверсии"
                  stroke="#A855F7" fill="url(#inv)" />
            <Line type="monotone" dataKey="delta_t" name="ΔT (T₈₅₀ − T₂м)"
                  stroke="#F97316" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Worst windows */}
      {data.worst_windows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="section-title">🚨 Самые опасные 3-часовые окна</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {data.worst_windows.map((w, i) => {
              const sevKey = w.severity.includes("риск")
                ? "critical"
                : w.avg_score >= 70 ? "critical"
                : w.avg_score >= 45 ? "high"
                : w.avg_score >= 25 ? "moderate" : "low";
              const color = SEV_COLORS[sevKey as keyof typeof SEV_COLORS] ?? "#64748B";
              return (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", borderRadius: 8,
                  background: "var(--surface-2)",
                  borderLeft: `3px solid ${color}`, fontSize: 12,
                }}>
                  <span>
                    {new Date(w.start).toLocaleString("ru-RU", { weekday: "short", hour: "2-digit" })} –
                    {" "}{new Date(w.end).toLocaleString("ru-RU", { hour: "2-digit" })}
                  </span>
                  <span style={{ fontWeight: 700, color }}>{w.avg_score} · {w.severity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 10 }}>
        {data.methodology}
      </div>
    </div>
  );
}

function KpiBlock({ label, value, color, small }:
  { label: string; value: number | string; color?: string; small?: boolean }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{
        fontSize: small ? 13 : 20,
        fontWeight: 800,
        color: color ?? "var(--text, #E5E7EB)",
        marginTop: 2,
      }}>
        {value}
      </div>
    </div>
  );
}
