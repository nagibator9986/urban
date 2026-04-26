import { useEffect, useState } from "react";
import { compareDistrictsApi, getDistricts } from "../../services/api";
import type { CompareResult, District } from "../../types";
import { IconClose, IconStats } from "../shell/Icons";

interface Props { open: boolean; onClose: () => void; }

const TYPE_EMOJI: Record<string, string> = {
  school: "🎓", kindergarten: "🧸", hospital: "🏥", clinic: "🩺",
  pharmacy: "💊", park: "🌳", fire_station: "🚒", bus_stop: "🚌",
};
const TYPE_LABEL: Record<string, string> = {
  school: "Школы", kindergarten: "Детсады", hospital: "Больницы", clinic: "Поликлиники",
  pharmacy: "Аптеки", park: "Парки", fire_station: "Пожарные", bus_stop: "Остановки",
};

export default function CompareDistrictsModal({ open, onClose }: Props) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected([]); setResult(null);
    getDistricts().then(setDistricts).catch(() => {});
  }, [open]);

  const toggle = (id: number) => {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]);
  };

  const run = async () => {
    if (selected.length < 2) return;
    setLoading(true);
    try {
      const r = await compareDistrictsApi(selected);
      setResult(r);
    } finally { setLoading(false); }
  };

  if (!open) return null;

  const isLeader = (metric: string, id: number) =>
    result?.leaders[metric]?.district_id === id;

  const cellStyle = (isLead: boolean) => ({
    padding: "10px 8px",
    borderBottom: "1px solid var(--border)",
    background: isLead ? "rgba(45,212,191,0.08)" : "transparent",
    fontWeight: isLead ? 700 : 500,
    color: isLead ? "var(--brand-1)" : "var(--text-2)",
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1000 }}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ai-avatar" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <IconStats size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Сравнить районы</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Выберите 2-4 района · 20+ метрик бок о бок
              </div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>

        <div className="modal-body" style={{ padding: 24 }}>
          {/* District selection */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1,
                          textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
              Выбор районов ({selected.length}/4)
            </div>
            <div className="chips">
              {districts.map((d) => (
                <button
                  key={d.id}
                  className={`chip ${selected.includes(d.id) ? "active" : ""}`}
                  onClick={() => toggle(d.id)}
                >
                  {d.name_ru.replace(" район", "")}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button className="btn primary"
                      onClick={run}
                      disabled={selected.length < 2 || loading}>
                {loading ? "Сравниваем…" : "Сравнить"}
              </button>
              {result && (
                <button className="btn" onClick={() => { setResult(null); setSelected([]); }}>
                  Сбросить
                </button>
              )}
            </div>
          </div>

          {/* Comparison table */}
          {result && (
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{
                      textAlign: "left", padding: "10px 8px", fontSize: 10,
                      fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase",
                      color: "var(--muted)", borderBottom: "2px solid var(--brand-1)",
                      position: "sticky", left: 0, background: "var(--surface)",
                    }}>Метрика</th>
                    {result.districts.map((d) => (
                      <th key={d.district_id} style={{
                        padding: "10px 8px", fontSize: 12, fontWeight: 800,
                        color: "var(--brand-1)", borderBottom: "2px solid var(--brand-1)",
                        minWidth: 140,
                      }}>
                        {d.district_name.replace(" район", "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <Row label="Население" cells={result.districts.map((d) =>
                    [d.district_id, d.population.toLocaleString("ru-RU")])} isLeaderFn={(id) => isLeader("population", id)} cellStyle={cellStyle} />

                  <Row label="Площадь, км²" cells={result.districts.map((d) =>
                    [d.district_id, d.area_km2 ? d.area_km2.toFixed(1) : "—"])} cellStyle={cellStyle} />

                  <Row label="Плотность, чел/км²" cells={result.districts.map((d) =>
                    [d.district_id, d.density_per_km2 ? Math.round(d.density_per_km2).toLocaleString("ru-RU") : "—"])} cellStyle={cellStyle} />

                  <SectionHead label="Оценки" cols={result.districts.length + 1} />

                  <Row label="🏆 Инфра-оценка (СНиП)" cells={result.districts.map((d) =>
                    [d.district_id, `${d.score_infrastructure}/100`])}
                       isLeaderFn={(id) => isLeader("score_infrastructure", id)}
                       cellStyle={cellStyle} />

                  <Row label="🚶 15-мин город" cells={result.districts.map((d) =>
                    [d.district_id, `${d.score_15min}/100`])}
                       isLeaderFn={(id) => isLeader("score_15min", id)}
                       cellStyle={cellStyle} />

                  <SectionHead label="Экология" cols={result.districts.length + 1} />

                  <Row label="💨 AQI baseline" cells={result.districts.map((d) =>
                    [d.district_id, d.aqi_baseline ?? "—"])}
                       isLeaderFn={(id) => isLeader("aqi_baseline", id)}
                       cellStyle={cellStyle} />

                  <Row label="🌳 Зелень, м²/чел" cells={result.districts.map((d) =>
                    [d.district_id, d.green_m2_per_capita ?? "—"])}
                       isLeaderFn={(id) => isLeader("green_m2_per_capita", id)}
                       cellStyle={cellStyle} />

                  <Row label="🚗 Авто/1К жит." cells={result.districts.map((d) =>
                    [d.district_id, d.traffic_per_1000 ?? "—"])}
                       isLeaderFn={(id) => isLeader("traffic_per_1000", id)}
                       cellStyle={cellStyle} />

                  <SectionHead label="Инфраструктура (факт · покрытие %)" cols={result.districts.length + 1} />

                  {Object.keys(TYPE_LABEL).map((type) => (
                    <Row key={type}
                         label={`${TYPE_EMOJI[type]} ${TYPE_LABEL[type]}`}
                         cells={result.districts.map((d) => {
                           const f = d.facilities_by_type[type];
                           if (!f) return [d.district_id, "—"];
                           const cov = f.coverage_percent;
                           const color = cov >= 100 ? "#10B981" : cov >= 70 ? "#F59E0B" : "#EF4444";
                           return [d.district_id,
                             <span key="v" style={{ color }}>
                               {f.count} · <b>{Math.round(cov)}%</b>
                             </span>];
                         })}
                         cellStyle={cellStyle} />
                  ))}
                </tbody>
              </table>

              <div style={{
                marginTop: 14, padding: "10px 12px",
                borderRadius: 8, background: "rgba(45,212,191,0.06)",
                border: "1px dashed var(--brand-1)", fontSize: 11, color: "var(--text-2)",
              }}>
                💡 <b>Лидеры подсвечены мятным.</b> Для инфра-оценки, 15-мин города
                и зелени — больше = лучше. Для AQI и авто-трафика — меньше = лучше.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, cells, isLeaderFn, cellStyle }: {
  label: string;
  cells: [number, React.ReactNode][];
  isLeaderFn?: (id: number) => boolean;
  cellStyle: (isLead: boolean) => React.CSSProperties;
}) {
  return (
    <tr>
      <td style={{
        padding: "10px 8px", borderBottom: "1px solid var(--border)",
        fontWeight: 600, color: "var(--text-2)",
        position: "sticky", left: 0, background: "var(--surface)",
      }}>
        {label}
      </td>
      {cells.map(([id, value]) => {
        const lead = isLeaderFn ? isLeaderFn(id) : false;
        return (
          <td key={id} style={cellStyle(lead)}>
            {lead && "⭐ "}{value}
          </td>
        );
      })}
    </tr>
  );
}

function SectionHead({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{
        padding: "12px 8px 6px", fontSize: 10, fontWeight: 800,
        letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)",
      }}>
        {label}
      </td>
    </tr>
  );
}
