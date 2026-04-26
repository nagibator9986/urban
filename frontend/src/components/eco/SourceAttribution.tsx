import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { getSourceAttribution } from "../../services/api";
import type { SourceAttribution as SA } from "../../types";
import { sanitizeBackendHtml } from "../ui/markdown";

interface Props { district: string | null; }

export default function SourceAttribution({ district }: Props) {
  const [data, setData] = useState<SA | null>(null);

  useEffect(() => {
    if (!district) { setData(null); return; }
    getSourceAttribution(district).then(setData).catch(() => setData(null));
  }, [district]);

  if (!district || !data) return null;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="card-title">Откуда пришёл смог</div>

      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14 }}>
        <div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={data.sources.map((s) => ({ name: s.label, value: s.percent, color: s.color }))}
                cx="50%" cy="50%" innerRadius={42} outerRadius={70}
                paddingAngle={2} dataKey="value"
              >
                {data.sources.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#18212F", border: "1px solid #334155",
                                borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v}%`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ textAlign: "center", fontSize: 10, color: "var(--muted)",
                        fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
            {data.season === "winter" ? "зимний профиль" : "летний профиль"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.sources.map((s) => (
            <div key={s.key} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 12,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: "var(--text-2)" }}>{s.label}</span>
              <span style={{ fontWeight: 800, color: s.color, minWidth: 48, textAlign: "right" }}>
                {s.percent}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: 14, padding: "10px 12px", borderRadius: 8,
        background: `${data.dominant_source.color}15`,
        border: `1px solid ${data.dominant_source.color}55`,
        fontSize: 12, color: "var(--text-2)", lineHeight: 1.55,
      }} dangerouslySetInnerHTML={{ __html: sanitizeBackendHtml(data.explanation) }} />

      <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
        <b>{data.dominant_source.label}.</b> {data.dominant_source.description}
      </div>
    </div>
  );
}
