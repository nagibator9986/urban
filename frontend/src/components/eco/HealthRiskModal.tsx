import { useEffect, useMemo, useState } from "react";
import { IconClose, IconSparkles } from "../shell/Icons";
import { computeHealthRisk, getHealthRiskMeta } from "../../services/api";
import type {
  HealthRiskMeta, HealthRiskRequest, HealthRiskResponse,
} from "../../types";
import { useUserProfile, saveProfile, loadProfile, emitProfileUpdated } from "../../lib/userProfile";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDistrict: string | null;
  availableDistricts: string[];
}

const DEFAULT_FORM: HealthRiskRequest = {
  district: "Алмалинский район",
  age_group: "adult",
  conditions: [],
  activities: [],
  commute: "public",
  smoker: false,
  has_purifier: false,
  wears_mask_n95: false,
  hours_outdoor_per_day: 2,
};

export default function HealthRiskModal({
  open, onClose, defaultDistrict, availableDistricts,
}: Props) {
  const [meta, setMeta] = useState<HealthRiskMeta | null>(null);
  const [profile] = useUserProfile();
  const [form, setForm] = useState<HealthRiskRequest>(() => {
    const p = loadProfile();
    return {
      district: p.home_district ?? defaultDistrict ?? DEFAULT_FORM.district,
      age_group: p.age_group,
      conditions: p.conditions,
      activities: p.activities,
      commute: p.commute,
      smoker: p.smoker,
      has_purifier: p.has_purifier,
      wears_mask_n95: p.wears_mask_n95,
      hours_outdoor_per_day: p.hours_outdoor_per_day,
    };
  });
  const [result, setResult] = useState<HealthRiskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    if (!open) return;
    if (meta) return;
    getHealthRiskMeta().then(setMeta).catch(() => {});
  }, [open, meta]);

  // When modal opens, refresh form from latest profile
  useEffect(() => {
    if (!open) return;
    setForm({
      district: profile.home_district ?? defaultDistrict ?? DEFAULT_FORM.district,
      age_group: profile.age_group,
      conditions: profile.conditions,
      activities: profile.activities,
      commute: profile.commute,
      smoker: profile.smoker,
      has_purifier: profile.has_purifier,
      wears_mask_n95: profile.wears_mask_n95,
      hours_outdoor_per_day: profile.hours_outdoor_per_day,
    });
  }, [open, defaultDistrict, profile]);

  const saveToProfile = () => {
    const p = loadProfile();
    saveProfile({
      ...p,
      home_district: form.district,
      age_group: form.age_group,
      conditions: form.conditions,
      activities: form.activities,
      commute: form.commute,
      smoker: form.smoker,
      has_purifier: form.has_purifier,
      wears_mask_n95: form.wears_mask_n95,
      hours_outdoor_per_day: form.hours_outdoor_per_day,
    });
    emitProfileUpdated();
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 1800);
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await computeHealthRisk(form));
    } catch (e: any) {
      setError(e?.message ?? "Не удалось посчитать");
    } finally {
      setLoading(false);
    }
  };

  const toggleIn = (field: "conditions" | "activities", value: string) => {
    setForm((f) => {
      const set = new Set(f[field]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...f, [field]: Array.from(set) };
    });
  };

  const severityColor = useMemo(() => {
    if (!result) return "#64748B";
    return (
      { critical: "#EF4444", high: "#F97316", moderate: "#FBBF24", low: "#10B981" }[
        result.severity
      ] ?? "#64748B"
    );
  }, [result]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 860, width: "94%", maxHeight: "92vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>🩺 Калькулятор персонального эко-риска</h2>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Детерминированный score 0-100 · основа: GBD 2019, WHO AQG 2021
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* FORM */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="section-title">Район</span>
              <select
                value={form.district}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                className="select"
                style={selectStyle}
              >
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="section-title">Возраст</span>
              <select
                value={form.age_group}
                onChange={(e) => setForm((f) => ({ ...f, age_group: e.target.value as any }))}
                style={selectStyle}
              >
                {(meta?.age_groups ?? []).map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </label>

            <div>
              <div className="section-title">Хронические состояния</div>
              <div className="chips" style={{ marginTop: 6 }}>
                {(meta?.conditions ?? []).map((c) => (
                  <button
                    key={c.value}
                    className={`chip ${form.conditions.includes(c.value) ? "active" : ""}`}
                    onClick={() => toggleIn("conditions", c.value)}
                    title={`+${c.risk_points} к риску`}
                  >
                    {c.label} {c.risk_points && <span style={{ opacity: 0.6, marginLeft: 4 }}>+{c.risk_points}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="section-title">Активности на улице</div>
              <div className="chips" style={{ marginTop: 6 }}>
                {(meta?.activities ?? []).map((a) => (
                  <button
                    key={a.value}
                    className={`chip ${form.activities.includes(a.value) ? "active" : ""}`}
                    onClick={() => toggleIn("activities", a.value)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="section-title">Транспорт</span>
                <select
                  value={form.commute}
                  onChange={(e) => setForm((f) => ({ ...f, commute: e.target.value as any }))}
                  style={selectStyle}
                >
                  {(meta?.commute_modes ?? []).map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="section-title">Часов на улице/день</span>
                <input
                  type="number" min={0} max={16} step={0.5}
                  value={form.hours_outdoor_per_day}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hours_outdoor_per_day: Number(e.target.value) || 0 }))
                  }
                  style={selectStyle}
                />
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={checkStyle}>
                <input type="checkbox" checked={form.smoker}
                       onChange={(e) => setForm((f) => ({ ...f, smoker: e.target.checked }))} />
                Курю
              </label>
              <label style={checkStyle}>
                <input type="checkbox" checked={form.has_purifier}
                       onChange={(e) => setForm((f) => ({ ...f, has_purifier: e.target.checked }))} />
                Дома очиститель HEPA
              </label>
              <label style={checkStyle}>
                <input type="checkbox" checked={form.wears_mask_n95}
                       onChange={(e) => setForm((f) => ({ ...f, wears_mask_n95: e.target.checked }))} />
                Ношу N95/KN95 на улице в плохие дни
              </label>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button className="cta-gradient" onClick={run} disabled={loading} style={{ flex: 1 }}>
                <IconSparkles size={14} />
                {loading ? "Считаем…" : "Рассчитать"}
              </button>
              <button className="btn ghost sm" onClick={saveToProfile}
                      title="Сохранить эти данные в мой профиль (для AI-помощника)">
                {saveStatus === "saved" ? "✓ В профиль" : "💾 В профиль"}
              </button>
            </div>
            {error && <div style={{ color: "#EF4444", fontSize: 12 }}>{error}</div>}
          </div>

          {/* RESULT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!result && (
              <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>🩺</div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>
                  Заполните форму и нажмите «Рассчитать». Результат детерминирован:
                  одинаковые входные данные → одинаковый score.
                </div>
              </div>
            )}
            {result && (
              <>
                <div
                  className="card"
                  style={{
                    textAlign: "center", borderTop: `4px solid ${severityColor}`,
                    padding: "24px 20px",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase" }}>
                    Персональный риск
                  </div>
                  <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: severityColor, margin: "8px 0" }}>
                    {result.score}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>из 100</div>
                  <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700 }}>
                    {result.severity_label}
                  </div>
                </div>

                <div className="card">
                  <div className="card-title">🧬 Разбор: откуда пришёл score</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {result.drivers.map((d) => (
                      <DriverRow key={d.key} driver={d} />
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-title">💡 Что делать сегодня</div>
                  <ul style={{ margin: "10px 0 0 18px", padding: 0, fontSize: 13, lineHeight: 1.55 }}>
                    {result.recommendations.map((r, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.4 }}>
                  <b>Методология:</b> {result.methodology}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverRow({ driver }: { driver: { label: string; points: number; percent_of_score: number } }) {
  const negative = driver.points < 0;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)",
      border: "1px solid var(--border)", fontSize: 12,
    }}>
      <span>{driver.label}</span>
      <span style={{ fontWeight: 800, color: negative ? "#10B981" : "#EF4444" }}>
        {driver.points > 0 ? "+" : ""}{driver.points}
        <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500, marginLeft: 4 }}>
          ({driver.percent_of_score}%)
        </span>
      </span>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text, #E5E7EB)",
  fontSize: 13,
};

const checkStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 13, color: "var(--text, #E5E7EB)",
  cursor: "pointer",
};
