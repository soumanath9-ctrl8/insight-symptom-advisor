import type {
  Assessment,
  Urgency,
} from "@/lib/symptoms.functions";

/* -------------------------------------------------------------------------- */
/*                              Subject Types                                 */
/* -------------------------------------------------------------------------- */

export type HistorySubjectType =
  | "self"
  | "patient";

/* -------------------------------------------------------------------------- */
/*                              History Entry                                 */
/* -------------------------------------------------------------------------- */

/**
 * A saved symptom-check history entry.
 *
 * IMPORTANT:
 * `severity` is kept as the existing database/application field name
 * for compatibility, but its value represents the 0–100 symptom-match
 * strength saved for that assessment.
 *
 * It is NOT:
 * - a medical severity score
 * - a diagnosis probability
 * - a clinically validated risk percentage
 */
export type HistoryEntry = {
  id: string;

  date: string;

  symptoms: string;

  /**
   * Existing DB field name.
   *
   * Application meaning:
   * 0–100 symptom-match strength.
   */
  severity: number;

  urgency: Urgency;

  topCondition: string;

  summary: string;

  /**
   * Determines whether this entry belongs to:
   * - the logged-in user
   * - a separately stored patient
   */
  subjectType: HistorySubjectType;

  /**
   * Only populated for patient history.
   *
   * Self history must always have this as null/undefined.
   */
  patientId?: string | null;
};

/* -------------------------------------------------------------------------- */
/*                              Top Condition                                 */
/* -------------------------------------------------------------------------- */

/**
 * Returns the condition with the highest model-reported
 * symptom-match strength.
 *
 * The returned likelihood is normalized to 0–100.
 *
 * IMPORTANT:
 * This is a symptom-match strength, NOT a clinically validated
 * probability of having a disease.
 */
export function topRisk(
  assessment: Assessment,
): {
  likelihood: number;
  condition:
    | Assessment["conditions"][number]
    | null;
} {
  const condition =
    assessment.conditions.length > 0
      ? (
          [...assessment.conditions].sort(
            (a, b) =>
              b.likelihood - a.likelihood,
          )[0] ?? null
        )
      : null;

  const likelihood = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        condition?.likelihood ?? 0,
      ),
    ),
  );

  return {
    likelihood,
    condition,
  };
}

/* -------------------------------------------------------------------------- */
/*                         Match Strength Helpers                             */
/* -------------------------------------------------------------------------- */

/**
 * Normalize a stored history match-strength value.
 *
 * The database field is called `severity` for backward compatibility,
 * but the application treats it as a 0–100 symptom-match strength.
 */
export function historyMatchStrength(
  entry: HistoryEntry,
): number {
  const numeric = Number(entry.severity);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(numeric),
    ),
  );
}

/**
 * Human-readable match-strength label.
 *
 * These labels describe model symptom matching only.
 * They do NOT describe disease probability.
 */
export function historyLabel(
  entry: HistoryEntry,
): string {
  const strength =
    historyMatchStrength(entry);

  if (strength >= 75) {
    return "Strong match";
  }

  if (strength >= 50) {
    return "Moderate match";
  }

  if (strength >= 25) {
    return "Possible match";
  }

  return "Low match";
}