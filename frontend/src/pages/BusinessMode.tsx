import { useEffect, useMemo, useState } from "react";
import { CircleMarker, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import AppShell from "../components/shell/AppShell";
import BaseMap from "../components/map/BaseMap";
import AIAssistant from "../components/ai/AIAssistant";
import AIReportModal from "../components/ai/AIReportModal";
import BusinessPlanModal from "../components/business/BusinessPlanModal";
import DistrictRecommender from "../components/business/DistrictRecommender";
import CannibalSimModal from "../components/business/CannibalSimModal";
import TimeCoverageCard from "../components/business/TimeCoverageCard";
import {
  SpendingHeatmapLayer, SpendingLegend,
} from "../components/business/SpendingHeatmapLayer";
import {
  BestLocationGridLayer, BestLocationGridLegend, useBestLocationsGrid,
} from "../components/business/BestLocationGridLayer";
import {
  RadiusAnalyzerPanel, RadiusCircle, RadiusClickCapturer, useRadiusAnalyzer,
  TwoPointCircles, TwoPointPanel, useTwoPointAnalyzer,
} from "../components/business/RadiusAnalyzer";
import { IconBot, IconSparkles } from "../components/shell/Icons";
import {
  getBestLocations, getBusinessCategories, getBusinessGeoJSON, getBusinessSummary,
  getSpendingPotential,
} from "../services/api";
import type {
  BestLocation, BusinessCategories, BusinessGeoJSON, BusinessSummary,
  SpendingPotentialResponse,
} from "../types";
import { BUSINESS_COLORS } from "../types";

type BizTab = "map" | "recommender" | "spending" | "radius" | "compare2" | "time";

const starIcon = L.divIcon({
  html: `<div style="
    width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#2DD4BF,#22D3EE);color:#052029;font-weight:800;font-size:15px;
    border:2px solid #0A0F1A;box-shadow:0 0 20px rgba(45,212,191,0.55);">★</div>`,
  className: "", iconSize: [34, 34], iconAnchor: [17, 17],
});

function clusterIcon(c: any) {
  const n = c.getChildCount();
  const size = n < 20 ? 32 : n < 100 ? 42 : 52;
  return L.divIcon({
    html: `<span>${n}</span>`,
    className: "marker-cluster cluster-biz",
    iconSize: L.point(size, size),
  });
}

export default function BusinessMode() {
  const [tab, setTab] = useState<BizTab>("map");
  const [cats, setCats] = useState<BusinessCategories | null>(null);
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [geo, setGeo] = useState<BusinessGeoJSON | null>(null);
  const [best, setBest] = useState<BestLocation[]>([]);
  const [showBest, setShowBest] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [loading, setLoading] = useState(false);
  const gridData = useBestLocationsGrid(showGrid && selected ? selected : null);

  const [aiOpen, setAiOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [cannibalOpen, setCannibalOpen] = useState(false);

  // Radius analyzer (single point) and 2-point compare
  const radius = useRadiusAnalyzer();
  const twoPt = useTwoPointAnalyzer();

  // Spending heatmap data (for legend)
  const [spending, setSpending] = useState<SpendingPotentialResponse | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([getBusinessCategories(), getBusinessSummary()]).then(
      ([c, s]) => {
        if (!alive) return;
        if (c.status === "fulfilled") setCats(c.value);
        if (s.status === "fulfilled") setSummary(s.value);
      },
    );
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (tab !== "spending" || spending) return;
    let alive = true;
    getSpendingPotential().then((d) => { if (alive) setSpending(d); }).catch(() => {});
    return () => { alive = false; };
  }, [tab, spending]);

  useEffect(() => {
    if (!selected) { setGeo(null); setBest([]); return; }
    let cancelled = false;
    setLoading(true);
    getBusinessGeoJSON(selected)
      .then((g) => { if (!cancelled) setGeo(g); })
      .catch(() => { if (!cancelled) setGeo(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!selected || !showBest) { setBest([]); return; }
    getBestLocations(selected, 5).then(setBest).catch(() => setBest([]));
  }, [selected, showBest]);

  const selLabel = useMemo(
    () => (cats && selected) ? (cats.all.find((c) => c.value === selected)?.label ?? selected) : "",
    [cats, selected],
  );

  const districtNames = useMemo(
    () => (summary?.districts ?? []).map((d) => d.district_name),
    [summary],
  );

  return (
    <AppShell
      topTitle="Бизнес-аналитика"
      topSub="Карта · AI-рекомендер · анализ территории · каннибализация · часы-ниши"
      topActions={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            { key: "map",         label: "Карта",         emoji: "🗺" },
            { key: "recommender", label: "AI-советник",    emoji: "🎯" },
            { key: "spending",    label: "Spending",       emoji: "💰" },
            { key: "radius",      label: "Анализ зоны",    emoji: "📍" },
            { key: "compare2",    label: "A/B точки",      emoji: "📊" },
            { key: "time",        label: "Часы-ниши",      emoji: "🕐" },
          ] as { key: BizTab; label: string; emoji: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pill-btn ${tab === t.key ? "primary" : ""}`}
              style={{ fontSize: 12 }}
            >
              <span style={{ marginRight: 4 }}>{t.emoji}</span>{t.label}
            </button>
          ))}
          <span style={{ width: 1, background: "var(--border)", height: 20, margin: "0 4px", alignSelf: "center" }} />
          <button className="cta-gradient" onClick={() => setPlanOpen(true)}>
            <IconSparkles size={14} /> Бизнес-план
          </button>
          <button className="pill-btn" onClick={() => setCannibalOpen(true)}>
            <IconSparkles size={14} /> Каннибализация
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
      {/* LEFT PANEL */}
      <aside className="panel">
        <div className="panel-head">
          <h2>Бизнес-ландшафт</h2>
          <p>{summary ? `${summary.total_businesses.toLocaleString("ru-RU")} бизнесов в базе` : "Загрузка..."}</p>
        </div>
        <div className="panel-body">
          {(tab === "map" || tab === "recommender") && summary && (
            <>
              {/* Summary */}
              <div className="stats-grid">
                <div className="stat">
                  <span className="stat-label">Всего</span>
                  <span className="stat-value brand">{summary.total_businesses.toLocaleString("ru-RU")}</span>
                  <span className="stat-unit">объектов</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Районов</span>
                  <span className="stat-value">{summary.districts.filter((d) => d.total_businesses > 0).length}</span>
                  <span className="stat-unit">активных</span>
                </div>
              </div>
            </>
          )}

          {tab === "map" && cats && (
            <>
              {Object.entries(cats.groups).map(([group, items]) => (
                <div key={group}>
                  <div className="biz-group-title">{group}</div>
                  <div className="chips">
                    {items.map((c) => (
                      <button
                        key={c.value}
                        className={`chip ${selected === c.value ? "active" : ""}`}
                        onClick={() => setSelected(selected === c.value ? null : c.value)}
                        style={selected === c.value ? {
                          background: (BUSINESS_COLORS[c.value] ?? "#888") + "22",
                          borderColor: BUSINESS_COLORS[c.value] ?? "#888",
                          color: BUSINESS_COLORS[c.value] ?? "#888",
                        } : undefined}
                      >
                        <span className="dot" style={{ background: BUSINESS_COLORS[c.value] ?? "#888" }} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {selected && geo && (
                <div className="card">
                  <div className="card-title">{selLabel}</div>
                  <div className="stats-grid">
                    <div className="stat">
                      <span className="stat-label">На карте</span>
                      <span className="stat-value">{geo.features.length}</span>
                      <span className="stat-unit">бизнесов</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Среднее</span>
                      <span className="stat-value">
                        {summary ? (geo.features.length / summary.districts.length).toFixed(1) : "—"}
                      </span>
                      <span className="stat-unit">на район</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                    <button
                      className={`btn ${showBest ? "primary" : ""}`}
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => setShowBest((v) => !v)}
                    >
                      {showBest ? "Скрыть топ районов" : "⭐ Топ-5 районов"}
                    </button>
                    <button
                      className={`btn ${showGrid ? "primary" : ""}`}
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => setShowGrid((v) => !v)}
                    >
                      {showGrid ? "Скрыть grid" : "🔬 Sub-district grid"}
                    </button>
                  </div>
                </div>
              )}

              {showGrid && selected && (
                <BestLocationGridLegend data={gridData} />
              )}
            </>
          )}

          {tab === "spending" && <SpendingLegend data={spending} />}

          {tab === "radius" && (
            <RadiusAnalyzerPanel
              center={radius.center}
              radius={radius.radius}
              onRadiusChange={radius.setRadius}
              onReset={() => radius.setCenter(null)}
              categoryFilter={null}
              data={radius.data}
              loading={radius.loading}
            />
          )}

          {tab === "compare2" && (
            <TwoPointPanel state={twoPt} categoryFilter={null} />
          )}
        </div>
      </aside>

      {/* MAIN BODY */}
      {(tab === "map" || tab === "spending" || tab === "radius" || tab === "compare2") ? (
        <div className="map-wrap">
          <BaseMap>
            {tab === "radius" && (
              <RadiusClickCapturer
                active={tab === "radius"}
                onPick={(lat, lon) => radius.setCenter({ lat, lon })}
              />
            )}
            {tab === "radius" && radius.center && (
              <RadiusCircle center={radius.center} radius={radius.radius} />
            )}

            {tab === "compare2" && (
              <RadiusClickCapturer
                active={tab === "compare2"}
                onPick={(lat, lon) => twoPt.placePoint(lat, lon)}
              />
            )}
            {tab === "compare2" && <TwoPointCircles state={twoPt} />}

            {tab === "spending" && <SpendingHeatmapLayer visible />}

            {tab === "map" && showGrid && selected && (
              <BestLocationGridLayer category={selected} />
            )}

            {tab === "map" && geo && (
              <MarkerClusterGroup
                chunkedLoading maxClusterRadius={40}
                disableClusteringAtZoom={15} iconCreateFunction={clusterIcon}
              >
                {geo.features.map((f) => (
                  <CircleMarker
                    key={f.properties.id}
                    center={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
                    radius={6}
                    pathOptions={{
                      color: "#ffffff", weight: 1.8,
                      fillColor: BUSINESS_COLORS[f.properties.category] ?? "#888", fillOpacity: 0.95,
                    }}
                  >
                    <Popup>
                      <div className="facility-popup">
                        <div className="name">{f.properties.name || "Без названия"}</div>
                        {f.properties.cuisine && <div className="type">Кухня: {f.properties.cuisine}</div>}
                        {f.properties.address && <div className="address">{f.properties.address}</div>}
                        {f.properties.phone && <div className="type">{f.properties.phone}</div>}
                        {f.properties.opening_hours && <div className="type">{f.properties.opening_hours}</div>}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MarkerClusterGroup>
            )}

            {tab === "map" && showBest && best.map((l, i) => (
              <Marker key={l.district_name} position={[l.suggested_lat, l.suggested_lon]} icon={starIcon}>
                <Popup>
                  <div className="facility-popup">
                    <div className="name">#{i + 1} {l.district_name}</div>
                    <div className="type">Оценка: {l.score}/100</div>
                    <div className="type">Конкурентов: {l.existing_count}</div>
                    {l.reasons.map((r, j) => <div key={j} className="address">{r}</div>)}
                  </div>
                </Popup>
              </Marker>
            ))}
          </BaseMap>

          {tab === "map" && !selected && (
            <div className="map-overlay bc">
              <div className="map-toast">💡 Выберите категорию бизнеса слева, чтобы увидеть его на карте</div>
            </div>
          )}
          {tab === "radius" && !radius.center && (
            <div className="map-overlay bc">
              <div className="map-toast">📍 Кликните в любую точку карты — я посчитаю конкурентов и демографию вокруг</div>
            </div>
          )}
          {tab === "compare2" && (!twoPt.pointA || !twoPt.pointB) && (
            <div className="map-overlay bc">
              <div className="map-toast">
                📊 Активная: <b>{twoPt.active ?? "—"}</b> · Кликайте на карту чтобы поставить
                {!twoPt.pointA ? " точку A" : !twoPt.pointB ? " точку B" : ""}.
              </div>
            </div>
          )}
          {tab === "spending" && (
            <div className="map-overlay bc">
              <div className="map-toast">💡 Зелёные районы — высокий spending-потенциал (доход × население × свободные ниши)</div>
            </div>
          )}
          {loading && tab === "map" && (
            <div className="map-overlay tl">
              <div className="map-toast">Загрузка бизнесов...</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          {tab === "recommender" && (
            <DistrictRecommender
              availableDistricts={districtNames}
              defaultDistrict={districtNames[0]}
              onCategorySelect={(c) => {
                setSelected(c);
                setTab("map");
              }}
            />
          )}
          {tab === "time" && (
            <TimeCoverageCard categories={cats} availableDistricts={districtNames} />
          )}
        </div>
      )}

      <AIAssistant mode="business" open={aiOpen} onClose={() => setAiOpen(false)} />
      <AIReportModal mode="business" open={reportOpen} onClose={() => setReportOpen(false)} />
      <BusinessPlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        defaultCategory={selected}
      />
      <CannibalSimModal
        open={cannibalOpen}
        onClose={() => setCannibalOpen(false)}
        categories={cats}
        presetCategory={selected ?? undefined}
        presetLat={radius.center?.lat}
        presetLon={radius.center?.lon}
      />
    </AppShell>
  );
}
