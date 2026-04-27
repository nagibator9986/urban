import { useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { IconReset } from "../shell/Icons";
import { futuresCompare, futuresCompareMany, futuresPresetForecast } from "../../services/api";
import type {
  FuturesCompareManyResponse, FuturesCompareResponse,
  FuturesScenarioInput, FuturesScenarioSummary,
} from "../../types";
import { DEFAULT_SCENARIO, PRESETS, gradeColor, ruNum } from "./shared";

interface Props {
  baseScenario: FuturesScenarioInput;
}

const SLOT_COLORS = ["#22D3EE", "#2DD4BF", "#F59E0B", "#A855F7"] as const;
const SLOT_LABELS = ["A", "B", "C", "D"] as const;

export default function FuturesCompare({ baseScenario }: Props) {
  const [slotsCount, setSlotsCount] = useState<2 | 3 | 4>(2);
  const [scenarios, setScenarios] = useState<FuturesScenarioInput[]>([
    baseScenario,
    {
      ...DEFAULT_SCENARIO,
      name: "green_agenda",
      park_build_rate: 3.0,
      transport_build_rate: 2.0,
      auto_growth_rate: 0.015,
      gas_conversion_target: 0.80,
      brt_coverage_target: 0.75,
      green_growth_rate: 0.030,
    },
    { ...DEFAULT_SCENARIO, name: "smart_growth" },
    { ...DEFAULT_SCENARIO, name: "unplanned_growth" },
  ]);
  const [data2, setData2] = useState<FuturesCompareResponse | null>(null);
  const [dataN, setDataN] = useState<FuturesCompareManyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSlot = (i: number, s: FuturesScenarioInput) => {
    setScenarios((arr) => {
      const next = [...arr];
      next[i] = s;
      return next;
    });
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    setData2(null);
    setDataN(null);
    try {
      if (slotsCount === 2) {
        setData2(await futuresCompare(scenarios[0], scenarios[1]));
      } else {
        setDataN(await futuresCompareMany(
          scenarios.slice(0, slotsCount),
          SLOT_LABELS.slice(0, slotsCount).map((l) => l),
        ));
      }
    } catch (e: any) {
      setError(e?.message ?? "Не удалось посчитать сравнение");
    } finally {
      setLoading(false);
    }
  };

  const applyPresetToSlot = async (slotIdx: number, key: string) => {
    try {
      const r = await futuresPresetForecast(key);
      setSlot(slotIdx, {
        ...DEFAULT_SCENARIO,
        ...(r.scenario_params ?? {}),
        name: r.scenario_name,
      });
    } catch { /* interceptor handles */ }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>🔀 Сравнение сценариев</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                className={`pill-btn ${slotsCount === n ? "primary" : ""}`}
                style={{ fontSize: 11 }}
                onClick={() => setSlotsCount(n as 2 | 3 | 4)}
              >
                {n} сценариев
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, marginBottom: 12 }}>
          Прогоним выбранные сценарии и наложим траектории, чтобы увидеть где они расходятся.
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: slotsCount === 2 ? "1fr 1fr"
            : slotsCount === 3 ? "1fr 1fr 1fr"
            : "1fr 1fr 1fr 1fr",
          gap: 12,
        }}>
          {Array.from({ length: slotsCount }).map((_, i) => (
            <ScenarioSlot
              key={SLOT_LABELS[i]}
              label={`Сценарий ${SLOT_LABELS[i]}`}
              color={SLOT_COLORS[i]}
              scenario={scenarios[i]}
              onApplyPreset={(key) => applyPresetToSlot(i, key)}
              onUseCurrent={i === 0 ? () => setSlot(0, baseScenario) : undefined}
              showUseCurrent={i === 0}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button className="pill-btn primary" onClick={run} disabled={loading}>
            {loading
              ? `Считаем ${slotsCount} сценариев…`
              : `Сравнить ${slotsCount}`}
          </button>
          {error && <span style={{ color: "#EF4444", fontSize: 12 }}>{error}</span>}
        </div>
      </div>

      {slotsCount === 2 && data2 && <CompareResult data={data2} />}
      {slotsCount > 2 && dataN && (
        <CompareManyResult
          data={dataN}
          colors={SLOT_COLORS.slice(0, slotsCount).map((c) => c)}
        />
      )}
    </div>
  );
}

// =====================================================================
// Multi-scenario (3-4) result block
// =====================================================================
function CompareManyResult({
  data, colors,
}: {
  data: FuturesCompareManyResponse;
  colors: string[];
}) {
  const labels = data.labels;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary KPI grid: one column per scenario */}
      <div className="card">
        <div className="card-title">📊 Итоги сценариев</div>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${labels.length}, 1fr)`,
          gap: 10,
          marginTop: 10,
        }}>
          {data.summaries.map((s, i) => (
            <SummaryCard
              key={labels[i]}
              title={`${labels[i]} · ${s.scenario_name}`}
              color={colors[i]}
              s={s}
            />
          ))}
        </div>
      </div>

      <ChartCard
        title="Инфра-оценка по годам"
        data={data.by_year}
        series={labels.map((l, i) => ({
          key: `${l}_infra_score`, name: l, color: colors[i],
        }))}
      />

      <ChartCard
        title="AQI по годам"
        data={data.by_year}
        series={labels.map((l, i) => ({
          key: `${l}_aqi`, name: l, color: colors[i],
        }))}
      />

      <ChartCard
        title="Население по годам"
        height={260}
        data={data.by_year}
        series={labels.map((l, i) => ({
          key: `${l}_population`, name: l, color: colors[i],
        }))}
      />

      {/* Deltas vs base */}
      {Object.keys(data.deltas_vs_base).length > 0 && (
        <div className="card">
          <div className="card-title">Δ vs {labels[0]} (базовый)</div>
          <div className="table-scroll" style={{ marginTop: 8 }}>
          <table style={{ width: "100%", fontSize: 12, minWidth: 480 }}>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th style={{ textAlign: "left" }}>Сценарий</th>
                <th style={{ textAlign: "right" }}>Оценка</th>
                <th style={{ textAlign: "right" }}>Инфра</th>
                <th style={{ textAlign: "right" }}>AQI</th>
                <th style={{ textAlign: "right" }}>Эко</th>
                <th style={{ textAlign: "right" }}>Население</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.deltas_vs_base).map(([label, d]) => (
                <tr key={label} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 0", fontWeight: 700 }}>{label}</td>
                  <td style={{ textAlign: "right", color: d.score >= 0 ? "#10B981" : "#EF4444" }}>
                    {d.score >= 0 ? "+" : ""}{d.score}
                  </td>
                  <td style={{ textAlign: "right", color: d.infra >= 0 ? "#10B981" : "#EF4444" }}>
                    {d.infra >= 0 ? "+" : ""}{d.infra}
                  </td>
                  <td style={{ textAlign: "right", color: d.aqi <= 0 ? "#10B981" : "#EF4444" }}>
                    {d.aqi >= 0 ? "+" : ""}{d.aqi}
                  </td>
                  <td style={{ textAlign: "right", color: d.eco_score >= 0 ? "#10B981" : "#EF4444" }}>
                    {d.eco_score >= 0 ? "+" : ""}{d.eco_score}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {d.population >= 0 ? "+" : ""}{ruNum(d.population)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioSlot({
  label, color, scenario, onApplyPreset, onUseCurrent, showUseCurrent,
}: {
  label: string;
  color: string;
  scenario: FuturesScenarioInput;
  onApplyPreset: (key: string) => void;
  onUseCurrent?: () => void;
  showUseCurrent?: boolean;
}) {
  return (
    <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-2)", border: `2px solid ${color}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: 0.8, textTransform: "uppercase" }}>
          {label}
        </div>
        {showUseCurrent && (
          <button
            className="btn ghost sm"
            onClick={onUseCurrent}
            title="Подставить текущий сценарий"
            style={{ fontSize: 10, padding: "2px 8px" }}
          >
            <IconReset size={12} /> Текущий
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{scenario.name}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>
        горизонт {scenario.horizon_years} лет · школы ×{scenario.school_build_rate.toFixed(1)} ·
        BRT {(scenario.brt_coverage_target * 100).toFixed(0)}% ·
        газ {(scenario.gas_conversion_target * 100).toFixed(0)}%
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Применить пресет:</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`chip ${scenario.name === p.key ? "active" : ""}`}
            onClick={() => onApplyPreset(p.key)}
            style={{ fontSize: 10, padding: "4px 8px" }}
            title={p.desc}
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompareResult({ data }: { data: FuturesCompareResponse }) {
  const sign = (n: number) => (n >= 0 ? "+" : "");
  const colorFor = (val: number, inverted = false): string => {
    if (val === 0) return "var(--muted)";
    const good = inverted ? val < 0 : val > 0;
    return good ? "#10B981" : "#EF4444";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary grid */}
      <div className="card">
        <div className="card-title">📊 Итог: сценарий B vs A</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
            gap: 12,
            marginTop: 10,
          }}
        >
          <DeltaStat
            label="Итог. оценка"
            value={`${sign(data.deltas.score)}${data.deltas.score}`}
            color={colorFor(data.deltas.score)}
            hint={`A ${data.a_summary.overall_future_score} → B ${data.b_summary.overall_future_score}`}
          />
          <DeltaStat
            label="Инфра"
            value={`${sign(data.deltas.infra)}${data.deltas.infra}`}
            color={colorFor(data.deltas.infra)}
            hint={`A ${data.a_summary.final_infra_score} → B ${data.b_summary.final_infra_score}`}
          />
          <DeltaStat
            label="AQI"
            value={`${sign(data.deltas.aqi)}${data.deltas.aqi}`}
            color={colorFor(data.deltas.aqi, true)}
            hint={`A ${data.a_summary.final_aqi} → B ${data.b_summary.final_aqi}`}
          />
          <DeltaStat
            label="Эко-оценка"
            value={`${sign(data.deltas.eco_score)}${data.deltas.eco_score}`}
            color={colorFor(data.deltas.eco_score)}
            hint={`A ${data.a_summary.final_eco_score} → B ${data.b_summary.final_eco_score}`}
          />
          <DeltaStat
            label="Население"
            value={`${sign(data.deltas.population)}${ruNum(data.deltas.population)}`}
            color={colorFor(data.deltas.population)}
            hint={`A ${ruNum(data.a_summary.final_population)} → B ${ruNum(data.b_summary.final_population)}`}
          />
        </div>
      </div>

      <div className="charts-row">
        <ChartCard
          title="Инфра-оценка по годам"
          data={data.by_year}
          series={[
            { key: "a_infra_score", name: "A", color: "#22D3EE" },
            { key: "b_infra_score", name: "B", color: "#2DD4BF" },
          ]}
        />
        <ChartCard
          title="AQI по годам"
          data={data.by_year}
          series={[
            { key: "a_aqi", name: "A · AQI", color: "#F97316" },
            { key: "b_aqi", name: "B · AQI", color: "#EF4444" },
          ]}
        />
      </div>

      <ChartCard
        title="Население по годам"
        data={data.by_year}
        height={260}
        series={[
          { key: "a_population", name: "A", color: "#22D3EE" },
          { key: "b_population", name: "B", color: "#2DD4BF" },
        ]}
      />

      <div className="charts-row">
        <SummaryCard title="Сценарий A" color="#22D3EE" s={data.a_summary} />
        <SummaryCard title="Сценарий B" color="#2DD4BF" s={data.b_summary} />
      </div>
    </div>
  );
}

