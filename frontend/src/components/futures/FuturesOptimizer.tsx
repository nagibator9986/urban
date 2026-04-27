import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { IconSparkles } from "../shell/Icons";
import { futuresOptimize } from "../../services/api";
import type {
  FuturesOptimizeGoal, FuturesOptimizeResponse, FuturesScenarioInput,
} from "../../types";
import { gradeColor, ruNum } from "./shared";

const DEFAULT_GOAL: FuturesOptimizeGoal = {
  target_score: 80,
  target_aqi: 100,
  target_infra: 90,
  target_eco: 70,
  weight_score: 0.5,
  weight_aqi: 0.2,
  weight_infra: 0.2,
  weight_eco: 0.1,
};

interface Props {
  scenario: FuturesScenarioInput;
  onApplyBest: (best: FuturesScenarioInput) => void;
}

export default function FuturesOptimizer({ scenario, onApplyBest }: Props) {
  const [goal, setGoal] = useState<FuturesOptimizeGoal>(DEFAULT_GOAL);
  const [iterations, setIterations] = useState(24);
  const [data, setData] = useState<FuturesOptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await futuresOptimize(scenario, goal, iterations));
    } catch (e: any) {
      setError(e?.message ?? "Не удалось запустить оптимизатор");
    } finally {
      setLoading(false);
    }
  };

  const upd = (k: keyof FuturesOptimizeGoal, v: number) => setGoal((g) => ({ ...g, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div className="card-title">🎯 AI-оптимизатор — найди параметры под цель</div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Задайте желаемые показатели и веса — алгоритм случайного поиска прогонит
          до <strong>{iterations}</strong> сценариев и выдаст лучший по fitness-функции.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <GoalSlider
            label="Цель: итог. оценка ≥"
            min={40} max={100} step={1}
            value={goal.target_score}
            onChange={(v) => upd("target_score", v)}
            format={(v) => `${v}/100`}
          />
          <GoalSlider
            label="Цель: AQI ≤"
            min={30} max={200} step={5}
            value={goal.target_aqi}
            onChange={(v) => upd("target_aqi", v)}
            format={(v) => String(v)}
          />
          <GoalSlider
            label="Цель: инфра ≥"
            min={50} max={100} step={1}
            value={goal.target_infra}
            onChange={(v) => upd("target_infra", v)}
            format={(v) => `${v}/100`}
          />
          <GoalSlider
            label="Цель: эко-оценка ≥"
            min={30} max={100} step={1}
            value={goal.target_eco}
            onChange={(v) => upd("target_eco", v)}
            format={(v) => `${v}/100`}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <GoalSlider
            label="Вес: оценка"
            min={0} max={1} step={0.05}
            value={goal.weight_score}
            onChange={(v) => upd("weight_score", v)}
            format={(v) => v.toFixed(2)}
          />
          <GoalSlider
            label="Вес: AQI"
            min={0} max={1} step={0.05}
            value={goal.weight_aqi}
            onChange={(v) => upd("weight_aqi", v)}
            format={(v) => v.toFixed(2)}
          />
          <GoalSlider
            label="Вес: инфра"
            min={0} max={1} step={0.05}
            value={goal.weight_infra}
            onChange={(v) => upd("weight_infra", v)}
            format={(v) => v.toFixed(2)}
          />
          <GoalSlider
            label="Вес: эко"
            min={0} max={1} step={0.05}
            value={goal.weight_eco}
            onChange={(v) => upd("weight_eco", v)}
            format={(v) => v.toFixed(2)}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, color: "var(--muted)" }}>
            Итераций: <strong style={{ color: "var(--brand-1)" }}>{iterations}</strong>
            <input
              type="range"
              min={8}
              max={60}
              step={4}
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              style={{ marginLeft: 8, verticalAlign: "middle", maxWidth: 140, width: "100%" }}
            />
          </label>
          <button
            className="pill-btn primary"
            onClick={run}
            disabled={loading}
            style={{ marginLeft: "auto" }}
          >
            <IconSparkles size={14} />
            {loading ? `AI ищет… (${iterations}×~1 сек)` : "Найти лучший сценарий"}
          </button>
        </div>

        {error && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {data && (
        <>
          <div className="card" style={{ borderLeft: "4px solid #2DD4BF" }}>
            <div className="card-title">🏆 Лучший найденный сценарий</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
                gap: 12,
                marginTop: 10,
              }}
            >
              <StatBlock
                label="Fitness"
                value={(data.best_metrics.fitness * 100).toFixed(1)}
                unit="/100"
              />
              <StatBlock
                label="Итог. оценка"
                value={String(data.best_metrics.final_score)}
                unit={` (${data.best_forecast_summary.overall_grade})`}
                color={gradeColor(data.best_forecast_summary.overall_grade)}
              />
              <StatBlock
                label="AQI"
                value={String(data.best_metrics.final_aqi)}
              />
              <StatBlock
                label="Инфра"
                value={`${data.best_metrics.final_infra}`}
                unit="/100"
              />
              <StatBlock
                label="Эко"
                value={`${data.best_metrics.final_eco}`}
                unit="/100"
              />
              <StatBlock
                label="Население"
                value={ruNum(data.best_forecast_summary.final_population)}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="section-title">Найденные параметры</div>
              <ParamDiff base={scenario} best={data.best_scenario} />
              <button
                className="cta-gradient"
                onClick={() => onApplyBest(data.best_scenario)}
                style={{ marginTop: 12 }}
              >
                <IconSparkles size={14} /> Применить к конструктору
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">📈 Прогресс поиска</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="iter" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <Tooltip
                  contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                />
                <Line type="monotone" dataKey="fitness" stroke="#2DD4BF" dot={{ r: 2 }} name="fitness" />
                <Line
                  type="monotone" dataKey="final_score"
                  stroke="#F59E0B" dot={false} name="оценка"
                  yAxisId="0"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function GoalSlider({
  label, min, max, step, value, onChange, format,
}: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11, color: "var(--muted)", fontWeight: 700,
          letterSpacing: 0.6, textTransform: "uppercase",
        }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--brand-1)" }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function StatBlock({
  label, value, unit, color,
}: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{
        fontSize: 10, color: "var(--muted)", fontWeight: 700,
        letterSpacing: 0.6, textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color ?? "var(--text, #E5E7EB)", marginTop: 2 }}>
        {value}
        {unit && <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{unit}</span>}
      </div>
    </div>
  );
}

