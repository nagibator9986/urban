import { useEffect, useState } from "react";
import { getPersonalBrief } from "../../services/api";
import type { PersonalBrief, PersonaInput } from "../../types";
import { IconClose, IconSparkles } from "../shell/Icons";
import { renderMarkdown } from "../ui/markdown";
import {
  emitProfileUpdated, loadProfile, saveProfile, useUserProfile,
} from "../../lib/userProfile";

const DISTRICTS = [
  "Алмалинский район", "Алатауский район", "Ауэзовский район",
  "Бостандыкский район", "Жетысуский район", "Медеуский район",
  "Наурызбайский район", "Турксибский район",
];

const CONDITIONS: { value: string; label: string; icon: string }[] = [
  { value: "asthma",    label: "Астма",           icon: "🫁" },
  { value: "copd",      label: "ХОБЛ",            icon: "💨" },
  { value: "allergy",   label: "Аллергия",        icon: "🤧" },
  { value: "heart",     label: "Сердце/сосуды",   icon: "❤️" },
  { value: "pregnancy", label: "Беременность",    icon: "🤰" },
  { value: "children",  label: "Дети до 6 лет",   icon: "👶" },
  { value: "diabetes",  label: "Диабет",          icon: "🩸" },
];

const ACTIVITIES: { value: string; label: string; icon: string }[] = [
  { value: "running",      label: "Бег",                    icon: "🏃" },
  { value: "cycling",      label: "Велосипед",              icon: "🚴" },
  { value: "walking_dog",  label: "Выгул собаки",           icon: "🐕" },
  { value: "gym",          label: "Зал",                    icon: "🏋️" },
  { value: "kids_outdoor", label: "Прогулки с детьми",      icon: "🧒" },
  { value: "yoga_outdoor", label: "Йога на улице",          icon: "🧘" },
  { value: "commute_bike", label: "Велосипед на работу",    icon: "🚲" },
];

type Step = "form" | "loading" | "result";

interface Props { open: boolean; onClose: () => void; defaultDistrict?: string | null; }

const RISK_COLOR: Record<string, string> = {
  critical: "#7F1D1D", high: "#EF4444", moderate: "#F59E0B", low: "#10B981",
};
const RISK_LABEL: Record<string, string> = {
  critical: "Критический", high: "Высокий", moderate: "Умеренный", low: "Низкий",
};

