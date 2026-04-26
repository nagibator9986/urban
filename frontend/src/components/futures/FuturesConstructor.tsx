import { useMemo, useState } from "react";
import { IconReset, IconSparkles } from "../shell/Icons";
import { renderMarkdown } from "../ui/markdown";
import { futuresExplainSlider } from "../../services/api";
import type { FuturesParamMeta, FuturesScenarioInput } from "../../types";
import { DEFAULT_SCENARIO, PRESETS } from "./shared";

interface Props {
  scenario: FuturesScenarioInput;
  paramsMeta: FuturesParamMeta[];
  activePresetKey: string | null;
  onChange: (next: FuturesScenarioInput) => void;
  onLoadPreset: (key: string) => void;
  onReset: () => void;
  onResetGroup: (group: string) => void;
  onRun: () => void;
  onRunAI: () => void;
  loading: boolean;
  aiLoading: boolean;
}

export default function FuturesConstructor({
  scenario, paramsMeta, activePresetKey, onChange, onLoadPreset,
  onReset, onResetGroup, onRun, onRunAI, loading, aiLoading,
}: Props) {
  const [filter, setFilter] = useState("");

  const grouped = useMemo(() => {
    const byGroup = new Map<string, FuturesParamMeta[]>();
    for (const m of paramsMeta) {
      if (!byGroup.has(m.group)) byGroup.set(m.group, []);
      byGroup.get(m.group)!.push(m);
    }
    if (!filter.trim()) return byGroup;
    const f = filter.toLowerCase();
    const filtered = new Map<string, FuturesParamMeta[]>();
    for (const [g, items] of byGroup) {
      const match = items.filter(
        (p) =>
          p.label.toLowerCase().includes(f)
          || p.group.toLowerCase().includes(f)
          || p.tip.toLowerCase().includes(f),
      );
      if (match.length) filtered.set(g, match);
    }
    return filtered;
  }, [paramsMeta, filter]);

  const update = (key: keyof FuturesScenarioInput | "horizon_years", value: number) => {
    const next: FuturesScenarioInput = { ...scenario, [key]: value, name: "custom" };
    onChange(next);
  };

  const changedCount = useMemo(() => {
    let count = 0;
    const baseline = DEFAULT_SCENARIO as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(scenario)) {
      if (k === "name") continue;
      const base = baseline[k];
      if (base !== undefined && v !== base) count += 1;
    }
    return count;
  }, [scenario]);

  return (
    <aside className="panel" style={{ width: 420 }}>
      <div className="panel-head">
        <h2>Конструктор сценария</h2>
        <p>
          {changedCount > 0
            ? `Изменено ${changedCount} ${plural(changedCount, "параметр", "параметра", "параметров")}`
            : "Поменяйте ползунки и нажмите Пересчитать"}
        </p>
      </div>
      <div className="panel-body">
        {/* Presets */}
        <div>
          <div className="section-title">🎬 Готовые сценарии</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => onLoadPreset(p.key)}
                className={`chip ${activePresetKey === p.key ? "active" : ""}`}
                style={{ justifyContent: "flex-start", padding: "10px 12px", fontSize: 12 }}
              >
                <span style={{ fontSize: 16 }}>{p.emoji}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 700 }}>{p.label}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>{p.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 11, fontWeight: 700, color: "var(--muted)",
              letterSpacing: 0.6, textTransform: "uppercase",
            }}
          >
            🔍 Поиск по параметрам
          </span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="школа, BRT, газ…"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text, #E5E7EB)",
              fontSize: 12,
            }}
          />
        </label>

        {/* Groups */}
        {[...grouped.entries()].map(([groupName, items]) => (
          <ParamGroup
            key={groupName}
            title={groupName}
            onReset={() => onResetGroup(groupName)}
          >
            {items.map((m) => (
              <ParamSlider
                key={m.key}
                meta={m}
                value={Number(scenario[m.key as keyof FuturesScenarioInput] ?? m.baseline)}
                onChange={(v) => update(m.key as keyof FuturesScenarioInput, v)}
              />
            ))}
          </ParamGroup>
        ))}

        {/* Bottom actions */}
        <div
          style={{
            position: "sticky", bottom: -12, marginTop: 8,
            padding: "12px 0",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            display: "flex", gap: 8, flexWrap: "wrap",
          }}
        >
          <button className="pill-btn" onClick={onReset} disabled={loading}>
            <IconReset size={14} /> Сброс
          </button>
          <button
            className="pill-btn primary"
            onClick={onRun}
            disabled={loading}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {loading ? "Считаем…" : "Пересчитать"}
          </button>
          <button
            className="cta-gradient"
            onClick={onRunAI}
            disabled={aiLoading || loading}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <IconSparkles size={14} />
            {aiLoading ? "AI…" : "AI-меморандум"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function ParamGroup({
  title, children, onReset,
}: { title: string; children: React.ReactNode; onReset: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="section-title">{title}</div>
        <button
          className="btn ghost sm"
          onClick={onReset}
          title={`Сбросить группу "${title}" к baseline`}
          style={{ fontSize: 10, padding: "2px 8px" }}
        >
          ⟲
        </button>
      </div>
      {children}
    </div>
  );
}

function ParamSlider({
  meta, value, onChange,
}: { meta: FuturesParamMeta; value: number; onChange: (v: number) => void }) {
  const [showTip, setShowTip] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const isChanged = value !== meta.baseline;

  const askAI = async () => {
    setAiLoading(true);
    try {
      const r = await futuresExplainSlider(meta.key as string, value, meta.baseline);
      setAiAnswer(r.answer);
    } catch {
      setAiAnswer("Не удалось получить AI-объяснение. Попробуйте позже.");
    } finally {
      setAiLoading(false);
    }
  };

  const format = (v: number): string => {
    if (meta.percent) return `${(v * 100).toFixed(meta.step < 0.01 ? 1 : 0)}%`;
    if (meta.kind === "int") return v.toLocaleString("ru-RU") + (meta.unit ? ` ${meta.unit}` : "");
    if (meta.unit === "×") return `×${v.toFixed(meta.step < 0.1 ? 2 : 1)}`;
    if (meta.unit === "лет") return `${v} лет`;
    return `${v}${meta.unit ? ` ${meta.unit}` : ""}`;
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 700,
            color: isChanged ? "var(--brand-1)" : "var(--muted)",
            letterSpacing: 0.6, textTransform: "uppercase",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          {meta.label}
          <button
            type="button"
            aria-label="Объяснение параметра"
            onClick={(e) => { e.preventDefault(); setShowTip((v) => !v); }}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 11,
              padding: 0,
              lineHeight: 1,
            }}
          >ⓘ</button>
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: isChanged ? "var(--brand-1)" : "var(--text, #E5E7EB)",
          }}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      {showTip && (
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: "var(--muted)",
            padding: "8px 10px",
            background: "var(--surface-2)",
            borderLeft: "2px solid var(--brand-1)",
            borderRadius: 6,
          }}
        >
          {meta.tip}
          <button
            type="button"
            onClick={askAI}
            disabled={aiLoading}
            style={{
              marginTop: 6,
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              background: "linear-gradient(135deg, rgba(45,212,191,0.15), rgba(34,211,238,0.05))",
              border: "1px solid rgba(45,212,191,0.4)",
              color: "var(--brand-1)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <IconSparkles size={10} /> {aiLoading ? "AI думает…" : "Объяснить эффект через AI"}
          </button>
          {aiAnswer && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                lineHeight: 1.5,
                color: "var(--text, #E5E7EB)",
                padding: 8,
                background: "rgba(45,212,191,0.06)",
                borderRadius: 6,
                border: "1px solid rgba(45,212,191,0.2)",
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(aiAnswer) }}
            />
          )}
        </div>
      )}
    </label>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}
