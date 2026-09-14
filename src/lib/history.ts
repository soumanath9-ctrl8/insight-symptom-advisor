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
 *
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

  /**
   * NEW:
   *
   * Independent 0–100 Health Condition Trend score.
   *
   * Higher = better reported health trend.
   * Lower = worse reported health trend.
   *
   * NULL/undefined means that the record is a legacy
   * record for which no Health Trend was calculated.
   *
   * IMPORTANT:
   *
   * This must NEVER fall back to `severity`.
   */
  healthTrendScore?: number | null;

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
 *
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
          [
            ...assessment.conditions,
          ].sort(
            (a, b) =>
              b.likelihood -
              a.likelihood,
          )[0] ?? null
        )
      : null;

  const likelihood =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          condition?.likelihood ??
            0,
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
 *
 * IMPORTANT:
 *
 * This helper is ONLY for Symptom Match Strength.
 * It must NOT be used for Health Condition Trend.
 */
export function historyMatchStrength(
  entry: HistoryEntry,
): number {
  const numeric =
    Number(entry.severity);

  if (
    !Number.isFinite(numeric)
  ) {
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

/* -------------------------------------------------------------------------- */
/*                    Health Condition Trend Helpers                         */
/* -------------------------------------------------------------------------- */

/**
 * Normalize the independently stored Health Condition Trend score.
 *
 * IMPORTANT:
 *
 * This score is completely separate from `severity`.
 *
 * Higher score = better reported health trend.
 * Lower score = worse reported health trend.
 *
 * A legacy record without a Health Trend remains `null`.
 *
 * We intentionally DO NOT do:
 *
 *   entry.healthTrendScore ?? entry.severity
 *
 * because `severity` is Symptom Match Strength and cannot
 * be interpreted as Health Condition Trend.
 */
export function historyHealthTrendScore(
  entry: HistoryEntry,
): number | null {
  const value =
    entry.healthTrendScore;

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numeric =
    Number(value);

  if (
    !Number.isFinite(numeric)
  ) {
    return null;
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
 * Returns true when a history entry contains a valid
 * Health Condition Trend score.
 *
 * This is useful for graph rendering.
 *
 * Legacy entries with NULL trend scores should be
 * excluded from the Health Condition Trend graph
 * rather than using their old Symptom Match Strength.
 */
export function hasHealthTrendScore(
  entry: HistoryEntry,
): boolean {
  return (
    historyHealthTrendScore(
      entry,
    ) !== null
  );
}

/**
 * Human-readable Health Condition Trend label.
 *
 * This describes a non-clinical reported trend indicator.
 *
 * It does NOT represent:
 * - diagnosis
 * - disease probability
 * - medical risk
 * - prognosis
 * - validated clinical status
 */
export function historyHealthTrendLabel(
  entry: HistoryEntry,
): string {
  const score =
    historyHealthTrendScore(
      entry,
    );

  if (score === null) {
    return "No trend data";
  }

  if (score >= 75) {
    return "Better reported condition";
  }

  if (score >= 50) {
    return "Stable reported condition";
  }

  if (score >= 25) {
    return "Worsening reported condition";
  }

  return "Significantly worse reported condition";
}