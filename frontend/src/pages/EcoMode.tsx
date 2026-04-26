import { useEffect, useMemo, useState } from "react";
import { Circle, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import AppShell from "../components/shell/AppShell";
import BaseMap from "../components/map/BaseMap";
import AIAssistant from "../components/ai/AIAssistant";
import AIReportModal from "../components/ai/AIReportModal";
import ForecastChart from "../components/eco/ForecastChart";
import HealthImpactCard from "../components/eco/HealthImpactCard";
import SourceAttribution from "../components/eco/SourceAttribution";
import PersonalBriefModal from "../components/eco/PersonalBriefModal";
import HealthRiskModal from "../components/eco/HealthRiskModal";
import InversionForecastCard from "../components/eco/InversionForecastCard";
import CitiesCompareCard from "../components/eco/CitiesCompareCard";
import WindowsCard from "../components/eco/WindowsCard";
import SourcesMapLayer, { SourcesLegend } from "../components/eco/SourcesMapLayer";
import { IconBot, IconSparkles, IconWind } from "../components/shell/Icons";
import { getCityEco, getSourcesMap } from "../services/api";
import type { CityEco, DistrictEco, SourcesMapResponse } from "../types";

// Центры районов для расстановки кругов AQI на карте
const DISTRICT_CENTERS: Record<string, [number, number]> = {
  "Алмалинский район":    [43.255, 76.925],
  "Ауэзовский район":    [43.233, 76.855],
  "Бостандыкский район":  [43.225, 76.945],
  "Жетысуский район":    [43.295, 76.965],
  "Медеуский район":     [43.245, 76.990],
  "Наурызбайский район":  [43.215, 76.780],
  "Турксибский район":    [43.320, 76.925],
  "Алатауский район":    [43.180, 76.865],
};

function aqiLabelIcon(aqi: number, color: string, label: string, isSelected: boolean) {
  return L.divIcon({
    html: `
      <div style="
        display:flex;flex-direction:column;align-items:center;gap:3px;
        transform:translateY(-2px);pointer-events:none;
      ">
        <div style="
          background:${color};color:#fff;
          font-weight:800;font-size:${isSelected ? 18 : 15}px;line-height:1;
          padding:${isSelected ? "8px 12px" : "6px 10px"};
          border-radius:999px;
          border:2px solid #fff;
          box-shadow:0 4px 14px rgba(15,23,42,0.28);
          font-family:Inter,sans-serif;letter-spacing:-0.01em;
        ">${aqi}</div>
        <div style="
          background:rgba(255,255,255,0.95);color:#0F172A;
          font-weight:600;font-size:10px;letter-spacing:0.3px;
          padding:2px 8px;border-radius:6px;
          border:1px solid #E2E8F0;
          box-shadow:0 2px 6px rgba(15,23,42,0.10);
          white-space:nowrap;font-family:Inter,sans-serif;
        ">${label}</div>
      </div>`,
    className: "",
    iconSize: [100, 40],
    iconAnchor: [50, 20],
  });
}

function gradeColor(grade: string) {
  return {
    A: "#10B981", B: "#84CC16", C: "#EAB308", D: "#F97316", E: "#EF4444",
  }[grade] ?? "#64748B";
}

type EcoTab = "map" | "sources" | "inversion" | "cities" | "windows";

export default function EcoMode() {
  const [eco, setEco] = useState<CityEco | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [tab, setTab] = useState<EcoTab>("map");
  const [sourcesData, setSourcesData] = useState<SourcesMapResponse | null>(null);
  const [sourceVisible, setSourceVisible] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    getCityEco()
      .then((e) => { if (alive) setEco(e); })
      .catch(() => { /* handled by ErrorBoundary if rendering fails */ });
    return () => { alive = false; };
  }, []);

  // Lazy-load sources data when user opens sources tab
  useEffect(() => {
    if (tab !== "sources" || sourcesData) return;
    let alive = true;
    getSourcesMap().then((d) => {
      if (!alive) return;
      setSourcesData(d);
      // Default: enable power_plant + major_road + private_housing
      setSourceVisible(new Set(["power_plant", "major_road", "private_housing"]));
    }).catch(() => {});
    return () => { alive = false; };
  }, [tab, sourcesData]);

  const toggleSource = (k: string) => {
    setSourceVisible((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const selected: DistrictEco | null = useMemo(
    () => eco?.districts.find((d) => d.district_name === selectedName) ?? null,
    [eco, selectedName],
  );

  if (!eco) return (
    <AppShell topTitle="Экология Алматы" topSub="Загрузка данных...">
      <div className="loading">Загрузка экологических данных...</div>
    </AppShell>
  );

  const primary = selected ?? {
    ...eco.districts[0],
    district_name: "Весь город Алматы",
    aqi: eco.city_aqi,
    aqi_category: eco.city_aqi_category,
    green_m2_per_capita: eco.city_green_m2_per_capita,
    eco_score: eco.city_eco_score,
    pollutants: eco.districts[0].pollutants,
    issues: eco.top_issues.map((i) => ({ ...i })),
    traffic_per_1000: 420,
    green_deficit_percent: Math.max(0, 100 - eco.city_green_m2_per_capita / 16 * 100),
    eco_grade: eco.city_eco_score >= 80 ? "A" : eco.city_eco_score >= 65 ? "B" : eco.city_eco_score >= 50 ? "C" : eco.city_eco_score >= 35 ? "D" : "E",
    green_norm: 16,
    population: eco.total_population,
    updated_at: eco.updated_at,
  } as DistrictEco;

  return (
    <AppShell
      topTitle="Экология города"
      topSub={`AQI ${eco.city_aqi} · ${eco.city_aqi_category.label} · обновлено ${new Date(eco.updated_at).toLocaleTimeString("ru-RU")}`}
      topActions={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            { key: "map",       label: "Карта",         emoji: "🗺" },
            { key: "sources",   label: "Источники",     emoji: "🏭" },
            { key: "inversion", label: "Инверсии 72ч",   emoji: "🌡" },
            { key: "cities",    label: "Vs мир",        emoji: "🌐" },
            { key: "windows",   label: "Часы дня",      emoji: "🪟" },
          ] as { key: EcoTab; label: string; emoji: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pill-btn ${tab === t.key ? "primary" : ""}`}
              style={{ fontSize: 12 }}
              title={t.label}
            >
              <span style={{ marginRight: 4 }}>{t.emoji}</span>{t.label}
            </button>
          ))}
          <span style={{ width: 1, background: "var(--border)", height: 20, margin: "0 4px", alignSelf: "center" }} />
          <button className="cta-gradient" onClick={() => setRiskOpen(true)}>
            <IconSparkles size={14} /> Мой риск
          </button>
          <button className="pill-btn" onClick={() => setBriefOpen(true)}>
            <IconSparkles size={14} /> AI-бриф
          </button>
          <button className="pill-btn" onClick={() => setReportOpen(true)}>
            <IconSparkles size={14} /> AI-отчёт
          </button>
          <button className={`pill-btn ${aiOpen ? "primary" : ""}`} onClick={() => setAiOpen((o) => !o)}>
            <IconBot size={14} /> AQYL AI
          </button>
        </div>
      }
    >
      <aside className="panel">
        <div className="panel-head">
          <h2>Эко-мониторинг</h2>
          <p>AQI · загрязнители · озеленение · трафик · проблемы</p>
        </div>
        <div className="panel-body">

          {/* Premium CTA — Personal Health Brief */}
          <div className="premium-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span className="premium-card-badge">NEW · AI</span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>30 сек</span>
            </div>
            <div className="premium-card-title">🩺 Персональный эко-бриф</div>
            <div className="premium-card-desc">
              Укажите ваш возраст, состояние здоровья, активности — и AI выдаст
              конкретные рекомендации <b>на сегодня</b>: когда гулять, когда проветривать,
              что делать астматикам и бегунам.
            </div>
            <button
              className="cta-gradient"
              style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
              onClick={() => setBriefOpen(true)}
            >
              <IconSparkles size={14} /> Получить бриф
            </button>
          </div>

          {/* AQI hero */}
          <div className="aqi-hero">
            <div className="aqi-gauge" style={{ background: primary.aqi_category.color }}>
              <div className="v">{primary.aqi}</div>
              <div className="l">AQI</div>
            </div>
            <div className="aqi-meta">
              <h2>{primary.district_name.replace(" район", "")}</h2>
              <div className="cat" style={{ color: primary.aqi_category.color }}>
                {primary.aqi_category.label}
              </div>
              <div className="advice">{primary.aqi_category.advice}</div>

              <div style={{ display: "flex", gap: 18, marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700 }}>
                    Эко-оценка
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                    <span className="stat-value brand">{primary.eco_score}</span>
                    <span className="stat-unit">/ 100</span>
                    <span className="tag high" style={{ background: gradeColor(primary.eco_grade) + "22", color: gradeColor(primary.eco_grade), marginLeft: 6 }}>
                      {primary.eco_grade}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700 }}>
                    Зелень
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                    <span className="stat-value">{primary.green_m2_per_capita}</span>
                    <span className="stat-unit">м²/чел</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pollutants */}
          {selected && (
            <div>
              <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconWind size={13} /> Загрязнители (24 ч средние)
              </div>
              <div className="pollutants">
                {Object.values(selected.pollutants).map((p) => (
                  <div key={p.label} className="pollutant">
                    <div className="pol-name">{p.label}</div>
                    <div className="pol-v">{p.value}</div>
                    <div className="pol-u">{p.unit}</div>
                    <div className={`pol-over ${p.over_who <= 1 ? "ok" : ""}`}>
                      {p.over_who <= 1 ? "✓ в норме" : `×${p.over_who} выше ВОЗ`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 72h forecast */}
          <ForecastChart district={selected?.district_name ?? null} />

          {/* Source attribution */}
          <SourceAttribution district={selected?.district_name ?? null} />

          {/* Health impact */}
          <HealthImpactCard district={selected?.district_name ?? null} />

          {/* Issues */}
          <div>
            <div className="section-title">Ключевые экологические проблемы</div>
            <div className="issue-list" style={{ marginTop: 8 }}>
              {primary.issues.slice(0, 6).map((iss) => {
                const klass = iss.severity >= 75 ? "issue-high" : iss.severity >= 50 ? "issue-mid" : "issue-low";
                return (
                  <div key={iss.key} className="issue">
                    <div className={`issue-bar ${klass}`} />
                    <div className="issue-info">
                      <div className="l">{iss.label}</div>
                      <div className="s">{iss.source}</div>
                    </div>
                    <div className="issue-sev" style={{
                      color: iss.severity >= 75 ? "var(--danger)" : iss.severity >= 50 ? "var(--warning)" : "var(--success)",
                    }}>{iss.severity}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* District ranking */}
          <div>
            <div className="section-title">Рейтинг районов по экологии</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {eco.ranking.map((r, i) => (
                <div
                  key={r.district_name}
                  onClick={() => setSelectedName(selectedName === r.district_name ? null : r.district_name)}
                  className={`district-card ${selectedName === r.district_name ? "selected" : ""}`}
                  style={{ cursor: "pointer", padding: 12 }}
                >
                  <div className="district-head" style={{ marginBottom: 4 }}>
                    <div>
                      <div className="district-name">{i + 1}. {r.district_name.replace(" район", "")}</div>
                      <div className="district-pop">AQI {r.aqi}</div>
                    </div>
                    <div>
                      <span className="tag" style={{
                        background: gradeColor(r.eco_grade) + "22",
                        color: gradeColor(r.eco_grade),
                      }}>{r.eco_grade} · {r.eco_score}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {(tab === "map" || tab === "sources") ? (
        <div className="map-wrap">
          <BaseMap>
            {eco.districts.map((d) => {
              const c = DISTRICT_CENTERS[d.district_name];
              if (!c) return null;
              const isSel = selectedName === d.district_name;
              return (
                <Circle
                  key={d.district_name}
                  center={c}
                  radius={isSel ? 3200 : 2400}
                  pathOptions={{
                    color: d.aqi_category.color,
                    weight: isSel ? 3.5 : 2.5,
                    fillColor: d.aqi_category.color,
                    fillOpacity: isSel ? 0.38 : (tab === "sources" ? 0.12 : 0.28),
                    dashArray: isSel ? undefined : "6 4",
                  }}
                  eventHandlers={{
                    click: () => setSelectedName(isSel ? null : d.district_name),
                  }}
                >
                  <Popup>
                    <div className="facility-popup">
                      <div className="name">{d.district_name}</div>
                      <div className="type">AQI: <strong style={{ color: d.aqi_category.color }}>{d.aqi}</strong> ({d.aqi_category.label})</div>
                      <div className="type">Эко-оценка: {d.eco_score}/100 (грейд {d.eco_grade})</div>
                      <div className="type">Зелень: {d.green_m2_per_capita} м²/чел</div>
                      <div className="type">Трафик: {d.traffic_per_1000} авто / 1К жит.</div>
                    </div>
                  </Popup>
                </Circle>
              );
            })}

            {/* AQI-значения поверх кругов */}
            {eco.districts.map((d) => {
              const c = DISTRICT_CENTERS[d.district_name];
              if (!c) return null;
              const isSel = selectedName === d.district_name;
              const shortName = d.district_name.replace(" район", "");
              return (
                <Marker
                  key={`lbl-${d.district_name}`}
                  position={c}
                  icon={aqiLabelIcon(d.aqi, d.aqi_category.color, shortName, isSel)}
                  interactive={false}
                />
              );
            })}

            {tab === "sources" && <SourcesMapLayer visibleKeys={sourceVisible} />}
          </BaseMap>

          {tab === "sources" && (
            <div className="map-overlay tl" style={{ maxWidth: 320 }}>
              <SourcesLegend
                data={sourcesData}
                visibleKeys={sourceVisible}
                onToggle={toggleSource}
              />
            </div>
          )}

          {tab === "map" && (
            <div className="map-overlay bl">
              <div className="map-legend">
                <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 4, color: "var(--muted)", letterSpacing: 0.8, textTransform: "uppercase" }}>AQI</div>
                <div className="row"><span className="dot" style={{ background: "#10B981" }} /> 0–50 Хороший</div>
                <div className="row"><span className="dot" style={{ background: "#FBBF24" }} /> 51–100 Умер.</div>
                <div className="row"><span className="dot" style={{ background: "#FB923C" }} /> 101–150 Чувств.</div>
                <div className="row"><span className="dot" style={{ background: "#EF4444" }} /> 151–200 Вредный</div>
                <div className="row"><span className="dot" style={{ background: "#A855F7" }} /> 201+ Оч. вредный</div>
              </div>
            </div>
          )}

          {tab === "map" && (
            <div className="map-overlay bc">
              <div className="map-toast">
                💡 Кликните на круг района, чтобы увидеть детали. Размер круга — серьёзность проблемы.
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          {tab === "inversion" && <InversionForecastCard />}
          {tab === "cities" && <CitiesCompareCard />}
          {tab === "windows" && <WindowsCard district={selectedName ?? (eco.districts[0]?.district_name ?? null)} />}
        </div>
      )}

      <AIAssistant mode="eco" open={aiOpen} onClose={() => setAiOpen(false)} />
      <AIReportModal mode="eco" open={reportOpen} onClose={() => setReportOpen(false)} />
      <PersonalBriefModal
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        defaultDistrict={selectedName}
      />
      <HealthRiskModal
        open={riskOpen}
        onClose={() => setRiskOpen(false)}
        defaultDistrict={selectedName}
        availableDistricts={eco.districts.map((d) => d.district_name)}
      />
    </AppShell>
  );
}
