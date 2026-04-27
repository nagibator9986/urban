import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "../components/shell/AppShell";
import BaseMap from "../components/map/BaseMap";
import FacilityLayers from "../components/public/FacilityLayers";
import FifteenMinCard from "../components/public/FifteenMinCard";
import CompareDistrictsModal from "../components/public/CompareDistrictsModal";
import DeveloperCheckModal from "../components/public/DeveloperCheckModal";
import DistrictChoroplethLayer, { CHOROPLETH_METRICS } from "../components/public/DistrictChoroplethLayer";
import type { ChoroplethMetric } from "../types";
import DistrictAIChatCard from "../components/public/DistrictAIChatCard";
import AutoPlanModal from "../components/public/AutoPlanModal";
import {
  deleteSimEntry, loadSimHistory, saveSimEntry,
  totalAdds as countTotalAdds, type SimEntry,
} from "../components/public/simulationHistory";
import AIAssistant from "../components/ai/AIAssistant";
import AIReportModal from "../components/ai/AIReportModal";
import { IconBot, IconDownload, IconLayers, IconReset, IconSparkles, IconStats } from "../components/shell/Icons";
import {
  downloadSimulationPdf, getCityOverview, getCityStatistics, getDistricts,
  simulateDistrict,
} from "../services/api";
import type {
  CityOverview, CityStatDetail, District, FacilityType, SimulationResult,
} from "../types";
import { FACILITY_COLORS, FACILITY_EMOJI, FACILITY_LABELS } from "../types";

// Типы, которые могут «бросать» в район (нормированные)
const DROP_TYPES: FacilityType[] = [
  "school", "kindergarten", "hospital", "clinic",
  "pharmacy", "park", "fire_station", "bus_stop",
];

const ALL_LAYER_TYPES: FacilityType[] = [
  "school", "hospital", "clinic", "kindergarten",
  "pharmacy", "park", "police", "fire_station", "bus_stop",
];

function levelOf(score: number): "high" | "mid" | "low" {
  if (score >= 85) return "high";
  if (score >= 60) return "mid";
  return "low";
}

