import { useEffect, useState } from "react";
import { getWindowAdvice } from "../../services/api";
import type { WindowAdvice } from "../../types";
import { sanitizeBackendHtml } from "../ui/markdown";

interface Props {
  district: string | null;
}

export default function WindowsCard({ district }: Props) {
  const [data, setData] = useState<WindowAdvice | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!district) return;
    let alive = true;
    setLoading(true);
    getWindowAdvice(district)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [district]);

  if (!district) {
    return (
      <div className="card">
        <div className="card-title">🪟 Когда проветривать и гулять</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Выберите район на карте — подскажем лучшие часы дня.
        </div>
      </div>
    );
  }
  if (loading) return <div className="card" style={{ fontSize: 12, color: "var(--muted)" }}>Считаем чистые окна…</div>;
  if (!data) return null;

  return (
    <div className="card">
      <div className="card-title">🪟 Лучшие часы сегодня · {district.replace(" район", "")}</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Среднесуточный AQI: <strong>{data.day_avg_aqi}</strong>
      </div>
      <div
        style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}
        dangerouslySetInnerHTML={{ __html: sanitizeBackendHtml(data.advice_html) }}
      />

      {data.clean_windows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="section-title" style={{ color: "#10B981" }}>✅ Чистые окна</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {data.clean_windows.map((w, i) => (
              <div key={i} style={rowStyle("#10B981")}>
                <span>
                  {w.from.slice(11, 16)}–{w.to.slice(11, 16)}
                  <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 11 }}>
                    ~{w.hours} ч
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: "#10B981" }}>AQI {w.avg_aqi}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.dirty_windows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="section-title" style={{ color: "#EF4444" }}>⚠️ Грязные окна</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {data.dirty_windows.map((w, i) => (
              <div key={i} style={rowStyle("#EF4444")}>
                <span>
                  {w.from.slice(11, 16)}–{w.to.slice(11, 16)}
                  <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 11 }}>
                    ~{w.hours} ч
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: "#EF4444" }}>AQI {w.avg_aqi}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const rowStyle = (color: string): React.CSSProperties => ({
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 10px", borderRadius: 8,
  background: "var(--surface-2)",
  borderLeft: `3px solid ${color}`, fontSize: 12,
});
