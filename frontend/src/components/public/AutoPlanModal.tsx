import { useEffect, useState } from "react";
import { IconClose, IconSparkles } from "../shell/Icons";
import { autoPlan, autoPlanPareto } from "../../services/api";
import { FACILITY_LABELS, FACILITY_EMOJI } from "../../types";
import type {
  AutoPlanParetoPlan, AutoPlanParetoResponse, AutoPlanResponse, FacilityType,
} from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  districtId: number | null;
  districtName: string | null;
  onApplyAdditions: (additions: Record<string, number>) => void;
}

type ViewMode = "single" | "pareto";

export default function AutoPlanModal({
  open, onClose, districtId, districtName, onApplyAdditions,
}: Props) {
  const [mode, setMode] = useState<ViewMode>("pareto");
  const [targetScore, setTargetScore] = useState(85);
  const [data, setData] = useState<AutoPlanResponse | null>(null);
  const [pareto, setPareto] = useState<AutoPlanParetoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setPareto(null);
  }, [open, districtId]);

  const run = async () => {
    if (!districtId) return;
    setLoading(true);
    setErr(null);
    try {
      if (mode === "single") {
        setData(await autoPlan(districtId, targetScore));
        setPareto(null);
      } else {
        setPareto(await autoPlanPareto(districtId));
        setData(null);
      }
    } catch (e: any) {
      setErr(e?.message ?? "failed");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: "94%", maxHeight: "92vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>🎯 Умный авто-план для грейда A</h2>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {districtName ?? "—"} · жадный алгоритм по нормативам СНиП РК
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button className={`pill-btn ${mode === "pareto" ? "primary" : ""}`}
                  style={{ fontSize: 11 }}
                  onClick={() => setMode("pareto")}>
            🎯 Pareto (3 плана)
          </button>
          <button className={`pill-btn ${mode === "single" ? "primary" : ""}`}
                  style={{ fontSize: 11 }}
                  onClick={() => setMode("single")}>
            📐 Одна цель
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          {mode === "single" && (
            <label style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>
              Целевая оценка: <strong style={{ color: "var(--brand-1)" }}>{targetScore}/100</strong>
              <input
                type="range"
                min={50} max={95} step={1}
                value={targetScore}
                onChange={(e) => setTargetScore(Number(e.target.value))}
                style={{ marginLeft: 8, verticalAlign: "middle", width: 180 }}
              />
            </label>
          )}
          {mode === "pareto" && (
            <div style={{ flex: 1, fontSize: 12, color: "var(--muted)" }}>
              Получите <b>3 плана</b>: бюджетный (B), сбалансированный (A), премиум (A+).
              Сравните стоимость vs эффект и выберите свой.
            </div>
          )}
          <button className="cta-gradient" onClick={run} disabled={loading || !districtId}>
            <IconSparkles size={14} />
            {loading ? "Считаем…" : "Запустить"}
          </button>
        </div>

        {err && <div style={{ color: "#EF4444", fontSize: 12 }}>{err}</div>}

        {pareto && (
          <ParetoPlansView
            pareto={pareto}
            onApply={(adds) => { onApplyAdditions(adds); onClose(); }}
          />
        )}

        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card" style={{ borderLeft: `4px solid ${data.reached_target ? "#10B981" : "#F59E0B"}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
                <Kpi label="Было" value={`${data.initial_score}/100`} />
                <Kpi label="Станет" value={`${data.final_score}/100`} color="#10B981" />
                <Kpi label="Шагов" value={String(data.steps_taken)} />
                <Kpi label="Цель достигнута" value={data.reached_target ? "Да" : "Нет"} />
              </div>
            </div>

            <div className="card">
              <div className="card-title">📦 Что нужно добавить</div>
              {Object.keys(data.additions).length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  Район уже соответствует целевой оценке — ничего добавлять не нужно.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {Object.entries(data.additions).map(([t, n]) => (
                    <div key={t} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 10px", borderRadius: 8,
                      background: "var(--surface-2)", border: "1px solid var(--border)",
                      fontSize: 13,
                    }}>
                      <span>
                        {FACILITY_EMOJI[t as FacilityType] ?? ""}
                        {" "}{FACILITY_LABELS[t as FacilityType] ?? t}
                      </span>
                      <span style={{ fontWeight: 800 }}>+{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.capex_estimate.lines.length > 0 && (
              <div className="card">
                <div className="card-title">💰 Оценка CAPEX</div>
                <div className="table-scroll" style={{ marginTop: 8 }}>
                <table style={{ width: "100%", fontSize: 12, minWidth: 480 }}>
                  <thead>
                    <tr style={{ color: "var(--muted)" }}>
                      <th style={{ textAlign: "left", padding: "4px 0" }}>Объект</th>
                      <th style={{ textAlign: "right" }}>Кол-во</th>
                      <th style={{ textAlign: "right" }}>Цена/ед.</th>
                      <th style={{ textAlign: "right" }}>Мин</th>
                      <th style={{ textAlign: "right" }}>Макс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.capex_estimate.lines.map((l) => (
                      <tr key={l.facility_type} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "4px 0" }}>{l.label}</td>
                        <td style={{ textAlign: "right" }}>{l.count}</td>
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>{l.unit_capex_label}</td>
                        <td style={{ textAlign: "right" }}>${l.line_min_usd.toLocaleString()}</td>
                        <td style={{ textAlign: "right" }}>${l.line_max_usd.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 700 }}>
                      <td style={{ padding: "6px 0" }}>ИТОГО</td>
                      <td />
                      <td />
                      <td style={{ textAlign: "right" }}>${data.capex_estimate.total_min_usd.toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>${data.capex_estimate.total_max_usd.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
            )}

            <button
              className="cta-gradient"
              onClick={() => {
                onApplyAdditions(data.additions);
                onClose();
              }}
              disabled={Object.keys(data.additions).length === 0}
            >
              <IconSparkles size={14} /> Применить в симуляторе
            </button>

            <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
              {data.methodology}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{
        fontSize: 10, color: "var(--muted)", fontWeight: 700,
        letterSpacing: 0.6, textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: color ?? "var(--text, #E5E7EB)" }}>
        {value}
      </div>
    </div>
  );
}

function ParetoPlansView({
  pareto, onApply,
}: {
  pareto: AutoPlanParetoResponse;
  onApply: (additions: Record<string, number>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Текущая оценка района <b>{pareto.district_name}</b>:{" "}
        <strong style={{ color: "var(--brand-1)" }}>{pareto.current_score}/100</strong>.
        Выберите план под ваш бюджет:
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 10,
      }}>
        {pareto.plans.map((p) => (
          <ParetoPlanCard key={p.key} plan={p} onApply={() => onApply(p.additions)} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
        {pareto.methodology}
      </div>
    </div>
  );
}

function ParetoPlanCard({
  plan, onApply,
}: {
  plan: AutoPlanParetoPlan;
  onApply: () => void;
}) {
  const cap = plan.capex_estimate;
  const totalAdds = plan.total_objects;
  return (
    <div className="card" style={{
      borderLeft: `4px solid ${plan.color}`,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: plan.color }}>{plan.label}</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{plan.description}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Kpi label="Оценка" value={`${plan.final_score}/100`} color={plan.color} />
        <Kpi label="Объектов" value={String(totalAdds)} />
      </div>

      <div style={{
        padding: 8, borderRadius: 8,
        background: "var(--surface-2)", border: "1px solid var(--border)",
      }}>
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700,
                      letterSpacing: 0.6, textTransform: "uppercase" }}>
          CAPEX
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>
          ${(cap.total_min_usd / 1_000_000).toFixed(1)}–{(cap.total_max_usd / 1_000_000).toFixed(1)}M
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
          Δ score: <span style={{ color: plan.color, fontWeight: 700 }}>+{plan.score_delta}</span>
        </div>
      </div>

      {/* What's added */}
      {Object.keys(plan.additions).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {Object.entries(plan.additions).map(([t, n]) => (
            <div key={t} style={{
              fontSize: 11, padding: "4px 6px",
              background: "var(--surface-2)", borderRadius: 4,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>{FACILITY_EMOJI[t as FacilityType] ?? ""}{" "}{FACILITY_LABELS[t as FacilityType] ?? t}</span>
              <span style={{ fontWeight: 700 }}>+{n}</span>
            </div>
          ))}
        </div>
      )}

      <button
        className="cta-gradient"
        style={{ marginTop: "auto" }}
        disabled={totalAdds === 0}
        onClick={onApply}
      >
        Применить план
      </button>
    </div>
  );
}
