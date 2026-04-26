import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { IconSparkles } from "../shell/Icons";
import { futuresSensitivity } from "../../services/api";
import type { FuturesScenarioInput, FuturesSensitivityResponse } from "../../types";

interface Props {
  scenario: FuturesScenarioInput;
}

type Metric = "score" | "aqi" | "infra";

const METRICS: { value: Metric; label: string }[] = [
  { value: "score", label: "Итог. оценка" },
  { value: "aqi",   label: "AQI (ниже = лучше)" },
  { value: "infra", label: "Инфра-оценка" },
];

export default function FuturesSensitivity({ scenario }: Props) {
  const [delta, setDelta] = useState(0.10);
  const [metric, setMetric] = useState<Metric>("score");
  const [data, setData] = useState<FuturesSensitivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await futuresSensitivity(scenario, delta));
    } catch (e: any) {
      setError(e?.message ?? "Не удалось посчитать чувствительность");
    } finally {
      setLoading(false);
    }
  };

  const chartData = data ? data.levers.map((l) => ({
    label: l.label,
    up: metric === "score" ? l.delta_up_score
      : metric === "aqi" ? -l.delta_up_aqi  // invert so positive = good for AQI
      : l.delta_up_infra,
    down: metric === "score" ? l.delta_down_score
      : metric === "aqi" ? -l.delta_down_aqi
      : l.delta_down_infra,
    magnitude: l.impact_magnitude,
    group: l.group,
  })) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div className="card-title">🔬 Sensitivity — какие рычаги сильнее всего двигают будущее</div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Мы меняем каждый параметр на <strong>±{(delta * 100).toFixed(0)}%</strong> от текущего и
          смотрим, насколько изменится итоговая метрика. Самый высокий столбец = самый мощный рычаг.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--muted)" }}>
            Шаг: <strong style={{ color: "var(--brand-1)" }}>{(delta * 100).toFixed(0)}%</strong>
            <input
              type="range"
              min={0.05}
              max={0.30}
              step={0.05}
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value))}
              style={{ marginLeft: 8, verticalAlign: "middle", width: 140 }}
            />
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {METRICS.map((m) => (
              <button
                key={m.value}
                className={`chip ${metric === m.value ? "active" : ""}`}
                onClick={() => setMetric(m.value)}
                style={{ fontSize: 11 }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            className="pill-btn primary"
            onClick={run}
            disabled={loading}
            style={{ marginLeft: "auto" }}
          >
            <IconSparkles size={14} />
            {loading ? "Считаем ~30 сек…" : "Запустить анализ"}
          </button>
        </div>

        {error && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 8 }}>{error}</div>}

        {data && (
          <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)" }}>
            База: оценка {data.base_score}/100 · AQI {data.base_aqi} · инфра {data.base_infra}/100
          </div>
        )}
      </div>

      {data && (
        <div className="card">
          <div className="card-title">📊 Рычаги (отсортированы по силе эффекта)</div>
          <ResponsiveContainer width="100%" height={Math.max(320, data.levers.length * 34)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 140 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                width={140}
              />
              <Tooltip
                contentStyle={{ background: "#18212F", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => v.toFixed(2)}
              />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.3)" />
              <Bar dataKey="up" name={`+${(delta * 100).toFixed(0)}%`} fill="#10B981">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.up >= 0 ? "#10B981" : "#EF4444"} />
                ))}
              </Bar>
              <Bar dataKey="down" name={`−${(delta * 100).toFixed(0)}%`} fill="#EF4444">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.down >= 0 ? "#10B981" : "#EF4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop: 16 }}>
            <div className="section-title">🥇 Топ-3 рычага</div>
            <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 12, lineHeight: 1.7 }}>
              {data.levers.slice(0, 3).map((l) => (
                <li key={l.key}>
                  <strong>{l.label}</strong> ({l.group}) — магнитуда {l.impact_magnitude.toFixed(2)}.
                  При +{data.delta_percent}% score {delta0(l.delta_up_score)} ·
                  при −{data.delta_percent}% score {delta0(l.delta_down_score)}.
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function delta0(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}
