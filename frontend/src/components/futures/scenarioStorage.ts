import type { FuturesScenarioInput } from "../../types";
import { DEFAULT_SCENARIO } from "./shared";

const STORAGE_KEY = "aqyl.futures.saved";
const MAX_SAVED = 8;

export interface SavedScenario {
  id: string;
  title: string;
  scenario: FuturesScenarioInput;
  saved_at: string;
}

// ------------------------------------------------------------------
// URL: scenario <-> query string (compact)
// ------------------------------------------------------------------

export function scenarioToQuery(s: FuturesScenarioInput): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  return params.toString();
}

export function scenarioFromQuery(qs: string): FuturesScenarioInput | null {
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  if (!params.has("horizon_years")) return null;
  const out: Record<string, unknown> = { ...(DEFAULT_SCENARIO as unknown as Record<string, unknown>) };
  for (const [k, v] of params.entries()) {
    if (k === "name") {
      out[k] = v;
      continue;
    }
    const num = Number(v);
    if (Number.isFinite(num)) out[k] = num;
  }
  return out as unknown as FuturesScenarioInput;
}

export function buildShareUrl(scenario: FuturesScenarioInput): string {
  const qs = scenarioToQuery(scenario);
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?${qs}`;
}

// ------------------------------------------------------------------
// localStorage: saved scenarios
// ------------------------------------------------------------------

export function loadSaved(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

export function saveScenario(title: string, scenario: FuturesScenarioInput): SavedScenario[] {
  const entry: SavedScenario = {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim() || "Сценарий",
    scenario,
    saved_at: new Date().toISOString(),
  };
  const current = loadSaved();
  const next = [entry, ...current].slice(0, MAX_SAVED);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteSaved(id: string): SavedScenario[] {
  const next = loadSaved().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
