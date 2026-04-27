import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/shell/AppShell";
import FuturesConstructor from "../components/futures/FuturesConstructor";
import FuturesDashboard from "../components/futures/FuturesDashboard";
import FuturesCompare from "../components/futures/FuturesCompare";
import FuturesSensitivity from "../components/futures/FuturesSensitivity";
import FuturesOptimizer from "../components/futures/FuturesOptimizer";
import FuturesChat from "../components/futures/FuturesChat";
import FuturesShareExport from "../components/futures/FuturesShareExport";
import {
  futuresAnalyze, futuresForecast, futuresParamsMeta, futuresPresetForecast,
} from "../services/api";
import type {
  FuturesForecast, FuturesParamMeta, FuturesScenarioInput,
} from "../types";
import { DEFAULT_SCENARIO } from "../components/futures/shared";
import { scenarioFromQuery } from "../components/futures/scenarioStorage";

type Tab = "dashboard" | "compare" | "sensitivity" | "optimizer" | "chat" | "share";

const TABS: { key: Tab; label: string; emoji: string; hint: string }[] = [
  { key: "dashboard",   label: "Дашборд",      emoji: "📊", hint: "Прогноз + графики + меморандум" },
  { key: "compare",     label: "Сравнить",     emoji: "🔀", hint: "A/B две траектории" },
  { key: "sensitivity", label: "Рычаги",       emoji: "🔬", hint: "Что двигает будущее сильнее всего" },
  { key: "optimizer",   label: "AI-оптимизатор", emoji: "🎯", hint: "Подбор параметров под цель" },
  { key: "chat",        label: "Диалог",       emoji: "💬", hint: "Вопросы к прогнозу" },
  { key: "share",       label: "Поделиться",   emoji: "🔗", hint: "URL, экспорт, сохранённые сценарии" },
];

export default function FuturesPage() {
  const [scenario, setScenario] = useState<FuturesScenarioInput>(() => {
    const fromUrl = scenarioFromQuery(window.location.search.slice(1));
    return fromUrl ?? DEFAULT_SCENARIO;
  });
  const [data, setData] = useState<FuturesForecast | null>(null);
  const [baseline, setBaseline] = useState<FuturesForecast | null>(null);
  const [showBaseline, setShowBaseline] = useState(true);
  const [paramsMeta, setParamsMeta] = useState<FuturesParamMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);

  // Initial load: meta + forecast + baseline (one-time, cached for ghost-line)
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      futuresParamsMeta(),
      futuresForecast(scenario),
      futuresPresetForecast("baseline"),
    ]).then(([metaR, fcR, blR]) => {
      if (!alive) return;
      if (metaR.status === "fulfilled") setParamsMeta(metaR.value.params);
      if (fcR.status === "fulfilled") setData(fcR.value);
      if (blR.status === "fulfilled") setBaseline(blR.value);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (s: FuturesScenarioInput) => {
    setLoading(true);
    try {
      const r = await futuresForecast(s);
      setData(r);
    } finally {
      setLoading(false);
    }
  };

  const runAI = async () => {
    setAiLoading(true);
    try {
      const r = await futuresAnalyze(scenario);
      setData(r);
    } finally {
      setAiLoading(false);
    }
  };

  const loadPreset = async (key: string) => {
    setLoading(true);
    try {
      const r = await futuresPresetForecast(key);
      setData(r);
      const nextScenario: FuturesScenarioInput = {
        ...DEFAULT_SCENARIO,
        ...(r.scenario_params ?? {}),
        name: r.scenario_name,
      };
      setScenario(nextScenario);
      setActivePresetKey(key);
    } finally {
      setLoading(false);
    }
  };

  const onScenarioChange = (next: FuturesScenarioInput) => {
    setScenario(next);
    setActivePresetKey(null);
  };

  const resetAll = () => {
    setScenario(DEFAULT_SCENARIO);
    setActivePresetKey(null);
    run(DEFAULT_SCENARIO);
  };

  const resetGroup = (group: string) => {
    const byGroup = paramsMeta.filter((m) => m.group === group);
    const next = { ...scenario };
    for (const m of byGroup) {
      (next as Record<string, unknown>)[m.key] = m.baseline;
    }
    next.name = "custom";
    setScenario(next);
    setActivePresetKey(null);
  };

  const applyBestFromOptimizer = (best: FuturesScenarioInput) => {
    setScenario({ ...best, name: "optimizer" });
    setActivePresetKey(null);
    setTab("dashboard");
    run({ ...best, name: "optimizer" });
  };

  const tabBody = useMemo(() => {
    if (tab === "dashboard") {
      return data ? (
        <FuturesDashboard
          data={data}
          loading={loading}
          baseline={showBaseline && baseline && baseline.scenario_name !== data.scenario_name ? baseline : null}
        />
      ) : (
        <div className="loading">Считаем первый прогноз…</div>
      );
    }
    if (tab === "compare") {
      return <FuturesCompare baseScenario={scenario} />;
    }
    if (tab === "sensitivity") {
      return <FuturesSensitivity scenario={scenario} />;
    }
    if (tab === "optimizer") {
      return <FuturesOptimizer scenario={scenario} onApplyBest={applyBestFromOptimizer} />;
    }
    if (tab === "chat") {
      return data ? (
        <FuturesChat forecast={data} />
      ) : (
        <div className="loading">Сначала нужен прогноз — подождите дашборд.</div>
      );
    }
    if (tab === "share") {
      return (
        <FuturesShareExport
          scenario={scenario}
          forecast={data}
          onLoadSaved={(s) => {
            setScenario(s);
            setActivePresetKey(null);
            run(s);
            setTab("dashboard");
          }}
        />
      );
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, data, loading, scenario, baseline, showBaseline]);

  return (
    <AppShell
      topTitle="Болашақ · Конструктор будущего Алматы"
      topSub="Сценарии, сравнение, AI-оптимизатор и диалог с прогнозом"
      topActions={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pill-btn ${tab === t.key ? "primary" : ""}`}
              title={t.hint}
              style={{ fontSize: 12 }}
            >
              <span style={{ marginRight: 4 }}>{t.emoji}</span> {t.label}
            </button>
          ))}
          {tab === "dashboard" && baseline && (
            <button
              className={`pill-btn ${showBaseline ? "primary" : ""}`}
              onClick={() => setShowBaseline((v) => !v)}
              style={{ fontSize: 11 }}
              title="Показать ghost-линию baseline-сценария"
            >
              👻 Baseline {showBaseline ? "ON" : "OFF"}
            </button>
          )}
        </div>
      }
    >
      <FuturesConstructor
        scenario={scenario}
        paramsMeta={paramsMeta}
        activePresetKey={activePresetKey}
        onChange={onScenarioChange}
        onLoadPreset={loadPreset}
        onReset={resetAll}
        onResetGroup={resetGroup}
        onRun={() => run(scenario)}
        onRunAI={runAI}
        loading={loading}
        aiLoading={aiLoading}
      />

      <div className="futures-tab-body">{tabBody}</div>
    </AppShell>
  );
}
