import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { timeCoverage } from "../../services/api";
import type { BusinessCategories, TimeCoverageResponse } from "../../types";

interface Props {
  categories: BusinessCategories | null;
  availableDistricts: string[];
}

const DAY_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function TimeCoverageCard({ categories, availableDistricts }: Props) {
  const [category, setCategory] = useState<string>("");
  const [district, setDistrict] = useState<string>("");
  const [data, setData] = useState<TimeCoverageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    timeCoverage(category || undefined, district || undefined)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category, district]);

  return (
    <div className="card">
      <div className="card-title">🕐 Покрытие по часам — где ниша для круглосуточного</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        Парсим OSM opening_hours. Ниша = час, когда &lt;30% заведений открыты.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="section-title">Категория</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={sel}>
            <option value="">Все категории</option>
            {categories?.all.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="section-title">Район</span>
          <select value={district} onChange={(e) => setDistrict(e.target.value)} style={sel}>
            <option value="">Весь город</option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>Считаем…</div>}

      {data && !loading && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
            Проанализировано: <b>{data.parsed_businesses}</b> с корректным opening_hours
            (пропущено {data.skipped_no_hours} без данных)
          </div>

          <div className="section-title">Среднее по часам суток (24)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.by_hour_avg}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <ReferenceLine y={data.parsed_businesses * 0.3} stroke="#EF4444" strokeDasharray="3 3"
                             label={{ value: "30%", fill: "#EF4444", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => `${v} открыто`}
                labelFormatter={(h: number) => `${h}:00`}
              />
              <Bar dataKey="avg_open">
                {data.by_hour_avg.map((r, i) => (
                  <Cell key={i} fill={r.avg_open_share < 0.3 ? "#EF4444" : r.avg_open_share < 0.6 ? "#F59E0B" : "#10B981"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {data.top_niches.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="section-title">🎯 Топ-10 «часы-ниши»</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {data.top_niches.slice(0, 10).map((n, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "6px 10px", borderRadius: 6,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    fontSize: 12,
                  }}>
                    <span>
                      <b>{DAY_RU[n.day_idx]}</b> {n.hour}:00
                    </span>
                    <span>
                      <span style={{ color: "var(--muted)" }}>открыто: {n.open_count} </span>
                      <span style={{ fontWeight: 700, color: "#EF4444", marginLeft: 6 }}>
                        {(n.open_share * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
            {data.methodology}
          </div>
        </div>
      )}
    </div>
  );
}

const sel: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  color: "var(--text, #E5E7EB)", fontSize: 13,
};
