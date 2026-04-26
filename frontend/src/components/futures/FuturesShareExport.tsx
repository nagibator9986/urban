import { useEffect, useState } from "react";
import { IconDownload, IconReset } from "../shell/Icons";
import type { FuturesForecast, FuturesScenarioInput } from "../../types";
import {
  buildShareUrl, deleteSaved, loadSaved, saveScenario, type SavedScenario,
} from "./scenarioStorage";

interface Props {
  scenario: FuturesScenarioInput;
  forecast: FuturesForecast | null;
  onLoadSaved: (scenario: FuturesScenarioInput) => void;
}

export default function FuturesShareExport({ scenario, forecast, onLoadSaved }: Props) {
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [title, setTitle] = useState("");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  const shareUrl = buildShareUrl(scenario);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMsg("Ссылка скопирована");
    } catch {
      setCopyMsg("Не удалось скопировать. Выделите вручную.");
    }
    setTimeout(() => setCopyMsg(null), 2500);
  };

  const doSave = () => {
    const next = saveScenario(title || scenario.name || "Сценарий", scenario);
    setSaved(next);
    setTitle("");
  };

  const doDelete = (id: string) => {
    setSaved(deleteSaved(id));
  };

  const downloadJson = () => {
    if (!forecast) return;
    const blob = new Blob([JSON.stringify(forecast, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aqyl-futures-${forecast.scenario_name}-${forecast.final_year}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    if (!forecast) return;
    const header = [
      "year", "population", "dependency_ratio",
      "infra_score", "aqi", "eco_score",
      "green_m2_per_capita", "brt_coverage_percent",
      "estimated_businesses", "market_gap",
    ];
    const rows: string[] = [header.join(",")];
    for (let i = 0; i < forecast.population_series.length; i++) {
      const p = forecast.population_series[i];
      const inf = forecast.infrastructure_series[i];
      const e = forecast.eco_series[i];
      const b = forecast.business_series[i];
      rows.push([
        p.year, p.population, p.dependency_ratio,
        inf.infra_score, e.aqi, e.eco_score,
        e.green_m2_per_capita, e.brt_coverage_percent,
        b.estimated_businesses, b.market_gap,
      ].join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aqyl-futures-${forecast.scenario_name}-${forecast.final_year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Share URL */}
      <div className="card">
        <div className="card-title">🔗 Поделиться сценарием</div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Ссылка закодирует текущий набор параметров. Откроется в Конструкторе с тем же
          сценарием.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            readOnly
            value={shareUrl}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text, #E5E7EB)",
              fontSize: 11,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button className="pill-btn primary" onClick={copy}>Копировать</button>
        </div>
        {copyMsg && <div style={{ color: "#10B981", fontSize: 12, marginTop: 8 }}>{copyMsg}</div>}
      </div>

      {/* Export */}
      <div className="card">
        <div className="card-title">📤 Экспорт прогноза</div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Скачайте полный прогноз в удобном формате. JSON — для аналитики и API,
          CSV — для Excel.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="pill-btn" onClick={downloadJson} disabled={!forecast}>
            <IconDownload size={14} /> JSON
          </button>
          <button className="pill-btn" onClick={downloadCsv} disabled={!forecast}>
            <IconDownload size={14} /> CSV (временной ряд)
          </button>
        </div>
        {!forecast && (
          <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 8 }}>
            Сначала запустите прогноз во вкладке «Дашборд».
          </div>
        )}
      </div>

      {/* Saved */}
      <div className="card">
        <div className="card-title">💾 Мои сохранённые сценарии</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название (например: «мой оптимистичный»)"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text, #E5E7EB)",
              fontSize: 12,
            }}
          />
          <button className="pill-btn primary" onClick={doSave}>Сохранить текущий</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          Сохраняется в браузере (localStorage). Максимум 8 сценариев.
        </div>

        {saved.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>
            Пока ничего не сохранено.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
            {saved.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex", alignItems: "center",
                  gap: 10, padding: "10px 12px",
                  borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>
                    {new Date(s.saved_at).toLocaleString("ru-RU")} · горизонт {s.scenario.horizon_years} лет
                  </div>
                </div>
                <button
                  className="btn ghost sm"
                  onClick={() => onLoadSaved(s.scenario)}
                >
                  <IconReset size={12} /> Загрузить
                </button>
                <button
                  className="btn ghost sm"
                  onClick={() => doDelete(s.id)}
                  style={{ color: "#EF4444" }}
                  title="Удалить"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