export default function PublicMode() {
  const [overview, setOverview] = useState<CityOverview | null>(null);
  const [stats, setStats] = useState<CityStatDetail | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);

  const [activeLayers, setActiveLayers] = useState<Set<FacilityType>>(
    new Set<FacilityType>(["school", "hospital", "clinic", "kindergarten"])
  );
  const [draggingType, setDraggingType] = useState<FacilityType | null>(null);
  const [additions, setAdditions] = useState<Record<number, Record<string, number>>>({});
  const [sims, setSims] = useState<Record<number, SimulationResult>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [aiOpen, setAiOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [showChoropleth, setShowChoropleth] = useState(true);
  const [choroplethMetric, setChoroplethMetric] = useState<ChoroplethMetric>("overall_score");
  const [batchMode, setBatchMode] = useState(false);
  const [batchType, setBatchType] = useState<FacilityType | null>(null);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<number>>(new Set());
  const [autoPlanOpen, setAutoPlanOpen] = useState<{ id: number; name: string } | null>(null);
  const [simHistory, setSimHistory] = useState<SimEntry[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([getCityOverview(), getCityStatistics(), getDistricts()])
      .then(([ov, st, ds]) => {
        if (!alive) return;
        if (ov.status === "fulfilled") setOverview(ov.value);
        if (st.status === "fulfilled") setStats(st.value);
        if (ds.status === "fulfilled") setDistricts(ds.value);
      });
    setSimHistory(loadSimHistory());
    return () => {
      alive = false;
    };
  }, []);

  const toggleLayer = useCallback((t: FacilityType) => {
    setActiveLayers((prev) => {
      const s = new Set(prev);
      if (s.has(t)) s.delete(t); else s.add(t);
      return s;
    });
  }, []);

  const onDropOnDistrict = useCallback(async (districtId: number) => {
    if (!draggingType) return;
    setAdditions((prev) => {
      const cur = { ...(prev[districtId] ?? {}) };
      cur[draggingType] = (cur[draggingType] ?? 0) + 1;
      return { ...prev, [districtId]: cur };
    });
    setDraggingType(null);
  }, [draggingType]);

  const resetDistrict = useCallback((districtId: number) => {
    setAdditions((p) => { const n = { ...p }; delete n[districtId]; return n; });
    setSims((p) => { const n = { ...p }; delete n[districtId]; return n; });
  }, []);

  const resetAll = useCallback(() => {
    setAdditions({});
    setSims({});
    setSelectedForBatch(new Set());
    setBatchMode(false);
    setBatchType(null);
  }, []);

  const applyBatch = useCallback(() => {
    if (!batchType || selectedForBatch.size === 0) return;
    setAdditions((prev) => {
      const next = { ...prev };
      for (const id of selectedForBatch) {
        const cur = { ...(next[id] ?? {}) };
        cur[batchType] = (cur[batchType] ?? 0) + 1;
        next[id] = cur;
      }
      return next;
    });
  }, [batchType, selectedForBatch]);

  const applyBatchN = useCallback((n: number) => {
    if (!batchType || selectedForBatch.size === 0) return;
    setAdditions((prev) => {
      const next = { ...prev };
      for (const id of selectedForBatch) {
        const cur = { ...(next[id] ?? {}) };
        cur[batchType] = (cur[batchType] ?? 0) + n;
        next[id] = cur;
      }
      return next;
    });
  }, [batchType, selectedForBatch]);

  const applyBatchPreset = useCallback((preset: "worst3" | "best3" | "all" | "populated3" | "clear") => {
    if (!stats || !Array.isArray(stats.districts)) return;
    const districts = stats.districts;
    let ids: number[] = [];
    if (preset === "worst3") {
      ids = districts.slice().sort((a, b) => a.overall_score - b.overall_score)
        .slice(0, 3).map((d) => d.district_id);
    } else if (preset === "best3") {
      ids = districts.slice().sort((a, b) => b.overall_score - a.overall_score)
        .slice(0, 3).map((d) => d.district_id);
    } else if (preset === "all") {
      ids = districts.map((d) => d.district_id);
    } else if (preset === "populated3") {
      ids = districts.slice().sort((a, b) => b.population - a.population)
        .slice(0, 3).map((d) => d.district_id);
    } else if (preset === "clear") {
      setSelectedForBatch(new Set());
      return;
    }
    setSelectedForBatch(new Set(ids));
  }, [stats]);

  const onDistrictMapClick = useCallback((districtId: number) => {
    if (batchMode) {
      setSelectedForBatch((prev) => {
        const next = new Set(prev);
        if (next.has(districtId)) next.delete(districtId);
        else next.add(districtId);
        return next;
      });
      return;
    }
    setSelectedId(districtId);
  }, [batchMode]);

  const applyAutoPlanResult = useCallback((districtId: number, adds: Record<string, number>) => {
    setAdditions((prev) => {
      const cur = { ...(prev[districtId] ?? {}) };
      for (const [k, n] of Object.entries(adds)) {
        cur[k] = (cur[k] ?? 0) + n;
      }
      return { ...prev, [districtId]: cur };
    });
  }, []);

  const saveCurrentAsHistory = useCallback(() => {
    if (countTotalAdds(additions) === 0) return;
    const title = `Сценарий ${new Date().toLocaleString("ru-RU")}`;
    setSimHistory(saveSimEntry(title, additions));
  }, [additions]);

  const loadFromHistory = useCallback((entry: SimEntry) => {
    setAdditions(entry.additions);
  }, []);

  const removeFromHistory = useCallback((id: string) => {
    setSimHistory(deleteSimEntry(id));
  }, []);

  const downloadPdfForDistrict = useCallback(async (districtId: number) => {
    const adds = additions[districtId];
    if (!adds || Object.keys(adds).length === 0) return;
    setPdfBusy(true);
    try {
      const blob = await downloadSimulationPdf({
        district_id: districtId,
        additions: adds,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aqyl-simulation-${districtId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* interceptor */
    } finally {
      setPdfBusy(false);
    }
  }, [additions]);

  useEffect(() => {
    // Debounce: batch rapid drag-drop ops so we don't hammer the API.
    let cancelled = false;
    const t = setTimeout(async () => {
      const entries = Object.entries(additions).filter(
        ([, a]) => a && Object.keys(a).length > 0,
      );
      if (entries.length === 0) {
        setSims({});
        return;
      }
      const results = await Promise.allSettled(
        entries.map(([idStr, adds]) =>
          simulateDistrict(Number(idStr), adds).then((r) => [Number(idStr), r] as const),
        ),
      );
      if (cancelled) return;
      const updates: Record<number, SimulationResult> = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          const [id, res] = r.value;
          updates[id] = res;
        }
      }
      setSims(updates);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [additions]);

  const districtCards = useMemo(() => {
    if (!stats || !Array.isArray(stats.districts)) return [];
    // slice() first — stats.districts is referentially shared React state; .sort() mutates.
    return stats.districts
      .slice()
      .sort((a, b) => b.population - a.population)
      .map((d) => {
        const score = d.overall_score;
        const sim = sims[d.district_id];
        const delta = sim ? sim.delta_score : 0;
        const newScore = sim ? sim.after.score : score;
        const adds = additions[d.district_id] ?? {};
        return { d, score, newScore, delta, adds };
      });
  }, [stats, sims, additions]);

  const totalAdds = useMemo(
    () => Object.values(additions).reduce(
      (s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0,
    ), [additions]);

  return (
    <AppShell
      topTitle="Общественная инфраструктура"
      topSub="Карта + drag-and-drop симулятор + AI-помощник"
      aiOpen={aiOpen}
      onToggleAI={() => setAiOpen((o) => !o)}
      topActions={
        <>
          {totalAdds > 0 && (
            <button className="pill-btn" onClick={resetAll}>
              <IconReset size={14} /> Сброс ({totalAdds})
            </button>
          )}
          <button className="cta-gradient" onClick={() => setDevOpen(true)}>
            <IconSparkles size={14} /> Developer Pre-check
          </button>
          <button className="pill-btn" onClick={() => setCompareOpen(true)}>
            <IconStats size={14} /> Сравнить районы
          </button>
          <button className="pill-btn" onClick={() => setReportOpen(true)}>
            <IconSparkles size={14} /> AI-отчёт
          </button>
          <button
            className={`pill-btn ${aiOpen ? "primary" : ""}`}
            onClick={() => setAiOpen((o) => !o)}
          >
            <IconBot size={14} /> AQYL AI
          </button>
        </>
      }
    >
      {/* Left panel */}
      <aside className="panel">
        <div className="panel-head">
          <h2>Социальная инфраструктура</h2>
          <p>Алматы · {overview ? (overview.total_population / 1_000_000).toFixed(2) : "…"}М жителей</p>
        </div>

        <div className="panel-body">
          {/* Premium CTA — Developer Pre-check */}
          <div className="premium-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span className="premium-card-badge">B2B · PDF</span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>для банка/акимата</span>
            </div>
            <div className="premium-card-title">🏗️ Developer Pre-check</div>
            <div className="premium-card-desc">
              Строите новый ЖК? AI оценит нагрузку на инфраструктуру района,
              подсчитает нужные школы/сады/поликлиники и выдаст <b>PDF-отчёт</b>
              к проектной декларации.
            </div>
            <button className="cta-gradient"
                    style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
                    onClick={() => setDevOpen(true)}>
              <IconSparkles size={14} /> Оценить ЖК
            </button>
            <div className="premium-card-price">
              Free · до 3 расчётов/час · <strong>Pro $49 за PDF</strong> — скоро
            </div>
          </div>

          {/* 15-min City */}
          <FifteenMinCard />

          {/* Compare CTA */}
          <button className="btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => setCompareOpen(true)}>
            <IconStats size={14} /> Сравнить районы бок о бок
          </button>

          {/* City stats */}
          {stats && (
            <div className="card">
              <div className="card-title">Общий показатель города</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: "clamp(32px, 8vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em" }}
                      className="stat-value brand">{stats.overall_score}</span>
                <span style={{ color: "var(--muted)", fontWeight: 600 }}>/ 100</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {stats.total_facilities.toLocaleString("ru-RU")} объектов в базе · обновляется из OSM
              </div>
            </div>
          )}

          {/* Drag-drop palette */}
          <div>
            <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconLayers size={13} /> Перетащите объект в район
            </div>
            <div className="palette" style={{ marginTop: 10 }}>
              {DROP_TYPES.map((t) => (
                <div
                  key={t}
                  className={`palette-item ${draggingType === t ? "dragging" : ""}`}
                  draggable
                  onDragStart={() => setDraggingType(t)}
                  onDragEnd={() => setDraggingType(null)}
                  title={`Перетащите «${FACILITY_LABELS[t]}» на район ниже`}
                >
                  <div className="icon" style={{
                    background: FACILITY_COLORS[t] + "26",
                    color: FACILITY_COLORS[t],
                    border: `1px solid ${FACILITY_COLORS[t]}55`,
                  }}>{FACILITY_EMOJI[t]}</div>
                  <div className="label">{FACILITY_LABELS[t]}</div>
                  <div className="hint">drag</div>
                </div>
              ))}
            </div>
          </div>

          {/* Layer toggles */}
          <div>
            <div className="section-title">Слои на карте</div>
            <div className="chips" style={{ marginTop: 8 }}>
              {ALL_LAYER_TYPES.map((t) => (
                <button
                  key={t}
                  className={`chip ${activeLayers.has(t) ? "active" : ""}`}
                  onClick={() => toggleLayer(t)}
                >
                  <span className="dot" style={{ background: FACILITY_COLORS[t] }} />
                  {FACILITY_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Districts with drop targets */}
          <div>
            <div className="section-title">Районы · drop here</div>
            <div className="district-row" style={{ marginTop: 8 }}>
              {districtCards.map(({ d, score, newScore, delta, adds }) => {
                const isTarget = draggingType !== null;
                return (
                  <div
                    key={d.district_id}
                    className={`district-card ${selectedId === d.district_id ? "selected" : ""} ${isTarget ? "drop-target" : ""}`}
                    onClick={() => setSelectedId(d.district_id)}
                    onDragOver={(e) => { if (draggingType) e.preventDefault(); }}
                    onDrop={() => onDropOnDistrict(d.district_id)}
                  >
                    <div className="district-head">
                      <div>
                        <div className="district-name">{d.district_name.replace(" район", "")}</div>
                        <div className="district-pop">{d.population.toLocaleString("ru-RU")} чел.</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        <span className={`score-pill ${levelOf(newScore)}`}>
                          {Math.round(newScore)}
                        </span>
                        {delta !== 0 && (
                          <span className={delta > 0 ? "delta-up" : "delta-down"}
                                style={{ fontSize: 11 }}>
                            {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mini-metrics">
                      <span><strong>{d.facilities.find((f) => f.facility_type === "school")?.actual_count ?? 0}</strong> шк.</span>
                      <span><strong>{d.facilities.find((f) => f.facility_type === "kindergarten")?.actual_count ?? 0}</strong> дс.</span>
                      <span><strong>{d.facilities.find((f) => f.facility_type === "clinic")?.actual_count ?? 0}</strong> пол.</span>
                      <span><strong>{d.facilities.find((f) => f.facility_type === "pharmacy")?.actual_count ?? 0}</strong> апт.</span>
                    </div>
                    {Object.keys(adds).length > 0 && (
                      <>
                        <div className="sim-badges">
                          {Object.entries(adds).map(([t, n]) => (
                            <span key={t} className="sim-badge">
                              +{n} {FACILITY_EMOJI[t as FacilityType]} {FACILITY_LABELS[t as FacilityType]}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          <button className="btn ghost sm"
                                  onClick={(e) => { e.stopPropagation(); resetDistrict(d.district_id); }}>
                            <IconReset size={12} /> Сбросить
                          </button>
                          <button className="btn ghost sm"
                                  disabled={pdfBusy}
                                  onClick={(e) => { e.stopPropagation(); downloadPdfForDistrict(d.district_id); }}>
                            <IconDownload size={12} /> PDF
                          </button>
                        </div>
                      </>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button className="btn ghost sm"
                              style={{ fontSize: 10 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setAutoPlanOpen({ id: d.district_id, name: d.district_name });
                              }}>
                        🎯 Авто-план
                      </button>
                      {batchMode && (
                        <button
                          className={`btn sm ${selectedForBatch.has(d.district_id) ? "primary" : "ghost"}`}
                          style={{ fontSize: 10 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedForBatch((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.district_id)) next.delete(d.district_id);
                              else next.add(d.district_id);
                              return next;
                            });
                          }}
                        >
                          {selectedForBatch.has(d.district_id) ? "✓ Выбрано" : "Выбрать для batch"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multi-district batch mode */}
          <div className="card">
            <div className="card-title">🧮 Мульти-район batch</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              Применить одно дополнение сразу к нескольким районам.
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
              <button
                className={`btn sm ${batchMode ? "primary" : ""}`}
                onClick={() => setBatchMode((m) => !m)}
              >
                {batchMode ? "Выйти из batch" : "Включить batch"}
              </button>
            </div>
            {batchMode && (
              <div style={{ marginTop: 10 }}>
                <div className="section-title">Готовые наборы районов</div>
                <div className="chips" style={{ marginTop: 6 }}>
                  <button className="chip" onClick={() => applyBatchPreset("worst3")}
                          title="3 района с наименьшим overall_score">
                    🏚 3 худших
                  </button>
                  <button className="chip" onClick={() => applyBatchPreset("best3")}
                          title="3 района с наивысшим overall_score">
                    ⭐ 3 лучших
                  </button>
                  <button className="chip" onClick={() => applyBatchPreset("all")}>
                    🌐 Все 8
                  </button>
                  <button className="chip" onClick={() => applyBatchPreset("populated3")}
                          title="3 самых населённых">
                    👥 Топ-3 по населению
                  </button>
                  <button className="chip" onClick={() => applyBatchPreset("clear")}>
                    ❌ Очистить
                  </button>
                </div>

                <div className="section-title" style={{ marginTop: 10 }}>Выберите тип</div>
                <div className="chips" style={{ marginTop: 6 }}>
                  {DROP_TYPES.map((t) => (
                    <button
                      key={t}
                      className={`chip ${batchType === t ? "active" : ""}`}
                      onClick={() => setBatchType(t)}
                    >
                      {FACILITY_EMOJI[t]} {FACILITY_LABELS[t]}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                  Выбрано районов: <b>{selectedForBatch.size}</b>
                  {batchType && ` · Будет добавлено: +1 ${FACILITY_LABELS[batchType]}`}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    className="cta-gradient"
                    style={{ flex: 1, justifyContent: "center" }}
                    disabled={!batchType || selectedForBatch.size === 0}
                    onClick={applyBatch}
                  >
                    Добавить +1
                  </button>
                  <button
                    className="btn"
                    style={{ minWidth: 64 }}
                    disabled={!batchType || selectedForBatch.size === 0}
                    onClick={() => applyBatchN(2)}
                  >
                    +2
                  </button>
                  <button
                    className="btn"
                    style={{ minWidth: 64 }}
                    disabled={!batchType || selectedForBatch.size === 0}
                    onClick={() => applyBatchN(5)}
                  >
                    +5
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Inline AI chat for selected district */}
          <DistrictAIChatCard
            districtName={selectedId ? (districts.find((d) => d.id === selectedId)?.name_ru ?? null) : null}
            simulatorState={selectedId && additions[selectedId] ? additions[selectedId] : undefined}
          />

          {/* Simulation history */}
          <div className="card">
            <div className="card-title">📚 История симуляций</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              Последние 5 сценариев сохраняются в браузере.
            </div>
            <button
              className="btn sm"
              style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
              disabled={countTotalAdds(additions) === 0}
              onClick={saveCurrentAsHistory}
            >
              💾 Сохранить текущий
            </button>
            {simHistory.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                {simHistory.map((h) => (
                  <div key={h.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 8px", borderRadius: 6,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    fontSize: 11,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 11 }}>{h.title}</div>
                      <div style={{ color: "var(--muted)", fontSize: 10 }}>
                        {Object.keys(h.additions).length} район(ов) · {countTotalAdds(h.additions)} +
                      </div>
                    </div>
                    <button className="btn ghost sm" style={{ fontSize: 9, padding: "2px 6px" }}
                            onClick={() => loadFromHistory(h)}>↺</button>
                    <button className="btn ghost sm" style={{ fontSize: 9, padding: "2px 6px", color: "#EF4444" }}
                            onClick={() => removeFromHistory(h.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coverage gaps */}
          {overview && overview.coverage_gaps.length > 0 && (
            <div>
              <div className="section-title">Критические дефициты</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {overview.coverage_gaps.slice(0, 6).map((g, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 10,
                    background: g.status === "critical" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                    borderLeft: `3px solid ${g.status === "critical" ? "var(--danger)" : "var(--warning)"}`,
                    fontSize: 12,
                  }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{g.district_name.replace(" район", "")}</div>
                      <div style={{ color: "var(--muted)" }}>
                        {FACILITY_LABELS[g.facility_type as FacilityType] ?? g.facility_type}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: g.status === "critical" ? "var(--danger)" : "var(--warning)" }}>
                      −{g.deficit_percent}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Map */}
      <div className="map-wrap">
        <BaseMap>
          {showChoropleth && (
            <DistrictChoroplethLayer
              metric={choroplethMetric}
              simulatedScores={Object.fromEntries(
                Object.entries(sims).map(([id, s]) => [Number(id), s.after.score]),
              )}
              onDistrictClick={(id) => onDistrictMapClick(id)}
            />
          )}
          <FacilityLayers activeLayers={activeLayers} />
        </BaseMap>
        <div className="map-overlay tl">
          <div className="map-toast">
            {draggingType ? (
              <><strong>Перетаскиваете:</strong> {FACILITY_EMOJI[draggingType]} {FACILITY_LABELS[draggingType]} → бросьте на район слева</>
            ) : batchMode ? (
              <>🧮 <strong>Batch-режим:</strong> кликайте районы на карте/слева чтобы выбрать, потом добавьте тип в сайдбаре</>
            ) : (
              <>💡 Возьмите иконку слева и бросьте на район — оценка пересчитается в реальном времени</>
            )}
          </div>
        </div>
        <div className="map-overlay tr" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <button
            className={`pill-btn ${showChoropleth ? "primary" : ""}`}
            style={{ fontSize: 11 }}
            onClick={() => setShowChoropleth((v) => !v)}
          >
            🗺 Choropleth {showChoropleth ? "ON" : "OFF"}
          </button>
          {showChoropleth && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 4,
              padding: 6, borderRadius: 8,
              background: "rgba(15,23,42,0.85)",
              border: "1px solid var(--border)",
              backdropFilter: "blur(8px)",
              maxWidth: 200,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)",
                            letterSpacing: 0.6, textTransform: "uppercase", padding: "0 4px" }}>
                Метрика
              </div>
              {CHOROPLETH_METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setChoroplethMetric(m.key)}
                  className={`chip ${choroplethMetric === m.key ? "active" : ""}`}
                  style={{ fontSize: 10, padding: "3px 8px", justifyContent: "flex-start" }}
                >
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="map-overlay bl">
          <div className="map-legend">
            {[...activeLayers].map((t) => (
              <div key={t} className="row">
                <span className="dot" style={{ background: FACILITY_COLORS[t] }} />
                {FACILITY_LABELS[t]}
              </div>
            ))}
          </div>
        </div>
      </div>

      <AIAssistant mode="public" open={aiOpen} onClose={() => setAiOpen(false)} />
      <AIReportModal mode="public" open={reportOpen} onClose={() => setReportOpen(false)} />
      <CompareDistrictsModal open={compareOpen} onClose={() => setCompareOpen(false)} />
      <DeveloperCheckModal open={devOpen} onClose={() => setDevOpen(false)} />
      <AutoPlanModal
        open={autoPlanOpen !== null}
        onClose={() => setAutoPlanOpen(null)}
        districtId={autoPlanOpen?.id ?? null}
        districtName={autoPlanOpen?.name ?? null}
        onApplyAdditions={(adds) => {
          if (autoPlanOpen) applyAutoPlanResult(autoPlanOpen.id, adds);
        }}
      />
    </AppShell>
  );
}
