import type { Urgency } from "@/lib/symptoms.functions";

export type HealthTrendInput = {
  symptomSeverity?: number;
  urgency: Urgency;
  redFlagCount?: number;
  worsening?: boolean;
};

export type HealthTrendLabel =
  | "good"
  | "fair"
  | "concerning"
  | "poor"
  | "critical";

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Converts the user's reported symptom severity into a
 * non-clinical baseline trend score.
 *
 * 1 = very mild reported severity
 * 10 = very severe reported severity
 *
 * This is NOT a medical severity scale and is NOT a
 * clinically validated health score.
 */
function severityBaseline(severity?: number): number {
  if (
    typeof severity !== "number" ||
    !Number.isFinite(severity)
  ) {
    return 70;
  }

  const normalized = clamp(
    Math.round(severity),
    1,
    10,
  );

  /*
   * 1 -> 92
   * 2 -> 84
   * 3 -> 76
   * 4 -> 68
   * 5 -> 60
   * 6 -> 52
   * 7 -> 44
   * 8 -> 36
   * 9 -> 28
   * 10 -> 20
   */

  return clamp(100 - normalized * 8);
}

function urgencyPenalty(urgency: Urgency): number {
  switch (urgency) {
    case "self-care":
      return 0;

    case "see-a-doctor":
      return 8;

    case "urgent":
      return 20;

    case "emergency":
      return 45;

    default:
      return 0;
  }
}

function redFlagPenalty(count: number): number {
  if (!Number.isFinite(count)) {
    return 0;
  }

  const safeCount = Math.max(
    0,
    Math.floor(count),
  );

  return Math.min(
    30,
    safeCount * 10,
  );
}

function worseningPenalty(
  worsening: boolean,
): number {
  return worsening ? 8 : 0;
}

/**
 * Calculates a non-clinical trend indicator.
 *
 * Higher score = better reported condition trend.
 * Lower score = worse reported condition trend.
 *
 * This must never be presented as:
 * - disease probability
 * - diagnostic probability
 * - medical risk percentage
 * - clinically validated health score
 */
export function calculateHealthTrendScore(
  input: HealthTrendInput,
): number {
  const baseline = severityBaseline(
    input.symptomSeverity,
  );

  const score =
    baseline -
    urgencyPenalty(input.urgency) -
    redFlagPenalty(input.redFlagCount ?? 0) -
    worseningPenalty(Boolean(input.worsening));

  return clamp(
    Math.round(score),
  );
}

export function getHealthTrendLabel(
  score: number,
): HealthTrendLabel {
  const value = clamp(
    Math.round(score),
  );

  if (value >= 75) {
    return "good";
  }

  if (value >= 55) {
    return "fair";
  }

  if (value >= 35) {
    return "concerning";
  }

  if (value > 0) {
    return "poor";
  }

  return "critical";
}

export function getHealthTrendLabelText(
  score: number,
): string {
  switch (getHealthTrendLabel(score)) {
    case "good":
      return "Better reported condition";

    case "fair":
      return "Fair reported condition";

    case "concerning":
      return "Concerning reported trend";

    case "poor":
      return "Poor reported trend";

    case "critical":
      return "Critical reported trend";

    default:
      return "Reported health trend";
  }
}