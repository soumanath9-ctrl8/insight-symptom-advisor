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

export function topRisk(assessment: Assessment): { name: string; likelihood: number } {
  const ranked = [...assessment.conditions].sort((a, b) => b.likelihood - a.likelihood);
  const top = ranked[0];
  return {
    name: top?.name ?? "—",
    likelihood: Math.max(0, Math.min(100, Math.round(top?.likelihood ?? 0))),
  };
}
