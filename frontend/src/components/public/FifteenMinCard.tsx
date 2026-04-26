import { useEffect, useState } from "react";
import { getFifteenMin } from "../../services/api";
import type { FifteenMinCity } from "../../types";
import { FACILITY_EMOJI, FACILITY_LABELS } from "../../types";

const GRADE_COLOR: Record<string, string> = {
  A: "#10B981", B: "#84CC16", C: "#EAB308", D: "#F97316", E: "#EF4444",
};

export default function FifteenMinCard() {
  const [data, setData] = useState<FifteenMinCity | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => { getFifteenMin().then(setData).catch(() => {}); }, []);

  if (!data) return null;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="card-title">15-минутный город</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        % площади района, где все 6 ключевых сервисов доступны за 15 мин пешком
        (школа, сад, поликлиника, аптека, парк, остановка)
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em" }}
              className="stat-value brand">
          {data.city_avg_score}
        </span>
        <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 13 }}>
          / 100 · средний по городу
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.districts.map((d) => {
          const color = GRADE_COLOR[d.grade];
          return (
            <div
              key={d.district_id}
              onMouseEnter={() => setHover(d.district_id)}
              onMouseLeave={() => setHover(null)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--surface-2)",
                border: `1px solid ${hover === d.district_id ? color : "var(--border)"}`,
                transition: "border-color 0.15s",
                cursor: "default",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 8,
                    background: color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800,
                  }}>{d.grade}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {d.district_name.replace(" район", "")}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>
                      {d.covered_all_services_percent}% территории · 6/6 сервисов
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color }}>
                  {d.score_15min}
                </div>
              </div>
              {hover === d.district_id && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {Object.entries(d.by_service).map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 999,
                      background: `${v >= 90 ? "#10B981" : v >= 60 ? "#F59E0B" : "#EF4444"}22`,
                      color: v >= 90 ? "#10B981" : v >= 60 ? "#F59E0B" : "#EF4444",
                      fontWeight: 700,
                    }}>
                      {FACILITY_EMOJI[k as keyof typeof FACILITY_EMOJI] ?? "·"} {FACILITY_LABELS[k as keyof typeof FACILITY_LABELS] ?? k}: {v}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
