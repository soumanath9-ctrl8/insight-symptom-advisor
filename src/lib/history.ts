import type { Assessment, Urgency } from "@/lib/symptoms.functions";

export type HistorySubjectType = "self" | "patient";

export type HistoryEntry = {
  id: string;
  date: string;
  symptoms: string;
  severity: number;
  urgency: Urgency;
  topCondition: string;
  summary: string;

  subjectType: HistorySubjectType;

  /**
   * Only populated for patient history.
   */
  patientId?: string | null;
};

export function topRisk(
  assessment: Assessment,
): {
  likelihood: number;
  condition: Assessment["conditions"][number] | null;
} {
  const condition =
    assessment.conditions.length > 0
      ? [...assessment.conditions].sort(
          (a, b) => b.likelihood - a.likelihood,
        )[0]
      : null;

  const likelihood = Math.max(
    0,
    Math.min(100, Math.round(condition?.likelihood ?? 0)),
  );

  return {
    likelihood,
    condition,
  };
}

export function historyMatchStrength(entry: HistoryEntry): number {
  return Math.max(
    0,
    Math.min(100, Math.round(entry.severity)),
  );
}

export function historyLabel(entry: HistoryEntry): string {
  const strength = historyMatchStrength(entry);

  if (strength >= 75) return "Strong match";
  if (strength >= 50) return "Moderate match";
  if (strength >= 25) return "Possible match";

  return "Low match";
}