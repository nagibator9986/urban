import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import AppShell from "../components/shell/AppShell";
import AIReportModal from "../components/ai/AIReportModal";
import { IconDownload, IconSparkles } from "../components/shell/Icons";
import { getBusinessSummary, getCityEco, getCityStatistics } from "../services/api";
import type { BusinessSummary, CityEco, CityStatDetail, FacilityStatDetail, Mode } from "../types";
import { FACILITY_COLORS, FACILITY_EMOJI } from "../types";
import { exportToCsv } from "../lib/csvExport";

type Tab = "public" | "business" | "eco";

function gradeColor(s: number) {
  if (s >= 85) return "#10B981";
  if (s >= 65) return "#84CC16";
  if (s >= 50) return "#EAB308";
  if (s >= 35) return "#F97316";
  return "#EF4444";
}
function gradeLetter(s: number) {
  if (s >= 85) return "A"; if (s >= 70) return "B"; if (s >= 55) return "C"; if (s >= 40) return "D"; return "E";
}
function levelKlass(s: number) {
  if (s >= 85) return "high"; if (s >= 60) return "mid"; return "low";
}

const TAB_LABELS: Record<Tab, string> = {
  public: "Общественный", business: "Бизнес", eco: "Экология",
};

function exportCurrentTab(
  tab: Tab,
  stats: CityStatDetail | null,
  biz: BusinessSummary | null,
  eco: CityEco | null,
): void {
  if (tab === "public" && stats) {
    // Districts table
    exportToCsv(`aqyl-public-districts-${todayIso()}`, stats.districts, [
      { key: "district_name", header: "Район" },
      { key: "population", header: "Население" },
      { key: "overall_score", header: "Оценка_100" },
      ...stats.facilities.map((f) => ({
        key: `fac_${f.facility_type}`,
        header: f.label_ru,
        accessor: (d: typeof stats.districts[number]) =>
          d.facilities.find((x) => x.facility_type === f.facility_type)?.actual_count ?? 0,
      })),
    ]);
    return;
  }
  if (tab === "business" && biz) {
    exportToCsv(`aqyl-business-districts-${todayIso()}`, biz.districts, [
      { key: "district_name", header: "Район" },
      { key: "population", header: "Население" },
      { key: "total_businesses", header: "Бизнесов" },
      { key: "businesses_per_10k", header: "Бизнесов_на_10К" },
    ]);
    return;
  }
  if (tab === "eco" && eco) {
    exportToCsv(`aqyl-eco-districts-${todayIso()}`, eco.districts, [
      { key: "district_name", header: "Район" },
      { key: "aqi", header: "AQI" },
      { key: "eco_score", header: "Эко_оценка" },
      { key: "eco_grade", header: "Грейд" },
      { key: "green_m2_per_capita", header: "Зелень_м2_на_чел" },
      { key: "traffic_per_1000", header: "Трафик_на_1000" },
    ]);
    return;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StatsMode() {
  const [tab, setTab] = useState<Tab>("public");
  const [stats, setStats] = useState<CityStatDetail | null>(null);
  const [biz, setBiz] = useState<BusinessSummary | null>(null);
  const [eco, setEco] = useState<CityEco | null>(null);
  const [selDist, setSelDist] = useState<number | null>(null);
  const [reportMode, setReportMode] = useState<Mode | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([getCityStatistics(), getBusinessSummary(), getCityEco()])
      .then(([s, b, e]) => {
        if (!alive) return;
        if (s.status === "fulfilled") setStats(s.value);
        if (b.status === "fulfilled") setBiz(b.value);
        if (e.status === "fulfilled") setEco(e.value);
      });
    return () => { alive = false; };
  }, []);

  return (
    <AppShell
      topTitle="Статистика города"
      topSub={`Все три режима в одном дашборде · ${new Date().toLocaleDateString("ru-RU")}`}
      topActions={
        <div style={{ display: "flex", gap: 6 }}>
          <button className="pill-btn" onClick={() => exportCurrentTab(tab, stats, biz, eco)}>
            <IconDownload size={14} /> CSV
          </button>
          <button className="pill-btn primary" onClick={() => setReportMode(tab as Mode)}>
            <IconSparkles size={14} /> AI-отчёт по режиму
          </button>
        </div>
      }
    >
      <div className="stats-page">
        {/* Tabs */}
        <div className="chips" style={{ marginBottom: 8 }}>
          {(["public", "business", "eco"] as Tab[]).map((t) => (
            <button key={t}
                    className={`chip ${tab === t ? "active" : ""}`}
                    style={{ padding: "8px 16px", fontSize: 13 }}
                    onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === "public" && stats && <PublicStats stats={stats} selectedId={selDist} onSelect={setSelDist} openReport={() => setReportMode("public")} />}
        {tab === "business" && biz && <BusinessStats biz={biz} openReport={() => setReportMode("business")} />}
        {tab === "eco" && eco && <EcoStats eco={eco} openReport={() => setReportMode("eco")} />}
      </div>

      <AIReportModal mode={(reportMode ?? "public") as Mode} open={!!reportMode} onClose={() => setReportMode(null)} />
    </AppShell>
  );
}

// =================== PUBLIC ===================

function PublicStats({ stats, selectedId, onSelect, openReport }: {
  stats: CityStatDetail; selectedId: number | null; onSelect: (n: number | null) => void; openReport: () => void;
}) {
  const safeDistricts = Array.isArray(stats?.districts) ? stats.districts : [];
  const safeFacilities = Array.isArray(stats?.facilities) ? stats.facilities : [];
  const districtData = selectedId
    ? safeDistricts.find((d) => d.district_id === selectedId) ?? null
    : null;
  const current = districtData ? (districtData.facilities ?? []) : safeFacilities;
  const population = districtData ? districtData.population : (stats?.total_population ?? 0);
  const score = districtData ? districtData.overall_score : (stats?.overall_score ?? 0);
  const name = districtData ? districtData.district_name : "Весь город Алматы";
  const normStats = current.filter((f) => f.norm_per_10k > 0);

  if (safeDistricts.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
        <div style={{ fontWeight: 700 }}>Нет данных в БД</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Запустите collectors локально (см. DEPLOY.md шаг 6) чтобы наполнить базу.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Hero */}
      <div className="stats-hero">
        <div className="hero-primary">
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--muted)" }}>
            Общая оценка
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{name}</h1>
          <div className="hero-score">
            <span className="big">{score}</span>
            <span className="scale">/ 100</span>
            <span className="hero-grade">{gradeLetter(score)}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {population.toLocaleString("ru-RU")} жителей
            {!districtData && ` · ${stats.total_facilities.toLocaleString("ru-RU")} объектов`}
          </div>

          <div className="district-chips">
            <button className={`chip ${!selectedId ? "active" : ""}`} onClick={() => onSelect(null)}>
              Весь город
            </button>
            {safeDistricts.slice().sort((a, b) => b.population - a.population).map((d) => (
              <button key={d.district_id}
                      className={`chip ${selectedId === d.district_id ? "active" : ""}`}
                      onClick={() => onSelect(d.district_id)}>
                {d.district_name.replace(" район", "")}
                <span className={`score-pill ${levelKlass(d.overall_score)}`} style={{ padding: "1px 6px", fontSize: 10 }}>
                  {d.overall_score}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <h3>Радар покрытия нормативов</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={normStats.map((f) => ({ type: f.label_ru, v: Math.min(f.coverage_percent, 120) }))}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="type" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Radar dataKey="v" stroke="#2DD4BF" fill="#2DD4BF" fillOpacity={0.35} />
              <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI callout */}
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="ai-avatar" style={{ width: 42, height: 42, borderRadius: 12 }}><IconSparkles size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>AI-анализ по этому срезу</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            AQYL AI построит детальный отчёт со слабыми местами, рекомендациями и приоритетами.
          </div>
        </div>
        <button className="btn primary" onClick={openReport}>
          <IconSparkles size={14} /> Сгенерировать
        </button>
      </div>

      {/* Facility cards */}
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          Инфраструктура по типам
        </h3>
        <div className="card-grid">
          {normStats.map((f) => <FacilityStatCard key={f.facility_type} stat={f} />)}
        </div>
      </div>

      {/* Charts row */}
      <div className="charts-row">
        <div className="chart-card">
          <h3>Факт vs Норматив</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={normStats.map((s) => ({ name: s.label_ru, Факт: s.actual_count, Норма: s.norm_count }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Факт" fill="#2DD4BF" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Норма" fill="#334155" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Покрытие нормативов (%)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={normStats.map((s) => ({ name: s.label_ru, v: s.coverage_percent }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis type="number" domain={[0, 130]} tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} width={90} />
              <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
              <Bar dataKey="v" radius={[0, 3, 3, 0]}>
                {normStats.map((s, i) => (
                  <Cell key={i} fill={s.coverage_percent >= 100 ? "#10B981" : s.coverage_percent >= 70 ? "#F59E0B" : "#EF4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Districts comparison */}
      {!districtData && (
        <div className="chart-card">
          <h3>Сравнение районов по общей оценке</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={safeDistricts
              .slice()
              .sort((a, b) => b.overall_score - a.overall_score)
              .map((d) => ({ name: d.district_name.replace(" район", ""), score: d.overall_score }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {safeDistricts.map((d, i) => (<Cell key={i} fill={gradeColor(d.overall_score)} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="table-card">
        <h3>Детали по нормативам</h3>
        <table className="clean">
          <thead>
            <tr>
              <th>Тип</th><th>Факт</th><th>Норма</th><th>на 10К</th>
              <th>Мощность</th><th>Нужно</th><th>Дефицит</th><th>Покрытие</th>
            </tr>
          </thead>
          <tbody>
            {normStats.map((s) => (
              <tr key={s.facility_type} data-status={s.coverage_percent >= 100 ? "ok" : s.coverage_percent >= 70 ? "warn" : "crit"}>
                <td style={{ fontWeight: 700 }}>{FACILITY_EMOJI[s.facility_type as keyof typeof FACILITY_EMOJI] ?? "·"} {s.label_ru}</td>
                <td>{s.actual_count}</td>
                <td style={{ color: "var(--muted)" }}>{s.norm_count}</td>
                <td>{s.actual_per_10k}</td>
                <td>{s.total_capacity > 0 ? `${s.total_capacity.toLocaleString("ru-RU")} ${s.capacity_unit}` : "—"}</td>
                <td style={{ color: "var(--muted)" }}>{s.needed_capacity > 0 ? `${s.needed_capacity.toLocaleString("ru-RU")} ${s.capacity_unit}` : "—"}</td>
                <td style={{ color: s.deficit > 0 ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>
                  {s.deficit > 0 ? `−${s.deficit}` : s.surplus > 0 ? `+${s.surplus}` : "0"}
                </td>
                <td><span className={`tag ${s.coverage_percent >= 100 ? "high" : s.coverage_percent >= 70 ? "mid" : "low"}`}>{s.coverage_percent}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FacilityStatCard({ stat }: { stat: FacilityStatDetail }) {
  const color = FACILITY_COLORS[stat.facility_type as keyof typeof FACILITY_COLORS] ?? "#888";
  const emoji = FACILITY_EMOJI[stat.facility_type as keyof typeof FACILITY_EMOJI] ?? "·";
  const barColor = stat.coverage_percent >= 100 ? "#10B981" : stat.coverage_percent >= 70 ? "#F59E0B" : "#EF4444";

  return (
    <div className="fac-card">
      <div className="fac-head">
        <div className="fac-icon" style={{ background: color + "22", color }}>{emoji}</div>
        <div style={{ flex: 1 }}>
          <div className="fac-name">{stat.label_ru}</div>
          <div className="fac-source">{stat.source.slice(0, 60)}...</div>
        </div>
      </div>
      <div className="fac-big-row">
        <div className="fac-big">
          <span className="v">{stat.actual_count}</span>
          <span className="l">Факт</span>
        </div>
        <div className="fac-big">
          <span className="v muted">{stat.norm_count}</span>
          <span className="l">Норма</span>
        </div>
      </div>
      <div className="bar-wrap">
        <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(stat.coverage_percent, 100)}%`, background: barColor }} /></div>
        <span className="bar-label">{stat.coverage_percent}%</span>
      </div>
      {stat.total_capacity > 0 && (
        <>
          <div className="capacity-row"><span className="k">Мощность</span>
            <span className="v">{stat.total_capacity.toLocaleString("ru-RU")} {stat.capacity_unit}</span></div>
          <div className="capacity-row"><span className="k">Нужно</span>
            <span className="v">{stat.needed_capacity.toLocaleString("ru-RU")} {stat.capacity_unit}</span></div>
        </>
      )}
    </div>
  );
}

// =================== BUSINESS ===================

function BusinessStats({ biz, openReport }: { biz: BusinessSummary; openReport: () => void }) {
  const safeDistricts = Array.isArray(biz?.districts) ? biz.districts : [];
  const safeTopCats = Array.isArray(biz?.top_categories) ? biz.top_categories : [];
  const topCats = safeTopCats.slice(0, 8);

  if (safeDistricts.length === 0 && safeTopCats.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💼</div>
        <div style={{ fontWeight: 700 }}>Нет данных в БД</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Запустите collectors локально (см. DEPLOY.md шаг 6) чтобы наполнить базу.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="stats-hero">
        <div className="hero-primary">
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--muted)" }}>
            Всего бизнесов в базе
          </div>
          <div className="hero-score">
            <span className="big">{(biz?.total_businesses ?? 0).toLocaleString("ru-RU")}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            В {safeDistricts.filter((d) => d.total_businesses > 0).length} районах · {safeTopCats.length} категорий
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={openReport}>
              <IconSparkles size={14} /> AI-отчёт
            </button>
          </div>
        </div>
        <div className="chart-card">
          <h3>Топ категории</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={topCats.map((c) => ({ name: c.label, value: c.count }))}
                cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                paddingAngle={2} dataKey="value"
              >
                {topCats.map((_, i) => (
                  <Cell key={i} fill={["#2DD4BF", "#22D3EE", "#F59E0B", "#A855F7", "#EC4899", "#10B981", "#EF4444", "#F97316"][i % 8]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <h3>Плотность бизнеса по районам (на 10К жителей)</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={safeDistricts.map((d) => ({ name: d.district_name.replace(" район", ""), v: d.businesses_per_10k }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
            <Bar dataKey="v" fill="#22D3EE" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="table-card">
        <h3>По районам</h3>
        <table className="clean">
          <thead>
            <tr><th>Район</th><th>Население</th><th>Бизнесов</th><th>На 10К</th></tr>
          </thead>
          <tbody>
            {safeDistricts.map((d) => (
              <tr key={d.district_name}>
                <td style={{ fontWeight: 700 }}>{d.district_name}</td>
                <td>{d.population.toLocaleString("ru-RU")}</td>
                <td>{d.total_businesses.toLocaleString("ru-RU")}</td>
                <td style={{ color: "var(--brand-1)", fontWeight: 700 }}>{d.businesses_per_10k}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// =================== ECO ===================

function EcoStats({ eco, openReport }: { eco: CityEco; openReport: () => void }) {
  const ecoDistricts = Array.isArray(eco?.districts) ? eco.districts : [];
  const ecoRanking = Array.isArray(eco?.ranking) ? eco.ranking : [];

  if (ecoDistricts.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🌿</div>
        <div style={{ fontWeight: 700 }}>Нет экологических данных</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Запустите collectors локально (см. DEPLOY.md шаг 6) чтобы наполнить базу.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="stats-hero">
        <div className="hero-primary">
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--muted)" }}>
            AQI · Экология · Алматы
          </div>
          <div className="hero-score">
            <span className="big" style={{ background: "none", color: eco.city_aqi_category.color, WebkitTextFillColor: "unset" }}>{eco.city_aqi}</span>
            <span className="scale">AQI</span>
            <span className="hero-grade" style={{ background: eco.city_aqi_category.color, color: "#fff" }}>{eco.city_aqi_category.label}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Эко-оценка: <strong>{eco.city_eco_score}/100</strong> · Зелень: <strong>{eco.city_green_m2_per_capita} м²/чел</strong> (норма {eco.city_green_norm})
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={openReport}>
              <IconSparkles size={14} /> AI-отчёт по экологии
            </button>
          </div>
        </div>
        <div className="chart-card">
          <h3>AQI по районам</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ecoDistricts.map((d) => ({ name: d.district_name.replace(" район", ""), v: d.aqi, color: d.aqi_category.color }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
              <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                {ecoDistricts.map((d, i) => (<Cell key={i} fill={d.aqi_category.color} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <h3>Озеленение (м²/чел)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={ecoDistricts.map((d) => ({ name: d.district_name.replace(" район", ""), v: d.green_m2_per_capita }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} width={100} />
              <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
              <Bar dataKey="v" radius={[0, 3, 3, 0]}>
                {ecoDistricts.map((d, i) => (<Cell key={i} fill={d.green_m2_per_capita >= 16 ? "#10B981" : d.green_m2_per_capita >= 8 ? "#F59E0B" : "#EF4444"} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Автотранспорт (на 1К жит.)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={ecoDistricts.map((d) => ({ name: d.district_name.replace(" район", ""), v: d.traffic_per_1000 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8 }} />
              <Bar dataKey="v" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="table-card">
        <h3>Рейтинг районов</h3>
        <table className="clean">
          <thead>
            <tr><th>#</th><th>Район</th><th>AQI</th><th>Эко-оценка</th><th>Грейд</th></tr>
          </thead>
          <tbody>
            {ecoRanking.map((r, i) => (
              <tr key={r.district_name}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 700 }}>{r.district_name}</td>
                <td style={{ color: ecoDistricts.find((d) => d.district_name === r.district_name)?.aqi_category.color, fontWeight: 700 }}>{r.aqi}</td>
                <td>{r.eco_score}</td>
                <td><span className="tag" style={{ background: gradeColor(r.eco_score) + "22", color: gradeColor(r.eco_score) }}>{r.eco_grade}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
