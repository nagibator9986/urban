import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { getDistrictForecast } from "../../services/api";
import type { DistrictForecast } from "../../types";

interface Props { district: string | null; }

export default function ForecastChart({ district }: Props) {
  const [data, setData] = useState<DistrictForecast | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!district) { setData(null); return; }
    setLoading(true);
    getDistrictForecast(district, 72)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [district]);

  if (!district) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Выберите район для прогноза AQI на 72 часа.
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading">Считаем прогноз…</div>;
  if (!data) return null;

  const chartData = data.points.map((p) => ({
    hour: new Date(p.ts).getHours(),
    ts: p.ts,
    label: `${new Date(p.ts).getDate()}/${new Date(p.ts).getMonth() + 1} ${String(new Date(p.ts).getHours()).padStart(2, "0")}:00`,
    aqi: p.aqi,
    driver: p.main_driver,
  }));

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="card-title">Прогноз AQI · 72 часа</div>

      {data.alert && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 10,
          background: data.alert.level === "high"
            ? "rgba(239,68,68,0.12)"
            : "rgba(245,158,11,0.12)",
          border: `1px solid ${data.alert.level === "high" ? "var(--danger)" : "var(--warning)"}`,
        }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>
            {data.alert.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
            {data.alert.message}
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
          <defs>
            <linearGradient id="aqiGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={0.55} />
              <stop offset="40%" stopColor="#F59E0B" stopOpacity={0.42} />
              <stop offset="75%" stopColor="#22D3EE" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.22} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "var(--muted)" }}
            interval={11}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "var(--muted)" }}
            domain={[0, "dataMax + 20"]}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: "#18212F", border: "1px solid #334155",
                            borderRadius: 8, fontSize: 11 }}
            formatter={(v: number, _: any, payload: any) => [
              `${v} (${payload.payload.driver})`, "AQI",
            ]}
          />
          <ReferenceLine y={50}  stroke="#10B981" strokeDasharray="2 2" />
          <ReferenceLine y={100} stroke="#FBBF24" strokeDasharray="2 2" />
          <ReferenceLine y={150} stroke="#FB923C" strokeDasharray="2 2" />
          <ReferenceLine y={200} stroke="#EF4444" strokeDasharray="2 2" />
          <Area
            type="monotone"
            dataKey="aqi"
            stroke="#22D3EE"
            strokeWidth={2}
            fill="url(#aqiGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Daily summary chips */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {data.daily.map((d) => (
          <div key={d.date} style={{
            flex: "1 1 140px", padding: "10px 12px", borderRadius: 10,
            background: "var(--surface-2)", border: `1px solid ${d.color}40`,
          }}>
            <div style={{ fontSize: 10, color: "var(--muted)",
                          fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {new Date(d.date).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{d.avg_aqi}</span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                пик {d.peak_aqi} · мин {d.low_aqi}
              </span>
            </div>
            <div style={{ fontSize: 10, color: d.color, fontWeight: 600, marginTop: 2 }}>
              {d.category}
            </div>
          </div>
        ))}
      </div>

      {/* Best windows */}
      {data.best_windows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                        textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
            ✨ Лучшее время выйти на улицу
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.best_windows.map((w, i) => (
              <div key={i} style={{
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.3)",
                fontSize: 12, display: "flex", justifyContent: "space-between",
              }}>
                <span>
                  <b>{new Date(w.start).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" })}</b>
                  {" "}{w.start.slice(11, 16)}–{w.end.slice(11, 16)}
                </span>
                <span style={{ color: "var(--success)", fontWeight: 700 }}>AQI {w.avg_aqi}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
