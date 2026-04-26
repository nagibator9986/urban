import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, PolarGrid, Radar,
  RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { IconSparkles } from "../shell/Icons";
import { recommendForDistrict } from "../../services/api";
import type {
  BizCategoryScore, DistrictRecommendation,
} from "../../types";

interface Props {
  availableDistricts: string[];
  defaultDistrict?: string | null;
  onCategorySelect?: (categoryKey: string) => void;
}

export default function DistrictRecommender({
  availableDistricts, defaultDistrict, onCategorySelect,
}: Props) {
  const [district, setDistrict] = useState<string>(defaultDistrict ?? availableDistricts[0] ?? "");
  const [maxCapex, setMaxCapex] = useState<number | null>(null);
  const [data, setData] = useState<DistrictRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!district) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    recommendForDistrict(district, 10, maxCapex ?? undefined)
      .then((r) => { if (alive) setData(r); })
      .catch((e: any) => { if (alive) setErr(e?.message ?? "failed"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [district, maxCapex]);

  const groupRadar = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.group_scores).map(([k, v]) => ({ group: k, score: v }));
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card">
        <div className="card-title">🎯 Что открыть в этом районе — AI-рекомендатор</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="section-title">Район</span>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              style={selectStyle}
            >
              {availableDistricts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="section-title">Макс. бюджет (USD, опц.)</span>
            <input
              type="number"
              min={0}
              step={5000}
              placeholder="Не ограничивать"
              value={maxCapex ?? ""}
              onChange={(e) => setMaxCapex(e.target.value ? Number(e.target.value) : null)}
              style={selectStyle}
            />
          </label>
        </div>

        {err && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 6 }}>{err}</div>}
      </div>

      {loading && <div className="card" style={{ fontSize: 12, color: "var(--muted)" }}>AI считает 40+ категорий для района…</div>}

      {data && !loading && (
        <>
          <div className="card">
            <div className="card-title">📊 Профиль района</div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
              gap: 10, marginTop: 10,
            }}>
              <Kpi label="Население" value={data.population.toLocaleString("ru-RU")} />
              <Kpi label="Индекс дохода" value={`${(data.income_index * 100).toFixed(0)}/100`} />
              <Kpi label="Всего бизнесов" value={data.total_businesses.toLocaleString("ru-RU")} />
              <Kpi label="Дети 0-12" value={`${(data.age_cohorts.kids * 100).toFixed(0)}%`} />
              <Kpi label="Молодёжь 12-30" value={`${(data.age_cohorts.youth * 100).toFixed(0)}%`} />
              <Kpi label="Старше 60" value={`${(data.age_cohorts.senior * 100).toFixed(0)}%`} />
            </div>
          </div>

          <div className="card">
            <div className="card-title">🏆 Топ-10 категорий для {data.district}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {data.top.slice(0, 10).map((c, i) => (
                <RecommendationRow
                  key={c.category}
                  rank={i + 1}
                  item={c}
                  onClick={() => onCategorySelect?.(c.category)}
                />
              ))}
            </div>
          </div>

          <div className="charts-row">
            <div className="card">
              <div className="card-title">🌀 По группам категорий</div>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={groupRadar}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="group" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <Radar dataKey="score" stroke="#2DD4BF" fill="#2DD4BF" fillOpacity={0.35} />
                  <Tooltip
                    contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => `${v.toFixed(1)}/100`}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-title">❌ Худшие категории (не открывать)</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.bottom} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted)" }} domain={[0, 100]} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} width={100} />
                  <Tooltip
                    contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="score" fill="#EF4444">
                    {data.bottom.map((_, i) => (<Cell key={i} fill="#EF4444" />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
            <b>Методология:</b> {data.methodology}
          </div>
        </>
      )}
    </div>
  );
}

function RecommendationRow({
  rank, item, onClick,
}: { rank: number; item: BizCategoryScore; onClick?: () => void }) {
  const color = item.score >= 70 ? "#10B981"
    : item.score >= 50 ? "#F59E0B"
    : "#EF4444";
  return (
    <div
      onClick={onClick}
      style={{
        padding: 12, borderRadius: 10,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        display: "flex", gap: 12, alignItems: "flex-start",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, background: `${color}22`,
        color, display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 14, flexShrink: 0,
      }}>
        #{rank}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.label}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color }}>{item.score.toFixed(0)}</div>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          {item.market.existing_count} конкурентов · {item.market.per_10k}/10К
          (среднее {item.market.city_avg_per_10k}) ·
          ниша до {item.market.potential_slots} шт.
        </div>
        {item.economics?.capex_min_usd && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            CAPEX: ${item.economics.capex_min_usd.toLocaleString()}–${item.economics.capex_max_usd?.toLocaleString()} ·
            маржа {((item.economics.net_margin ?? 0) * 100).toFixed(0)}%
          </div>
        )}
        {item.reasons.length > 0 && (
          <ul style={{ margin: "6px 0 0 16px", padding: 0, fontSize: 11, lineHeight: 1.5, color: "var(--text, #E5E7EB)" }}>
            {item.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
          </ul>
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
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  color: "var(--text, #E5E7EB)", fontSize: 13,
};
