import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend,
  Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { IconPause, IconPlay, IconReset, IconSparkles } from "../shell/Icons";
import { renderMarkdown } from "../ui/markdown";
import type { FuturesForecast } from "../../types";
import { aqiColor, gradeColor, ruNum } from "./shared";

interface Props {
  data: FuturesForecast;
  loading: boolean;
  /** Optional baseline forecast — drawn as ghost line behind main series */
  baseline?: FuturesForecast | null;
}

export default function FuturesDashboard({ data, loading, baseline }: Props) {
  const years = useMemo(() => data.population_series.map((p) => p.year), [data]);
  const [cursorYear, setCursorYear] = useState<number>(years[years.length - 1]);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(800);

  const snapshot = useSnapshot(data, cursorYear);

  // Reset cursor when scenario changes (years array length might differ)
  useEffect(() => {
    setCursorYear(years[years.length - 1]);
    setPlaying(false);
  }, [years.length, years]);

  // Playback effect
  const cursorRef = useRef(cursorYear);
  cursorRef.current = cursorYear;
  useEffect(() => {
    if (!playing) return;
    const min = years[0];
    const max = years[years.length - 1];
    const id = setInterval(() => {
      const cur = cursorRef.current;
      if (cur >= max) {
        setPlaying(false);
        return;
      }
      setCursorYear(Math.min(max, cur + 1));
    }, speedMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speedMs, years]);

  const startFromBeginning = () => {
    setCursorYear(years[0]);
    setPlaying(true);
  };

  // Build merged series for ghost-line baseline overlay (year as join key)
  const popMerged = useMergedSeries(
    data.population_series.map((p) => ({ year: p.year, age_0_6: p.age_0_6, age_6_18: p.age_6_18, age_18_65: p.age_18_65, age_65: p.age_65 })),
    baseline?.population_series.map((p) => ({ year: p.year, age_0_6: p.age_0_6, age_6_18: p.age_6_18, age_18_65: p.age_18_65, age_65: p.age_65 })),
    "_baseline_total",
    (b: any) => (b ? (b.age_0_6 + b.age_6_18 + b.age_18_65 + b.age_65) : null),
  );
  const infraMerged = useMergedSeries(
    data.infrastructure_series.map((p) => ({ year: p.year, infra_score: p.infra_score, by_type: p.by_type })),
    baseline?.infrastructure_series.map((p) => ({ year: p.year, infra_score: p.infra_score })),
    "_baseline_infra_score",
    (b: any) => (b ? b.infra_score : null),
  );
  const ecoMerged = useMergedSeries(
    data.eco_series.map((p) => ({ ...p })),
    baseline?.eco_series.map((p) => ({ ...p })),
    "_baseline_aqi",
    (b: any) => (b ? b.aqi : null),
  );
  const bizMerged = useMergedSeries(
    data.business_series.map((p) => ({ ...p })),
    baseline?.business_series.map((p) => ({ ...p })),
    "_baseline_estimated_businesses",
    (b: any) => (b ? b.estimated_businesses : null),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: loading ? 0.5 : 1 }}>

      {/* HERO */}
      <div className="hero-primary" style={{ padding: 28 }}>
        <div
          style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
            textTransform: "uppercase", color: "var(--muted)",
          }}
        >
          Сценарий: {data.scenario_name} · горизонт {data.horizon_years} лет
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
            gap: 14,
            marginTop: 18,
          }}
        >
          <HeroStat
            label="Население к концу"
            value={ruNum(data.final_population)}
            delta={`${data.comparison_to_today.population_growth_percent >= 0 ? "+" : ""}${data.comparison_to_today.population_growth_percent}%`}
            color="#2DD4BF"
          />
          <HeroStat
            label="Оценка будущего"
            value={`${data.overall_future_score}/100`}
            delta={`грейд ${data.overall_grade}`}
            color={gradeColor(data.overall_grade)}
          />
          <HeroStat
            label="Инфра Δ"
            value={`${data.comparison_to_today.infra_delta >= 0 ? "+" : ""}${data.comparison_to_today.infra_delta}`}
            delta="к оценке"
            color={data.comparison_to_today.infra_delta >= 0 ? "#10B981" : "#EF4444"}
          />
          <HeroStat
            label="Эко Δ"
            value={`${data.comparison_to_today.eco_delta >= 0 ? "+" : ""}${data.comparison_to_today.eco_delta}`}
            delta="к оценке"
            color={data.comparison_to_today.eco_delta >= 0 ? "#10B981" : "#EF4444"}
          />
        </div>
      </div>

      {/* YEAR CURSOR + PLAYBACK */}
      <YearCursor
        years={years}
        value={cursorYear}
        onChange={setCursorYear}
        snapshot={snapshot}
        playing={playing}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onRestart={startFromBeginning}
        speedMs={speedMs}
        onSpeedChange={setSpeedMs}
        atEnd={cursorYear >= years[years.length - 1]}
      />

      {/* CRITICAL POINTS */}
      {data.critical_points.length > 0 && (
        <div className="card">
          <div className="card-title">⚠️ Критические точки развития</div>
          <div style={{ position: "relative", paddingLeft: 20, marginTop: 10 }}>
            <div
              style={{
                position: "absolute", left: 8, top: 0, bottom: 0,
                width: 2, background: "var(--border)",
              }}
            />
            {data.critical_points.map((c, i) => {
              const col = c.severity === "high" ? "#EF4444"
                : c.severity === "medium" ? "#F59E0B" : "#22D3EE";
              return (
                <div
                  key={`${c.year}-${c.kind}-${i}`}
                  onClick={() => setCursorYear(c.year)}
                  style={{
                    position: "relative", marginBottom: 14, paddingLeft: 16,
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      position: "absolute", left: -20, top: 4,
                      width: 14, height: 14, borderRadius: "50%",
                      background: col, boxShadow: `0 0 0 3px ${col}33`,
                    }}
                  />
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: col }}>{c.year}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>
                    {c.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* POPULATION CHART */}
      <div className="card">
        <div className="card-title">
          👥 Население: общий рост и возрастная структура
          {baseline && <span style={ghostBadge}>+ baseline</span>}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={popMerged}>
            <defs>
              <linearGradient id="age65" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="age18_65" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="age6_18" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="age0_6" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A855F7" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#A855F7" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
            />
            <Tooltip
              contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => ruNum(v)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={cursorYear} stroke="#2DD4BF" strokeDasharray="3 3" />
            <Area stackId="1" dataKey="age_0_6"   name="0-6"   fill="url(#age0_6)"   stroke="#A855F7" />
            <Area stackId="1" dataKey="age_6_18"  name="6-18"  fill="url(#age6_18)"  stroke="#22D3EE" />
            <Area stackId="1" dataKey="age_18_65" name="18-65" fill="url(#age18_65)" stroke="#2DD4BF" />
            <Area stackId="1" dataKey="age_65"    name="65+"   fill="url(#age65)"    stroke="#F59E0B" />
            {baseline && (
              <Line type="monotone" dataKey="_baseline_total" name="baseline (всего)"
                    stroke="rgba(255,255,255,0.5)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="charts-row">
        {/* INFRA */}
        <div className="card">
          <div className="card-title">
            🏫 Инфра-покрытие (% СНиП)
            {baseline && <span style={ghostBadge}>+ baseline</span>}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={infraMerged}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis domain={[0, 120]} tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={100} stroke="#10B981" strokeDasharray="3 3" />
              <ReferenceLine x={cursorYear} stroke="#2DD4BF" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="infra_score" name="Общая оценка"
                    stroke="#2DD4BF" strokeWidth={2.5} dot={false} />
              <Line
                type="monotone"
                dataKey={(d: any) => d.by_type?.school?.coverage_percent ?? 0}
                name="Школы" stroke="#38BDF8" strokeWidth={1.5} dot={false}
              />
              <Line
                type="monotone"
                dataKey={(d: any) => d.by_type?.kindergarten?.coverage_percent ?? 0}
                name="Детсады" stroke="#A855F7" strokeWidth={1.5} dot={false}
              />
              <Line
                type="monotone"
                dataKey={(d: any) => d.by_type?.clinic?.coverage_percent ?? 0}
                name="Поликлиники" stroke="#F97316" strokeWidth={1.5} dot={false}
              />
              {baseline && (
                <Line type="monotone" dataKey="_baseline_infra_score" name="baseline"
                      stroke="rgba(255,255,255,0.5)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ECO */}
        <div className="card">
          <div className="card-title">
            🌬 AQI · Эко-оценка · BRT
            {baseline && <span style={ghostBadge}>+ baseline</span>}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={ecoMerged}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine yAxisId="left" y={100} stroke="#FBBF24" strokeDasharray="2 2" />
              <ReferenceLine yAxisId="left" y={150} stroke="#FB923C" strokeDasharray="2 2" />
              <ReferenceLine yAxisId="left" y={200} stroke="#EF4444" strokeDasharray="2 2" />
              <ReferenceLine yAxisId="left" x={cursorYear} stroke="#2DD4BF" strokeDasharray="3 3" />
              <Line yAxisId="left" type="monotone" dataKey="aqi" name="AQI"
                    stroke="#EF4444" strokeWidth={2.5} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="eco_score" name="Эко-оценка"
                    stroke="#10B981" strokeWidth={2} dot={false} />
              <Line
                yAxisId="right" type="monotone" dataKey="brt_coverage_percent"
                name="BRT покрытие %" stroke="#22D3EE" strokeWidth={1.5}
                dot={false} strokeDasharray="3 3"
              />
              {baseline && (
                <Line yAxisId="left" type="monotone" dataKey="_baseline_aqi"
                      name="baseline AQI" stroke="rgba(255,255,255,0.5)"
                      strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* BUSINESS */}
      <div className="card">
        <div className="card-title">
          💼 Бизнес-ландшафт: потенциал рынка и пробел
          {baseline && <span style={ghostBadge}>+ baseline</span>}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={bizMerged}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}К` : String(v)}
            />
            <Tooltip
              contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => ruNum(v)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={cursorYear} stroke="#2DD4BF" strokeDasharray="3 3" />
            <Bar dataKey="market_gap" name="Свободная ниша рынка" fill="#F59E0B" />
            <Line type="monotone" dataKey="market_capacity" name="Потенциал рынка"
                  stroke="#22D3EE" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="estimated_businesses" name="Прогноз бизнесов"
                  stroke="#2DD4BF" strokeWidth={2.5} dot={false} />
            {baseline && (
              <Line type="monotone" dataKey="_baseline_estimated_businesses" name="baseline"
                    stroke="rgba(255,255,255,0.5)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* RADAR — final year */}
      <FinalSnapshot data={data} />

      {/* AI MEMORANDUM */}
      {data.ai_analysis && (
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, rgba(45,212,191,0.06), rgba(34,211,238,0.02)), var(--surface)",
            border: "1px solid rgba(45,212,191,0.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div className="ai-avatar" style={{ width: 40, height: 40, borderRadius: 12 }}>
              <IconSparkles size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>AQYL Futures — стратегический меморандум</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Движок: {data.ai_analysis.engine} ·
                сгенерировано {new Date(data.ai_analysis.generated_at).toLocaleString("ru-RU")}
              </div>
            </div>
          </div>
          <div className="md-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.ai_analysis.markdown) }} />
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Year cursor
// =====================================================================

interface Snapshot {
  population: number;
  depRatio: number;
  aqi: number;
  ecoScore: number;
  infraScore: number;
  businesses: number;
  marketGap: number;
  brtCoverage: number;
  greenM2: number;
}

function useSnapshot(data: FuturesForecast, year: number): Snapshot {
  return useMemo(() => {
    const pop = data.population_series.find((p) => p.year === year);
    const infra = data.infrastructure_series.find((p) => p.year === year);
    const eco = data.eco_series.find((p) => p.year === year);
    const biz = data.business_series.find((p) => p.year === year);
    return {
      population: pop?.population ?? 0,
      depRatio: pop?.dependency_ratio ?? 0,
      infraScore: infra?.infra_score ?? 0,
      aqi: eco?.aqi ?? 0,
      ecoScore: eco?.eco_score ?? 0,
      brtCoverage: eco?.brt_coverage_percent ?? 0,
      greenM2: eco?.green_m2_per_capita ?? 0,
      businesses: biz?.estimated_businesses ?? 0,
      marketGap: biz?.market_gap ?? 0,
    };
  }, [data, year]);
}

function YearCursor({
  years, value, onChange, snapshot,
  playing, onPlay, onPause, onRestart, speedMs, onSpeedChange, atEnd,
}: {
  years: number[];
  value: number;
  onChange: (y: number) => void;
  snapshot: Snapshot;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  speedMs: number;
  onSpeedChange: (ms: number) => void;
  atEnd: boolean;
}) {
  const min = years[0] ?? 0;
  const max = years[years.length - 1] ?? min;
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
        <div className="card-title" style={{ margin: 0 }}>
          📍 Бегунок по годам · <span style={{ color: "var(--brand-1)" }}>{value}</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            className="pill-btn primary"
            style={{ fontSize: 11 }}
            onClick={() => {
              if (atEnd) onRestart();
              else if (playing) onPause();
              else onPlay();
            }}
            title={playing ? "Пауза" : atEnd ? "Заново" : "Воспроизвести"}
          >
            {playing
              ? <><IconPause size={12} /> Пауза</>
              : atEnd
                ? <><IconReset size={12} /> Заново</>
                : <><IconPlay size={12} /> Воспр.</>
            }
          </button>
          <select
            value={speedMs}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            style={{
              padding: "4px 6px", borderRadius: 6,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              color: "var(--text, #E5E7EB)", fontSize: 11,
            }}
            title="Скорость анимации"
          >
            <option value={1500}>×0.5</option>
            <option value={800}>×1</option>
            <option value={400}>×2</option>
            <option value={200}>×4</option>
          </select>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", marginTop: 8 }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
          gap: 10,
          marginTop: 14,
        }}
      >
        <MiniStat label="Население" value={ruNum(snapshot.population)} />
        <MiniStat label="Демограф. нагрузка" value={`${snapshot.depRatio}%`} />
        <MiniStat label="AQI" value={`${snapshot.aqi}`} color={aqiColor(snapshot.aqi)} />
        <MiniStat label="Эко-оценка" value={`${snapshot.ecoScore}/100`} />
        <MiniStat label="Инфра-оценка" value={`${snapshot.infraScore}/100`} />
        <MiniStat label="BRT покрытие" value={`${snapshot.brtCoverage}%`} />
        <MiniStat label="Зелень м²/чел" value={`${snapshot.greenM2}`} />
        <MiniStat label="Бизнесов" value={ruNum(snapshot.businesses)} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div
        style={{
          fontSize: 10, color: "var(--muted)", fontWeight: 700,
          letterSpacing: 0.6, textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color ?? "var(--text, #E5E7EB)", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function HeroStat({
  label, value, delta, color,
}: { label: string; value: string; delta: string; color: string }) {
  return (
    <div
      style={{
        padding: 16, borderRadius: 12,
        background: "var(--surface-2)", border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: 10, color: "var(--muted)", fontWeight: 700,
          letterSpacing: 0.8, textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em",
          color, marginTop: 4, lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{delta}</div>
    </div>
  );
}

function FinalSnapshot({ data }: { data: FuturesForecast }) {
  const last_infra = data.infrastructure_series[data.infrastructure_series.length - 1];
  const last_eco = data.eco_series[data.eco_series.length - 1];

  const radarData = [
    { metric: "Школы",       v: Math.min(last_infra.by_type.school?.coverage_percent ?? 0, 100) },
    { metric: "Детсады",     v: Math.min(last_infra.by_type.kindergarten?.coverage_percent ?? 0, 100) },
    { metric: "Поликлиники", v: Math.min(last_infra.by_type.clinic?.coverage_percent ?? 0, 100) },
    { metric: "Парки",       v: Math.min(last_infra.by_type.park?.coverage_percent ?? 0, 100) },
    { metric: "Транспорт",   v: Math.min(last_infra.by_type.bus_stop?.coverage_percent ?? 0, 100) },
    { metric: "Эко",         v: last_eco.eco_score },
  ];

  return (
    <div className="card">
      <div className="card-title">🎯 Снимок {data.final_year} года</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <Radar dataKey="v" stroke="#2DD4BF" fill="#2DD4BF" fillOpacity={0.35} />
            <Tooltip
              contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => `${v.toFixed(0)}%`}
            />
          </RadarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          {Object.entries(last_infra.by_type).map(([k, v]: any) => {
            const cov = v.coverage_percent;
            const color = cov >= 100 ? "#10B981" : cov >= 70 ? "#F59E0B" : "#EF4444";
            return (
              <div
                key={k}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)",
                  border: "1px solid var(--border)", fontSize: 12,
                }}
              >
                <span>{v.label}</span>
                <span style={{ fontWeight: 800, color }}>
                  {Math.round(v.coverage_percent)}%
                  {v.deficit > 0 && (
                    <span style={{ color: "var(--muted)", fontWeight: 500, marginLeft: 6 }}>
                      · −{Math.ceil(v.deficit)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// useMergedSeries — joins primary + baseline by `year`
// =====================================================================
function useMergedSeries<T extends { year: number }>(
  primary: T[],
  baselineSeries: T[] | undefined,
  ghostKey: string,
  pickGhostValue: (b: T) => number | null,
): (T & Record<string, unknown>)[] {
  return useMemo(() => {
    if (!baselineSeries || baselineSeries.length === 0) return primary;
    const byYear = new Map<number, T>();
    for (const p of baselineSeries) byYear.set(p.year, p);
    return primary.map((p) => {
      const b = byYear.get(p.year);
      const ghost = b ? pickGhostValue(b) : null;
      return { ...p, [ghostKey]: ghost ?? null } as T & Record<string, unknown>;
    });
  }, [primary, baselineSeries, ghostKey, pickGhostValue]);
}

const ghostBadge: React.CSSProperties = {
  marginLeft: 8,
  fontSize: 10,
  fontWeight: 600,
  color: "rgba(255,255,255,0.6)",
  border: "1px dashed rgba(255,255,255,0.3)",
  padding: "1px 6px",
  borderRadius: 4,
  letterSpacing: 0.4,
};