function ParamDiff({
  base, best,
}: { base: FuturesScenarioInput; best: FuturesScenarioInput }) {
  const rows: { key: string; baseV: number; bestV: number; label: string }[] = [];
  const skip = new Set(["name", "horizon_years"]);
  const baseAny = base as unknown as Record<string, unknown>;
  const bestAny = best as unknown as Record<string, unknown>;
  for (const key of Object.keys(best)) {
    if (skip.has(key)) continue;
    const baseV = Number(baseAny[key] ?? 0);
    const bestV = Number(bestAny[key] ?? 0);
    if (baseV !== bestV) {
      rows.push({ key, baseV, bestV, label: key });
    }
  }
  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--muted)" }}>Параметры совпадают с базовым сценарием.</div>;
  }
  return (
    <div className="table-scroll" style={{ marginTop: 8 }}>
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 320 }}>
      <thead>
        <tr style={{ color: "var(--muted)" }}>
          <th style={{ textAlign: "left", padding: "4px 0" }}>Параметр</th>
          <th style={{ textAlign: "right" }}>Было</th>
          <th style={{ textAlign: "right" }}>Стало</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "4px 0" }}>{r.label}</td>
            <td style={{ textAlign: "right", color: "var(--muted)" }}>{formatValue(r.baseV)}</td>
            <td style={{ textAlign: "right", fontWeight: 700, color: "var(--brand-1)" }}>{formatValue(r.bestV)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString("ru-RU");
  return v.toFixed(3);
}
