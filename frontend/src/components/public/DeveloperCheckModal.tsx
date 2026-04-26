import { useEffect, useState } from "react";
import {
  developerCheck, downloadDeveloperCheckPdf,
} from "../../services/api";
import type { DeveloperCheckReport, DeveloperCheckRequest } from "../../types";
import { IconClose, IconDownload, IconSparkles } from "../shell/Icons";

const DISTRICTS = [
  "Алмалинский район", "Алатауский район", "Ауэзовский район",
  "Бостандыкский район", "Жетысуский район", "Медеуский район",
  "Наурызбайский район", "Турксибский район",
];

const RISK_COLOR: Record<string, string> = {
  low: "#10B981", medium: "#F59E0B", high: "#EF4444",
};
const RISK_LABEL: Record<string, string> = {
  low: "Низкий", medium: "Средний", high: "Высокий",
};

type Step = "form" | "loading" | "result" | "error";

interface Props { open: boolean; onClose: () => void; defaultDistrict?: string | null; }

const TYPE_EMOJI: Record<string, string> = {
  school: "🎓", kindergarten: "🧸", clinic: "🩺",
  pharmacy: "💊", park: "🌳", bus_stop: "🚌",
};

export default function DeveloperCheckModal({ open, onClose, defaultDistrict }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [report, setReport] = useState<DeveloperCheckReport | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<DeveloperCheckRequest>({
    district: defaultDistrict ?? "Алмалинский район",
    apartments: 500,
    class_type: "comfort",
    has_own_school: false,
    has_own_kindergarten: false,
    has_own_clinic: false,
  });

  useEffect(() => {
    if (!open) return;
    setStep("form"); setReport(null); setErr(null);
    if (defaultDistrict) setForm((f) => ({ ...f, district: defaultDistrict }));
  }, [open, defaultDistrict]);

  const submit = async () => {
    setStep("loading"); setErr(null);
    try {
      const r = await developerCheck(form);
      setReport(r);
      setStep("result");
    } catch (e: any) {
      setErr("Не удалось рассчитать. Попробуйте снова.");
      setStep("error");
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await downloadDeveloperCheckPdf(form);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AQYL_DeveloperCheck_${form.district}_${form.apartments}apts.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  };

  if (!open) return null;
  const ru = (n: number) => n.toLocaleString("ru-RU");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 880 }}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ai-avatar" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <IconSparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Developer Pre-check</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Оценка нагрузки нового ЖК на инфраструктуру · для банка и акимата
              </div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          {step === "form" && (
            <div style={{ padding: 28 }}>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 18, lineHeight: 1.6 }}>
                AI оценит: <b>сколько новых жителей</b> даст проект, <b>какая доп. инфраструктура</b>
                понадобится, <b>просядет ли оценка района</b> и каков <b>риск-уровень</b> для банка.
                В результате — <b>3-страничный PDF</b>, который можно приложить к проектной декларации.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <Field label="Район строительства">
                  <select className="input" value={form.district}
                          onChange={(e) => setForm({ ...form, district: e.target.value })}>
                    {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </Field>

                <Field label="Количество квартир">
                  <input type="number" min={10} max={50000} step={50}
                         className="input" value={form.apartments}
                         onChange={(e) => setForm({ ...form, apartments: Number(e.target.value) })} />
                </Field>

                <Field label="Класс недвижимости">
                  <select className="input" value={form.class_type}
                          onChange={(e) => setForm({ ...form, class_type: e.target.value as any })}>
                    <option value="economy">Эконом</option>
                    <option value="comfort">Комфорт</option>
                    <option value="business">Бизнес</option>
                    <option value="premium">Премиум</option>
                  </select>
                </Field>

                <div />

                <Field label="Компенсационные меры" full>
                  <div className="chips">
                    <button className={`chip ${form.has_own_school ? "active" : ""}`}
                            onClick={() => setForm({ ...form, has_own_school: !form.has_own_school })}>
                      🎓 Встроенная школа
                    </button>
                    <button className={`chip ${form.has_own_kindergarten ? "active" : ""}`}
                            onClick={() => setForm({ ...form, has_own_kindergarten: !form.has_own_kindergarten })}>
                      🧸 Встроенный детсад
                    </button>
                    <button className={`chip ${form.has_own_clinic ? "active" : ""}`}
                            onClick={() => setForm({ ...form, has_own_clinic: !form.has_own_clinic })}>
                      🩺 Встроенная клиника
                    </button>
                  </div>
                </Field>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button className="btn" onClick={onClose}>Отмена</button>
                <button className="cta-gradient" onClick={submit}>
                  <IconSparkles size={14} /> Рассчитать нагрузку
                </button>
              </div>
            </div>
          )}

          {step === "loading" && (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div className="ai-avatar" style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto 20px" }}>
                <IconSparkles size={26} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                Считаем нагрузку на район…
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 420, margin: "6px auto", lineHeight: 1.6 }}>
                Оцениваем демографию новых жителей, потребность в соц. объектах по СНиП,
                просадку инфра-оценки района и риск для банка-кредитора.
              </div>
            </div>
          )}

          {step === "error" && (
            <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>{err}</div>
          )}

          {step === "result" && report && (
            <div>
              {/* Top stats */}
              <div style={{ padding: "16px 28px", borderBottom: "1px solid var(--border)",
                            background: `${RISK_COLOR[report.risk.level]}10`,
                            display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                <Stat label="Новых жителей" value={ru(report.new_residents)} color="#2DD4BF" />
                <Stat label="Детей 0–6" value={ru(report.demographics.kids_0_6)} color="#22D3EE" />
                <Stat label="Детей 6–18" value={ru(report.demographics.kids_6_18)} color="#A855F7" />
                <Stat label="Δ оценка района"
                      value={`${report.score_impact.delta_with_mitigation >= 0 ? "+" : ""}${report.score_impact.delta_with_mitigation}`}
                      color={RISK_COLOR[report.risk.level]} />
              </div>

              {/* Risk */}
              <div style={{ padding: "14px 28px",
                            background: RISK_COLOR[report.risk.level],
                            color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 }}>
                  Риск для банка-кредитора
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>
                  {RISK_LABEL[report.risk.level]}
                </div>
                <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5, opacity: 0.95 }}>
                  {report.risk.label}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "20px 28px", maxHeight: "42vh", overflowY: "auto" }}>
                {/* Score impact */}
                <div style={{ marginBottom: 20 }}>
                  <div className="card-title">Влияние на оценку района</div>
                  <div style={{ display: "flex", gap: 18, fontSize: 13 }}>
                    <div>До: <b>{report.score_impact.before}/100</b></div>
                    <div>→</div>
                    <div style={{ color: RISK_COLOR[report.risk.level] }}>
                      После (без мер): <b>{report.score_impact.after_no_mitigation}/100</b>
                      {" "}({report.score_impact.delta_no_mitigation >= 0 ? "+" : ""}{report.score_impact.delta_no_mitigation})
                    </div>
                    <div style={{ color: "var(--brand-1)" }}>
                      С компенсациями: <b>{report.score_impact.after_with_mitigation}/100</b>
                      {" "}({report.score_impact.delta_with_mitigation >= 0 ? "+" : ""}{report.score_impact.delta_with_mitigation})
                    </div>
                  </div>
                </div>

                {/* Requirements */}
                <div style={{ marginBottom: 20 }}>
                  <div className="card-title">Потребность в инфраструктуре</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
                    {report.requirements.map((r) => (
                      <div key={r.facility_type} style={{
                        padding: "10px 12px", borderRadius: 10,
                        background: "var(--surface-2)", border: "1px solid var(--border)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 18 }}>{TYPE_EMOJI[r.facility_type] ?? "·"}</span>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</div>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                          {r.extra_facilities_rounded > 0
                            ? <><b style={{ color: "var(--brand-1)" }}>+{r.extra_facilities_rounded}</b> объект{r.extra_facilities_rounded > 1 ? "ов" : ""}</>
                            : <span style={{ color: "var(--success)" }}>✓ в норме</span>}
                        </div>
                        {r.extra_capacity_needed > 0 && (
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                            +{ru(r.extra_capacity_needed)} {r.capacity_unit}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
                          {r.typical_cost_usd}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommendations */}
                <div>
                  <div className="card-title">Рекомендации</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {report.recommendations.map((r, i) => (
                      <div key={i} style={{
                        padding: "10px 12px", borderRadius: 8,
                        background: "rgba(45,212,191,0.05)",
                        border: "1px solid rgba(45,212,191,0.25)",
                        fontSize: 12, color: "var(--text-2)", lineHeight: 1.5,
                      }}>{r}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {step === "result" && report && (
          <div className="modal-foot">
            <div style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>
              Отчёт готов к подаче в банк и акимат
            </div>
            <button className="btn" onClick={() => setStep("form")}>Новый расчёт</button>
            <button className="btn primary" onClick={download} disabled={downloading}>
              <IconDownload size={14} /> {downloading ? "Готовим PDF…" : "Скачать PDF"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: full ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)",
                     textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: "var(--surface-2)", border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4,
                    letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
    </div>
  );
}
