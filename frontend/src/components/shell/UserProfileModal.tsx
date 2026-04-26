import { useEffect, useState } from "react";
import { IconClose } from "./Icons";
import {
  DEFAULT_PROFILE, clearProfile, loadProfile, saveProfile,
  emitProfileUpdated, type UserProfile,
} from "../../lib/userProfile";
import { getHealthRiskMeta, getDistricts } from "../../services/api";
import type { HealthRiskMeta, District } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UserProfileModal({ open, onClose }: Props) {
  const [form, setForm] = useState<UserProfile>(() => loadProfile());
  const [meta, setMeta] = useState<HealthRiskMeta | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(loadProfile());
    setSaved(false);
    if (!meta) getHealthRiskMeta().then(setMeta).catch(() => {});
    if (districts.length === 0) getDistricts().then(setDistricts).catch(() => {});
  }, [open, meta, districts.length]);

  const upd = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const toggleArray = (k: "conditions" | "activities", v: string) => {
    setForm((f) => {
      const set = new Set(f[k]);
      if (set.has(v)) set.delete(v);
      else set.add(v);
      return { ...f, [k]: Array.from(set) };
    });
  };

  const onSave = () => {
    saveProfile(form);
    emitProfileUpdated();
    setSaved(true);
    setTimeout(() => onClose(), 600);
  };

  const onClear = () => {
    if (!window.confirm("Сбросить профиль полностью?")) return;
    clearProfile();
    setForm(DEFAULT_PROFILE);
    emitProfileUpdated();
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: "94%", maxHeight: "92vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>👤 Мой профиль</h2>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Хранится в браузере. Используется AI-помощником, Health-Risk и Personal Brief.
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Identity */}
          <section className="card">
            <div className="card-title">Профиль</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <Field label="Имя/ник">
                <input type="text" value={form.display_name}
                       onChange={(e) => upd("display_name", e.target.value)}
                       placeholder="Айгерим" style={inp} />
              </Field>
              <Field label="Мой район">
                <select value={form.home_district ?? ""}
                        onChange={(e) => upd("home_district", e.target.value || null)}
                        style={inp}>
                  <option value="">Не указан</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.name_ru}>{d.name_ru}</option>
                  ))}
                </select>
              </Field>
              <Field label="Возраст">
                <select value={form.age_group}
                        onChange={(e) => upd("age_group", e.target.value as UserProfile["age_group"])}
                        style={inp}>
                  {(meta?.age_groups ?? [
                    { value: "child", label: "Ребёнок" },
                    { value: "teen", label: "Подросток" },
                    { value: "adult", label: "Взрослый" },
                    { value: "senior", label: "Старше 60" },
                  ]).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </Field>
              <Field label="Язык">
                <select value={form.preferred_language}
                        onChange={(e) => upd("preferred_language", e.target.value as UserProfile["preferred_language"])}
                        style={inp}>
                  <option value="ru">Русский</option>
                  <option value="kz">Қазақша</option>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Health */}
          <section className="card">
            <div className="card-title">🩺 Здоровье</div>
            <div style={{ marginTop: 8 }}>
              <div className="section-title">Хронические состояния</div>
              <div className="chips" style={{ marginTop: 6 }}>
                {(meta?.conditions ?? [
                  { value: "asthma", label: "Астма" },
                  { value: "copd", label: "ХОБЛ" },
                  { value: "heart", label: "Сердечно-сосудистые" },
                  { value: "pregnancy", label: "Беременность" },
                  { value: "allergy", label: "Аллергия" },
                  { value: "diabetes", label: "Диабет" },
                ]).map((c) => (
                  <button key={c.value}
                          className={`chip ${form.conditions.includes(c.value) ? "active" : ""}`}
                          onClick={() => toggleArray("conditions", c.value)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              <Check label="Курю" checked={form.smoker}
                     onChange={(v) => upd("smoker", v)} />
              <Check label="Дома очиститель HEPA" checked={form.has_purifier}
                     onChange={(v) => upd("has_purifier", v)} />
              <Check label="Ношу N95/KN95 в плохие дни" checked={form.wears_mask_n95}
                     onChange={(v) => upd("wears_mask_n95", v)} />
            </div>
            <Field label="Часов на улице/день" style={{ marginTop: 8 }}>
              <input type="number" min={0} max={16} step={0.5}
                     value={form.hours_outdoor_per_day}
                     onChange={(e) => upd("hours_outdoor_per_day", Number(e.target.value) || 0)}
                     style={inp} />
            </Field>
          </section>

          {/* Lifestyle */}
          <section className="card">
            <div className="card-title">🏃 Образ жизни</div>
            <div style={{ marginTop: 8 }}>
              <div className="section-title">Активности на улице</div>
              <div className="chips" style={{ marginTop: 6 }}>
                {(meta?.activities ?? [
                  { value: "running", label: "Бег" },
                  { value: "cycling", label: "Велосипед" },
                  { value: "walking_dog", label: "Прогулки с собакой" },
                  { value: "gym", label: "Зал" },
                  { value: "kids_outdoor", label: "Прогулки с детьми" },
                ]).map((a) => (
                  <button key={a.value}
                          className={`chip ${form.activities.includes(a.value) ? "active" : ""}`}
                          onClick={() => toggleArray("activities", a.value)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Транспорт" style={{ marginTop: 10 }}>
              <select value={form.commute}
                      onChange={(e) => upd("commute", e.target.value as UserProfile["commute"])}
                      style={inp}>
                <option value="car">Авто</option>
                <option value="public">Общ. транспорт</option>
                <option value="walk">Пешком</option>
                <option value="bike">Велосипед</option>
                <option value="none">Не выхожу</option>
              </select>
            </Field>
          </section>

          {/* Family */}
          <section className="card">
            <div className="card-title">👨‍👩‍👧 Семья</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <Field label="Дети 0–6 лет">
                <input type="number" min={0} max={10}
                       value={form.family_kids_0_6}
                       onChange={(e) => upd("family_kids_0_6", Number(e.target.value) || 0)}
                       style={inp} />
              </Field>
              <Field label="Дети 6–18 лет">
                <input type="number" min={0} max={10}
                       value={form.family_kids_6_18}
                       onChange={(e) => upd("family_kids_6_18", Number(e.target.value) || 0)}
                       style={inp} />
              </Field>
            </div>
          </section>

          {/* Business */}
          <section className="card">
            <div className="card-title">💼 Интерес к бизнесу</div>
            <Field label="Бюджет на открытие (USD, опц.)" style={{ marginTop: 8 }}>
              <input type="number" min={0} step={1000}
                     value={form.business_budget_usd ?? ""}
                     placeholder="Не интересует"
                     onChange={(e) => upd("business_budget_usd", e.target.value ? Number(e.target.value) : null)}
                     style={inp} />
            </Field>
          </section>

          {/* Notes */}
          <section className="card">
            <div className="card-title">📝 Дополнительно</div>
            <Field label="Заметки для AI (что-то важное о вас)" style={{ marginTop: 8 }}>
              <textarea value={form.notes}
                        onChange={(e) => upd("notes", e.target.value)}
                        placeholder="Например: «работаю удалённо, гуляю с собакой утром»"
                        rows={3}
                        style={{ ...inp, resize: "vertical" }} />
            </Field>
          </section>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
          <button className="cta-gradient" onClick={onSave} style={{ flex: 1 }}>
            {saved ? "✓ Сохранено!" : "Сохранить профиль"}
          </button>
          <button className="btn ghost" onClick={onClear} style={{ color: "#EF4444" }}>
            Сбросить
          </button>
        </div>

        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
          🔒 Профиль хранится только в вашем браузере (localStorage). Мы не отправляем
          его на сервер кроме как контекстом для AI-запросов.
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }:
  { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: "var(--muted)",
        letterSpacing: 0.6, textTransform: "uppercase",
      }}>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }:
  { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const inp: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  color: "var(--text, #E5E7EB)", fontSize: 13, fontFamily: "inherit",
};