export default function PersonalBriefModal({ open, onClose, defaultDistrict }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [brief, setBrief] = useState<PersonalBrief | null>(null);
  const [profile] = useUserProfile();
  const [form, setForm] = useState<PersonaInput>(() => ({
    district: profile.home_district ?? defaultDistrict ?? "Медеуский район",
    age_group: profile.age_group ?? "adult",
    conditions: profile.conditions.length > 0 ? profile.conditions : [],
    activities: profile.activities.length > 0 ? profile.activities : ["walking_dog"],
    commute: profile.commute ?? "public",
    smoker: profile.smoker,
    has_purifier: profile.has_purifier,
  }));

  useEffect(() => {
    if (!open) return;
    setStep("form"); setBrief(null);
    // Re-load from profile each time modal opens (profile may have changed)
    setForm({
      district: profile.home_district ?? defaultDistrict ?? "Медеуский район",
      age_group: profile.age_group,
      conditions: profile.conditions,
      activities: profile.activities.length > 0 ? profile.activities : ["walking_dog"],
      commute: profile.commute,
      smoker: profile.smoker,
      has_purifier: profile.has_purifier,
    });
  }, [open, defaultDistrict, profile]);

  const toggle = (key: "conditions" | "activities", v: string) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v],
    }));
  };

  const [savedToProfile, setSavedToProfile] = useState(false);

  const submit = async () => {
    setStep("loading");
    try {
      const r = await getPersonalBrief(form);
      setBrief(r);
      setStep("result");
    } catch {
      setStep("form");
    }
  };

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
    });
    emitProfileUpdated();
    setSavedToProfile(true);
    setTimeout(() => setSavedToProfile(false), 1800);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ai-avatar" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <IconSparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Персональный эко-бриф</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                AQYL Health AI · совет на сегодня под ваш профиль здоровья
              </div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          {step === "form" && (
            <div style={{ padding: 28 }}>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 18, lineHeight: 1.6 }}>
                AI соберёт <b>текущий AQI</b>, <b>прогноз 24ч</b>, <b>источники загрязнения</b> в
                вашем районе и ваш профиль — и выдаст конкретные рекомендации: когда гулять,
                когда проветривать, что делать астматикам и бегунам.
              </div>

              <Section title="📍 Район и возраст">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label>
                    <div className="lbl">Район</div>
                    <select className="input" value={form.district}
                            onChange={(e) => setForm({ ...form, district: e.target.value })}>
                      {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </label>
                  <label>
                    <div className="lbl">Возраст</div>
                    <select className="input" value={form.age_group}
                            onChange={(e) => setForm({ ...form, age_group: e.target.value as any })}>
                      <option value="child">До 12 лет</option>
                      <option value="teen">Подросток</option>
                      <option value="adult">Взрослый</option>
                      <option value="senior">65+</option>
                    </select>
                  </label>
                </div>
              </Section>

              <Section title="🏥 Состояние здоровья (отметьте что актуально)">
                <div className="chips">
                  {CONDITIONS.map((c) => (
                    <button key={c.value}
                            className={`chip ${form.conditions.includes(c.value) ? "active" : ""}`}
                            onClick={() => toggle("conditions", c.value)}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="🏃 Ваши активности">
                <div className="chips">
                  {ACTIVITIES.map((a) => (
                    <button key={a.value}
                            className={`chip ${form.activities.includes(a.value) ? "active" : ""}`}
                            onClick={() => toggle("activities", a.value)}>
                      {a.icon} {a.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="🚗 Добираетесь до работы/учёбы">
                <div className="chips">
                  {[
                    ["car", "🚗 Авто"],
                    ["public", "🚌 Общ. транспорт"],
                    ["walk", "🚶 Пешком"],
                    ["bike", "🚴 Велосипед"],
                    ["none", "🏡 Работаю из дома"],
                  ].map(([v, l]) => (
                    <button key={v}
                            className={`chip ${form.commute === v ? "active" : ""}`}
                            onClick={() => setForm({ ...form, commute: v as any })}>
                      {l}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="🏠 Дома">
                <div className="chips">
                  <button className={`chip ${form.has_purifier ? "active" : ""}`}
                          onClick={() => setForm({ ...form, has_purifier: !form.has_purifier })}>
                    💨 Есть очиститель воздуха
                  </button>
                  <button className={`chip ${form.smoker ? "active" : ""}`}
                          onClick={() => setForm({ ...form, smoker: !form.smoker })}>
                    🚬 Курю
                  </button>
                </div>
              </Section>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
                <button className="btn ghost sm" onClick={saveToProfile}
                        title="Сохранить в мой профиль">
                  {savedToProfile ? "✓ В профиле" : "💾 В профиль"}
                </button>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" onClick={onClose}>Отмена</button>
                  <button className="cta-gradient" onClick={submit}>
                    <IconSparkles size={14} /> Получить персональный бриф
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "loading" && (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div className="ai-avatar" style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto 20px" }}>
                <IconSparkles size={26} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                AQYL Health AI анализирует ваш день…
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 440, margin: "0 auto", lineHeight: 1.7 }}>
                Собираю данные о воздухе в {form.district}, прогноз на 24 часа,
                источники загрязнения. Сопоставляю с вашим профилем.
              </div>
            </div>
          )}

          {step === "result" && brief && (
            <div>
              <div style={{ padding: "16px 28px", borderBottom: "1px solid var(--border)",
                            background: `${RISK_COLOR[brief.risk_level]}10`,
                            display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 12,
                  background: RISK_COLOR[brief.risk_level],
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 800, fontSize: 19,
                }}>
                  {brief.current_aqi}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" }}>
                    {brief.district}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    Риск для вашего профиля: <span style={{ color: RISK_COLOR[brief.risk_level] }}>
                      {RISK_LABEL[brief.risk_level]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="md-content" style={{ padding: "20px 28px", maxHeight: "50vh", overflowY: "auto" }}
                   dangerouslySetInnerHTML={{ __html: renderMarkdown(brief.markdown) }} />
            </div>
          )}
        </div>

        {step === "result" && brief && (
          <div className="modal-foot">
            <div style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>
              Движок: {brief.engine}
            </div>
            <button className="btn" onClick={() => setStep("form")}>Изменить профиль</button>
            <button className="btn primary" onClick={onClose}>Закрыть</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                    color: "var(--muted)", marginBottom: 10 }}>
        {title}
      </div>
      {children}
      <style>{`.lbl { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }`}</style>
    </div>
  );
}
