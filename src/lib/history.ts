import type { Assessment, Urgency } from "./symptoms.functions";

export type HistoryEntry = {
  id: string;
  date: string;
  symptoms: string;
  severity: number;
  urgency: Urgency;
  topCondition: string;
  summary: string;
};

const LEGACY_HISTORY_KEY = "symptomscope-history";

/**
 * Compatibility helpers for browser tabs that still have the former checker
 * route cached. Current authenticated history uses history.functions.ts.
 */
export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const value = window.localStorage.getItem(LEGACY_HISTORY_KEY);
    return value ? (JSON.parse(value) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function addEntry(entry: HistoryEntry): HistoryEntry[] {
  const history = [entry, ...loadHistory()];
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(history));
  }
  return history;
}

export function removeEntry(id: string): HistoryEntry[] {
  const history = loadHistory().filter((entry) => entry.id !== id);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(history));
  }
  return history;
}

export function topRisk(assessment: Assessment): { name: string; likelihood: number } {
  const ranked = [...assessment.conditions].sort((a, b) => b.likelihood - a.likelihood);
  const top = ranked[0];
  return {
    name: top?.name ?? "—",
    likelihood: Math.max(0, Math.min(100, Math.round(top?.likelihood ?? 0))),
  };
}
