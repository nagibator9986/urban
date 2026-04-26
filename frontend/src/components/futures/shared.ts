import type { FuturesScenarioInput } from "../../types";

export const DEFAULT_SCENARIO: FuturesScenarioInput = {
  horizon_years: 10,
  name: "custom",
  birth_rate_multiplier: 1.0,
  migration_multiplier: 1.0,
  death_rate_multiplier: 1.0,
  school_build_rate: 1.0,
  kindergarten_build_rate: 1.0,
  clinic_build_rate: 1.0,
  pharmacy_build_rate: 1.0,
  park_build_rate: 1.0,
  transport_build_rate: 1.0,
  new_apartments_per_year: 25_000,
  auto_growth_rate: 0.04,
  gas_conversion_target: 0.40,
  brt_coverage_target: 0.50,
  green_growth_rate: 0.010,
  income_growth_per_year: 0.05,
};

export const PRESETS = [
  {
    key: "baseline", label: "Baseline", emoji: "📊", color: "#64748B",
    desc: "Текущая траектория — всё как сейчас",
  },
  {
    key: "unplanned_growth", label: "Неконтроль. рост", emoji: "🏗️", color: "#F59E0B",
    desc: "Быстрая стройка без инфраструктуры",
  },
  {
    key: "green_agenda", label: "Зелёная повестка", emoji: "🌳", color: "#10B981",
    desc: "Максимум эко-политики и BRT",
  },
  {
    key: "smart_growth", label: "Умный рост", emoji: "🎯", color: "#2DD4BF",
    desc: "Сбалансированный с инвестициями",
  },
  {
    key: "climate_catastrophe", label: "Климат-катастрофа", emoji: "🔥", color: "#EF4444",
    desc: "Ничего не делаем",
  },
];

export function gradeColor(g: string): string {
  return (
    { A: "#10B981", B: "#84CC16", C: "#EAB308", D: "#F97316", E: "#EF4444" } as Record<string, string>
  )[g] ?? "#64748B";
}

export function ruNum(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function pct(n: number, digits = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function aqiColor(aqi: number): string {
  if (aqi <= 50) return "#10B981";
  if (aqi <= 100) return "#FBBF24";
  if (aqi <= 150) return "#FB923C";
  if (aqi <= 200) return "#EF4444";
  return "#A855F7";
}