function ChartCard({
  title, data, series, height = 220,
}: {
  title: string;
  data: readonly unknown[];
  series: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data as object[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--muted)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
          <Tooltip
            contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number) => ruNum(v)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
                  stroke={s.color} strokeWidth={2.5} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryCard({ title, color, s }: { title: string; color: string; s: FuturesScenarioSummary }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="card-title">{title} · {s.scenario_name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, fontSize: 12 }}>
        <Row label="Население" value={ruNum(s.final_population)} />
        <Row
          label="Итог. оценка"
          value={`${s.overall_future_score}/100`}
          color={gradeColor(s.overall_grade)}
        />
        <Row label="Инфра" value={`${s.final_infra_score}/100`} />
        <Row label="AQI" value={String(s.final_aqi)} />
        <Row label="Эко-оценка" value={`${s.final_eco_score}/100`} />
        <Row label="Зелени м²/чел" value={String(s.final_green_m2)} />
        <Row label="BRT покрытие" value={`${s.final_brt_coverage}%`} />
        <Row label="Бизнесов" value={ruNum(s.final_businesses)} />
        <Row label="Крит. точек" value={String(s.critical_points_count)} />
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ fontWeight: 700, color: color ?? "inherit" }}>{value}</span>
    </div>
  );
}

function DeltaStat({
  label, value, color, hint,
}: { label: string; value: string; color: string; hint: string }) {
  return (
    <div
      style={{
        padding: 14, borderRadius: 10,
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
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{hint}</div>
    </div>
  );
}
