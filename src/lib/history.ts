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
 * `severity` is retained as the existing database/application
 * field name for backward compatibility.
 *
 * In the current application its value means:
 *
 *   0–100 Symptom Match Strength
 *
 * It is NOT:
 * - medical severity
 * - disease probability
 * - diagnosis probability
 * - medical risk
 * - AI-assessed risk
 */
export type HistoryEntry = {
  id: string;

  date: string;

  symptoms: string;

  /**
   * Existing database field name retained for compatibility.
   *
   * Application meaning:
   * 0–100 Symptom Match Strength.
   */
  severity: number;

  /**
   * Independent 0–100 Health Condition Trend score.
   *
   * Higher = better reported health trend.
   * Lower = worse reported health trend.
   *
   * Legacy records may have null/undefined here.
   *
   * IMPORTANT:
   *
   * A missing Health Condition Trend score must remain missing.
   * It must NEVER fall back to `severity`.
   */
  healthTrendScore?: number | null;

  urgency: Urgency;

  topCondition: string;

  summary: string;

  /**
   * Determines whether this entry belongs to:
   * - the logged-in user (`self`)
   * - a separately stored patient (`patient`)
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
/*                         Match Strength / Top Condition                     */
/* -------------------------------------------------------------------------- */

/**
 * Returns the condition with the highest model-reported
 * Symptom Match Strength.
 *
 * IMPORTANT:
 *
 * The returned value is 0–100 Symptom Match Strength.
 *
 * It is NOT:
 * - a diagnosis
 * - disease probability
 * - medical risk
 * - prognosis
 *
 * The function name `topRisk` is retained for backward
 * compatibility with existing imports in the checker.
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
 * Normalize a stored Symptom Match Strength value.
 *
 * The database field is called `severity` for backward compatibility,
 * but the application treats it as a 0–100 Symptom Match Strength.
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
 * Human-readable Symptom Match Strength label.
 *
 * These labels describe model symptom matching only.
 * They do NOT describe disease probability or medical risk.
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
 * A legacy record without a Health Condition Trend remains null.
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
 * Legacy entries with NULL trend scores must be excluded
 * from the Health Condition Trend graph.
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