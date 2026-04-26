import { useEffect, useMemo, useState } from "react";
import {
  downloadPlanPdf, generatePlan, getBusinessCategories, getPlanQuota,
} from "../../services/api";
import type {
  BusinessCategories, BusinessPlan, PlanQuota, PlanRequest,
} from "../../types";
import { IconClose, IconDownload, IconSparkles } from "../shell/Icons";
import { renderMarkdown } from "../ui/markdown";

const DISTRICTS = [
  "Алмалинский район", "Алатауский район", "Ауэзовский район",
  "Бостандыкский район", "Жетысуский район", "Медеуский район",
  "Наурызбайский район", "Турксибский район",
];

type Step = "form" | "loading" | "result" | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCategory?: string | null;
  defaultDistrict?: string | null;
}

export default function BusinessPlanModal({ open, onClose, defaultCategory, defaultDistrict }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [cats, setCats] = useState<BusinessCategories | null>(null);
  const [quota, setQuota] = useState<PlanQuota | null>(null);
  const [plan, setPlan] = useState<BusinessPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [form, setForm] = useState<PlanRequest>({
    category: defaultCategory ?? "cafe",
    district: defaultDistrict ?? null,
    budget_usd: 30_000,
    area_m2: 80,
    experience: "some",
    language: "ru",
    concept: "",
  });

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setPlan(null);
    setError(null);
    getBusinessCategories().then(setCats).catch(() => {});
    getPlanQuota().then(setQuota).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (defaultCategory) setForm((f) => ({ ...f, category: defaultCategory }));
    if (defaultDistrict !== undefined)
      setForm((f) => ({ ...f, district: defaultDistrict }));
  }, [defaultCategory, defaultDistrict]);

  const submit = async () => {
    setStep("loading");
    setError(null);
    try {
      const r = await generatePlan({
        ...form,
        concept: form.concept?.trim() || undefined,
      });
      setPlan(r);
      if (r.quota) setQuota((q) => q ? { ...q, remaining: r.quota!.remaining } : q);
      setStep("result");
    } catch (e: any) {
      const d = e?.response?.data?.detail ?? e?.response?.data ?? {};
      if (e?.response?.status === 429) {
        setError(d?.message ?? "Лимит бесплатных планов исчерпан. Апгрейд до Pro ($29/мес) даст безлимит.");
      } else {
        setError("Не удалось сгенерировать план. Попробуйте позже или смените параметры.");
      }
      setStep("error");
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await downloadPlanPdf({ ...form, concept: form.concept?.trim() || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AQYL_BizPlan_${plan?.summary.category ?? "plan"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("PDF не скачался. Попробуйте ещё раз.");
    } finally {
      setDownloading(false);
    }
  };

  const ru = (n: number) => `$${Math.round(n).toLocaleString("ru-RU")}`;

  const primaryCategories = useMemo(() => {
    if (!cats) return [];
    const order = ["cafe", "coffee_shop", "restaurant", "bakery", "barbershop",
      "beauty_salon", "gym", "convenience", "clothing", "pharmacy_biz",
      "hookah", "coworking", "dentist"];
    return order
      .map((k) => cats.all.find((c) => c.value === k))
      .filter(Boolean) as { value: string; label: string }[];
  }, [cats]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 960 }}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ai-avatar" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <IconSparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>AI Business Plan Generator</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {quota
                  ? `Free tier · осталось ${quota.remaining}/${quota.quota_per_hour} в час`
                  : "AQYL AI · готовит бизнес-план за 30 секунд"}
              </div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          {step === "form" && (
            <div style={{ padding: 28 }}>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 22, lineHeight: 1.6 }}>
                AQYL AI проанализирует <b>рынок</b>, <b>конкурентов</b>, <b>демографию</b> района и
                соберёт бизнес-план на 5-8 страниц с финансовой моделью —
                пригодный для подачи в <b>Kaspi</b>, <b>Halyk</b> или инвестору.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <Field label="Категория бизнеса">
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {primaryCategories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                    {cats?.all
                      .filter((c) => !primaryCategories.find((p) => p.value === c.value))
                      .map((c) => (
                        <option key={c.value} value={c.value}>— {c.label}</option>
                      ))}
                  </select>
                </Field>

                <Field label="Район (или автоподбор)">
                  <select
                    className="input"
                    value={form.district ?? ""}
                    onChange={(e) => setForm({ ...form, district: e.target.value || null })}
                  >
                    <option value="">🤖 Автоподбор лучшего района</option>
                    {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>

                <Field label="Стартовый бюджет, $">
                  <input
                    type="number" min={1000} max={5000000} step={1000}
                    className="input"
                    value={form.budget_usd}
                    onChange={(e) => setForm({ ...form, budget_usd: Number(e.target.value) || 0 })}
                  />
                </Field>

                <Field label="Площадь помещения, м²">
                  <input
                    type="number" min={10} max={2000} step={5}
                    className="input"
                    value={form.area_m2}
                    onChange={(e) => setForm({ ...form, area_m2: Number(e.target.value) || 0 })}
                  />
                </Field>

                <Field label="Ваш опыт">
                  <select
                    className="input"
                    value={form.experience}
                    onChange={(e) => setForm({ ...form, experience: e.target.value as any })}
                  >
                    <option value="none">Впервые открываю бизнес</option>
                    <option value="some">Есть опыт в малом бизнесе</option>
                    <option value="experienced">Серийный предприниматель</option>
                  </select>
                </Field>

                <Field label="Язык отчёта">
                  <select
                    className="input"
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value as any })}
                  >
                    <option value="ru">Русский</option>
                    <option value="kz" disabled>Қазақша (скоро)</option>
                    <option value="en" disabled>English (скоро)</option>
                  </select>
                </Field>
              </div>

              <div style={{ marginTop: 18 }}>
                <Field label="Концепция (опционально) — AI встроит её в план">
                  <textarea
                    className="input"
                    placeholder="Например: уютная авторская кофейня с завтраками для IT-публики, upper-middle сегмент, фокус на спешалти кофе"
                    rows={3}
                    value={form.concept ?? ""}
                    onChange={(e) => setForm({ ...form, concept: e.target.value })}
                  />
                </Field>
              </div>

              <div style={{
                marginTop: 20, display: "flex", gap: 10, alignItems: "center",
                padding: "14px 16px",
                background: "linear-gradient(135deg, rgba(45,212,191,0.08), rgba(34,211,238,0.04))",
                border: "1px solid rgba(45,212,191,0.25)",
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>
                  <b style={{ color: "var(--brand-1)" }}>Pro план · $29/мес</b> — безлимит,
                  расширенная финансовая модель, мониторинг открытия конкурентов, экспорт в DOCX.
                </div>
                <button className="btn sm" disabled style={{ opacity: 0.6 }}>
                  Scooro
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button className="btn" onClick={onClose}>Отмена</button>
                <button
                  className="btn primary"
                  onClick={submit}
                  disabled={!form.category || !form.budget_usd || !form.area_m2 || (quota?.remaining === 0)}
                >
                  <IconSparkles size={14} />
                  {quota?.remaining === 0 ? "Лимит исчерпан" : "Сгенерировать план"}
                </button>
              </div>
            </div>
          )}

          {step === "loading" && (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div className="ai-avatar" style={{
                width: 56, height: 56, borderRadius: 14, margin: "0 auto 20px",
                animation: "spin 2.5s linear infinite",
              }}>
                <IconSparkles size={26} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                AQYL AI собирает данные рынка…
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>
                Анализирую конкурентов в районе, население, плотность категории,
                индекс насыщенности. Генерирую структурированный план. 20-40 секунд.
              </div>
            </div>
          )}

          {step === "result" && plan && (
            <div>
              {/* Summary stats */}
              <div style={{ padding: "18px 28px", borderBottom: "1px solid var(--border)",
                            background: "linear-gradient(135deg, rgba(45,212,191,0.06), rgba(34,211,238,0.02))" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  <Stat label="CAPEX" value={ru(plan.summary.capex_usd)} color="var(--brand-1)" />
                  <Stat label="OPEX/мес" value={ru(plan.summary.opex_monthly_usd)} color="var(--brand-2)" />
                  <Stat label="BEP" value={`${plan.summary.break_even_months} мес`} color="#A855F7" />
                  <Stat
                    label="Чист. год 1"
                    value={ru(plan.summary.net_year_1_usd)}
                    color={plan.summary.net_year_1_usd > 0 ? "#10B981" : "#EF4444"}
                  />
                </div>
                {plan.summary.district && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
                    📍 <b>{plan.summary.district}</b> ·
                    конкуренция в радиусе 1 км: <b>{competitionLabel(plan.summary.competition_level)}</b>
                    {plan.summary.competitors_nearby != null &&
                      ` (${plan.summary.competitors_nearby} конкурентов)`}
                  </div>
                )}
              </div>

              {/* Markdown body */}
              <div className="md-content" style={{ padding: "20px 28px", maxHeight: "50vh", overflowY: "auto" }}
                   dangerouslySetInnerHTML={{ __html: renderMarkdown(plan.markdown) }} />
            </div>
          )}

          {step === "error" && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>⚠️</div>
              <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 6, fontWeight: 600 }}>
                Не получилось
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
                {error}
              </div>
            </div>
          )}
        </div>

        {step === "result" && plan && (
          <div className="modal-foot">
            <div style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>
              Движок: {plan.engine}
              {quota && ` · осталось ${quota.remaining}/${quota.quota_per_hour} бесплатных планов/час`}
            </div>
            <button className="btn" onClick={() => setStep("form")}>Новый план</button>
            <button className="btn primary" onClick={download} disabled={downloading}>
              <IconDownload size={14} /> {downloading ? "Готовим PDF…" : "Скачать PDF"}
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="modal-foot">
            <button className="btn" onClick={onClose}>Закрыть</button>
            <button className="btn primary" onClick={() => setStep("form")}>Попробовать снова</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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

function competitionLabel(v: string | null): string {
  if (!v) return "—";
  return { low: "низкая", medium: "средняя", high: "высокая" }[v] ?? v;
}
