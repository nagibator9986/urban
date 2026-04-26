// localStorage-based simulation history for PublicMode.

const KEY = "aqyl.public.sim-history";
const MAX = 5;

export interface SimEntry {
  id: string;
  saved_at: string;
  title: string;
  additions: Record<number, Record<string, number>>;
}

export function loadSimHistory(): SimEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveSimEntry(
  title: string,
  additions: Record<number, Record<string, number>>,
): SimEntry[] {
  const entry: SimEntry = {
    id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    saved_at: new Date().toISOString(),
    title: title.trim() || "Симуляция",
    additions,
  };
  const current = loadSimHistory();
  const next = [entry, ...current].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function deleteSimEntry(id: string): SimEntry[] {
  const next = loadSimHistory().filter((e) => e.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function totalAdds(additions: Record<number, Record<string, number>>): number {
  let total = 0;
  for (const m of Object.values(additions)) {
    for (const n of Object.values(m)) total += n;
  }
  return total;
}
