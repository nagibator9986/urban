import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import { getDistrictsGeoJSON } from "../../services/api";
import type {
  ChoroplethMetric, DistrictGeoJSON, DistrictGeoJSONFeature,
} from "../../types";

interface Props {
  metric?: ChoroplethMetric;
  simulatedScores?: Record<number, number>; // district_id → simulated overall_score (only applies if metric === "overall_score")
  onDistrictClick?: (districtId: number, name: string) => void;
}

// Spec for each metric: how to extract value, color it, format tooltip
interface MetricSpec {
  label: string;
  unit?: string;
  // Higher = better? (true) or lower = better (false; e.g., AQI, traffic)
  higherIsBetter: boolean;
  // Domain for color scale [low, high]
  domain: [number, number];
  format?: (v: number) => string;
}

const METRIC_SPECS: Record<ChoroplethMetric, MetricSpec> = {
  overall_score:    { label: "Общая оценка",    unit: "/100", higherIsBetter: true,  domain: [0, 100] },
  fifteen_min_score:{ label: "15-мин город",    unit: "/100", higherIsBetter: true,  domain: [0, 100] },
  eco_score:        { label: "Эко-оценка",      unit: "/100", higherIsBetter: true,  domain: [0, 100] },
  aqi:              { label: "AQI",             higherIsBetter: false, domain: [50, 250] },
  green_m2_per_capita: { label: "Зелень",       unit: "м²/чел", higherIsBetter: true, domain: [0, 16] },
  traffic_per_1000: { label: "Трафик",          unit: "/1000",  higherIsBetter: false, domain: [200, 600] },
  businesses_per_10k: { label: "Бизнесов",      unit: "/10К",   higherIsBetter: true,  domain: [50, 600] },
  population:       { label: "Население",       unit: "чел.",   higherIsBetter: true,  domain: [100_000, 450_000],
                      format: (v) => v.toLocaleString("ru-RU") },
};

// Five-color step scale (red → green for higherIsBetter; reversed otherwise)
function colorFor(value: number | null | undefined, spec: MetricSpec): string {
  if (value == null || !Number.isFinite(value)) return "#475569";
  const [lo, hi] = spec.domain;
  const t = Math.max(0, Math.min(1, (value - lo) / Math.max(0.0001, hi - lo)));
  // Higher = better → green. Otherwise reverse the t.
  const score = spec.higherIsBetter ? t : 1 - t;
  if (score >= 0.85) return "#10B981";
  if (score >= 0.65) return "#84CC16";
  if (score >= 0.45) return "#EAB308";
  if (score >= 0.25) return "#F97316";
  return "#EF4444";
}

function valueOf(
  f: DistrictGeoJSONFeature,
  metric: ChoroplethMetric,
  simulated?: Record<number, number>,
): number | null {
  if (metric === "overall_score") {
    return simulated?.[f.properties.district_id] ?? f.properties.overall_score;
  }
  const v = (f.properties as Record<string, unknown>)[metric];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export default function DistrictChoroplethLayer({
  metric = "overall_score", simulatedScores, onDistrictClick,
}: Props) {
  const [data, setData] = useState<DistrictGeoJSON | null>(null);

  useEffect(() => {
    let alive = true;
    getDistrictsGeoJSON()
      .then((d) => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data) return null;

  const spec = METRIC_SPECS[metric];
  const simKey = JSON.stringify(simulatedScores ?? {}) + ":" + metric;

  return (
    <GeoJSON
      key={simKey}
      data={data as any}
      style={(feature: any) => {
        const f = feature as DistrictGeoJSONFeature;
        const v = valueOf(f, metric, simulatedScores);
        const color = colorFor(v, spec);
        return {
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.22,
        };
      }}
      onEachFeature={(feature, layer) => {
        const f = feature as DistrictGeoJSONFeature;
        const id = f.properties.district_id;
        layer.on({
          click: () => onDistrictClick?.(id, f.properties.name_ru),
        });
        const value = valueOf(f, metric, simulatedScores);
        const fmt = spec.format ?? ((v: number) => `${v}${spec.unit ?? ""}`);
        const valStr = value != null ? fmt(value) : "—";

        // For overall_score, also show delta if simulated
        let deltaHtml = "";
        if (metric === "overall_score" && simulatedScores?.[id] != null) {
          const delta = simulatedScores[id] - f.properties.overall_score;
          if (Math.abs(delta) > 0.1) {
            const c = delta > 0 ? "#10B981" : "#EF4444";
            deltaHtml = ` <span style="color:${c}">(${delta > 0 ? '+' : ''}${delta.toFixed(1)})</span>`;
          }
        }

        layer.bindTooltip(
          `<b>${f.properties.name_ru}</b><br/>
          ${spec.label}: <b>${valStr}</b>${deltaHtml}<br/>
          Население: ${f.properties.population.toLocaleString("ru-RU")}`,
          { sticky: true },
        );
      }}
    />
  );
}

export const CHOROPLETH_METRICS: { key: ChoroplethMetric; label: string; emoji: string }[] = [
  { key: "overall_score",     label: "Оценка",       emoji: "🏆" },
  { key: "fifteen_min_score", label: "15-мин",        emoji: "🚶" },
  { key: "eco_score",         label: "Эко",           emoji: "🌿" },
  { key: "aqi",               label: "AQI",          emoji: "🌬" },
  { key: "green_m2_per_capita", label: "Зелень",     emoji: "🌳" },
  { key: "traffic_per_1000",  label: "Трафик",        emoji: "🚗" },
  { key: "businesses_per_10k", label: "Бизнес",       emoji: "💼" },
  { key: "population",        label: "Население",     emoji: "👥" },
];
