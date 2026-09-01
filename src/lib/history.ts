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

const KEY = "symptomscope.history.v1";

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: HistoryEntry[]) {
  window.localStorage.setItem(KEY, JSON.stringify(entries));
}

export function topRisk(assessment: Assessment): { name: string; likelihood: number } {
  const ranked = [...assessment.conditions].sort((a, b) => b.likelihood - a.likelihood);
  const top = ranked[0];
  return {
    name: top?.name ?? "—",
    likelihood: Math.max(0, Math.min(100, Math.round(top?.likelihood ?? 0))),
  };
}

export function addEntry(input: { symptoms: string; assessment: Assessment }): HistoryEntry[] {
  const top = topRisk(input.assessment);
  const entry: HistoryEntry = {
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    symptoms: input.symptoms,
    severity: top.likelihood,
    urgency: input.assessment.urgency,
    topCondition: top.name,
    summary: input.assessment.summary,
  };
  const next = [...loadHistory(), entry].sort((a, b) => a.date.localeCompare(b.date));
  save(next);
  return next;
}

export function removeEntry(id: string): HistoryEntry[] {
  const next = loadHistory().filter((e) => e.id !== id);
  save(next);
  return next;
}
