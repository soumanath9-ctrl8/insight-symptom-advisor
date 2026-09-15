import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/auth.server";
import type { Json } from "@/integrations/supabase/types";

/* -------------------------------------------------------------------------- */
/*                                  Schemas                                   */
/* -------------------------------------------------------------------------- */

const SubjectTypeSchema = z.enum([
  "self",
  "patient",
]);

const UrgencySchema = z.enum([
  "self-care",
  "see-a-doctor",
  "urgent",
  "emergency",
]);

/**
 * Existing metric:
 *
 * 0-100 Symptom Match Strength.
 *
 * IMPORTANT:
 * This is NOT diagnostic probability.
 */
const MatchStrengthSchema = z
  .number()
  .min(0)
  .max(100);

/**
 * Health Condition Trend.
 *
 * Legacy records may contain NULL.
 *
 * IMPORTANT:
 * This field is accepted only for backwards compatibility.
 * The server NEVER trusts the browser-supplied value when
 * creating a new history record.
 */
const HealthTrendScoreSchema = z
  .number()
  .min(0)
  .max(100)
  .nullable()
  .optional();

const AnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

type HistoryAnswer =
  z.infer<
    typeof AnswerSchema
  >;

/* -------------------------------------------------------------------------- */
/*                             Save Check Schema                              */
/* -------------------------------------------------------------------------- */

const SaveCheckSchema = z
  .object({
    symptoms: z
      .string()
      .min(1)
      .max(2000),

    duration: z
      .string()
      .max(100)
      .optional()
      .default(""),

    /**
     * Existing DB metric.
     *
     * Symptom Match Strength.
     */
    severity:
      MatchStrengthSchema
        .optional()
        .default(0),

    /**
     * Kept only for backwards client compatibility.
     *
     * IMPORTANT:
     * This value is intentionally ignored by saveCheck().
     * New Health Condition Trend values are calculated
     * server-side.
     */
    healthTrendScore:
      HealthTrendScoreSchema,

    urgency:
      UrgencySchema
        .default(
          "self-care",
        ),

    topCondition: z
      .string()
      .max(300)
      .optional()
      .default(""),

    summary: z
      .string()
      .max(4000)
      .optional()
      .default(""),

    answers: z
      .array(AnswerSchema)
      .max(6)
      .optional()
      .default([]),

    redFlag: z
      .boolean()
      .optional()
      .default(false),

    redFlags: z
      .array(z.string())
      .max(30)
      .optional()
      .default([]),

    categories: z
      .array(z.string())
      .max(30)
      .optional()
      .default([]),

    supportingFactors: z
      .array(z.string())
      .max(30)
      .optional()
      .default([]),

    uncertainty: z
      .string()
      .max(4000)
      .optional()
      .default(""),

    nextStep: z
      .string()
      .max(4000)
      .optional()
      .default(""),

    vitals: z
      .record(
        z.string(),
        z.any(),
      )
      .optional()
      .nullable(),

    subjectType:
      SubjectTypeSchema
        .optional()
        .default("self"),

    patientId: z
      .string()
      .uuid()
      .optional()
      .nullable(),
  })
  .superRefine(
    (
      value,
      ctx,
    ) => {
      /**
       * Self history MUST NEVER contain a patient ID.
       */
      if (
        value.subjectType ===
          "self" &&
        value.patientId !==
          null &&
        value.patientId !==
          undefined
      ) {
        ctx.addIssue({
          code:
            z.ZodIssueCode.custom,

          path: [
            "patientId",
          ],

          message:
            "Self checks cannot contain a patient ID.",
        });
      }

      /**
       * Patient history MUST contain a patient ID.
       */
      if (
        value.subjectType ===
          "patient" &&
        !value.patientId
      ) {
        ctx.addIssue({
          code:
            z.ZodIssueCode.custom,

          path: [
            "patientId",
          ],

          message:
            "A patient ID is required for a patient check.",
        });
      }
    },
  );

const PatientIdSchema =
  z.object({
    patientId:
      z.string().uuid(),
  });

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type HistorySubjectType =
  | "self"
  | "patient";

export type Urgency =
  | "self-care"
  | "see-a-doctor"
  | "urgent"
  | "emergency";

export type HistoryCheck = {
  id: string;

  createdAt: string;

  date: string;

  symptoms: string;

  duration?: string;

  /**
   * Existing 0-100 metric.
   *
   * Symptom Match Strength.
   */
  severity: number;

  /**
   * Independent 0-100 Health Condition Trend.
   *
   * null means the database record is legacy data
   * where no trend score was stored.
   */
  healthTrendScore:
    | number
    | null;

  urgency: Urgency;

  topCondition: string;

  summary: string;

  answers: HistoryAnswer[];

  redFlag: boolean;

  redFlags: string[];

  categories: string[];

  supportingFactors: string[];

  uncertainty: string;

  nextStep: string;

  vitals:
    | Json
    | null;

  subjectType:
    HistorySubjectType;

  patientId:
    string | null;
};

type SupabaseClient =
  Awaited<
    ReturnType<
      typeof requireSupabaseAuth
    >
  >["supabase"];

/* -------------------------------------------------------------------------- */
/*                              Helper Functions                              */
/* -------------------------------------------------------------------------- */

function clampScore(
  value: unknown,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(
      numeric,
    )
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

function normalizeUrgency(
  value: unknown,
): Urgency {
  switch (value) {
    case "emergency":
      return "emergency";

    case "urgent":
      return "urgent";

    case "see-a-doctor":
      return "see-a-doctor";

    case "self-care":
      return "self-care";

    default:
      return "self-care";
  }
}

function normalizeAnswers(
  value: unknown,
): HistoryAnswer[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is {
        question: string;
        answer: string;
      } =>
        Boolean(
          item &&
            typeof item ===
              "object" &&
            typeof item.question ===
              "string" &&
            typeof item.answer ===
              "string",
        ),
    )
    .slice(0, 6)
    .map(
      (item) => ({
        question:
          item.question,

        answer:
          item.answer,
      }),
    );
}

function normalizeStringArray(
  value: unknown,
  max = 30,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is string =>
        typeof item ===
        "string",
    )
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean)
    .slice(0, max);
}

function normalizeVitals(
  value: unknown,
): Json | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  try {
    const serialized =
      JSON.stringify(value);

    if (
      serialized ===
      undefined
    ) {
      return null;
    }

    return JSON.parse(
      serialized,
    ) as Json;
  } catch {
    return null;
  }
}

/**
 * Safely convert a database timestamp to ISO.
 *
 * If a malformed timestamp somehow reaches the mapper,
 * history loading should not crash.
 */
function safeIsoDate(
  value: unknown,
): string {
  if (
    typeof value !==
    "string" &&
    !(value instanceof Date)
  ) {
    return new Date().toISOString();
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

/* -------------------------------------------------------------------------- */
/*                       Health Condition Trend                               */
/* -------------------------------------------------------------------------- */

/**
 * Health Condition Trend is a NON-CLINICAL trend indicator.
 *
 * It is NOT:
 * - diagnosis
 * - disease probability
 * - medical severity score
 * - risk percentage
 *
 * It is intentionally based on:
 * - urgency
 * - stored red-flag findings
 * - patient-reported worsening
 *
 * The existing `severity` field is deliberately NOT used
 * because that field represents Symptom Match Strength.
 */

type TrendInput = {
  urgency: Urgency;

  redFlagCount: number;

  worsening: boolean;
};

/**
 * This baseline and penalty structure intentionally matches
 * the Health Condition Trend calculation used by the
 * symptom assessment pipeline.
 */
function calculateServerHealthTrendScore(
  input: TrendInput,
): number {
  /**
   * Neutral starting point.
   *
   * We do NOT use the existing `severity` field because
   * that field is Symptom Match Strength.
   */
  const baseline = 70;

  let urgencyPenalty = 0;

  switch (
    input.urgency
  ) {
    case "self-care":
      urgencyPenalty = 0;
      break;

    case "see-a-doctor":
      urgencyPenalty = 8;
      break;

    case "urgent":
      urgencyPenalty = 20;
      break;

    case "emergency":
      urgencyPenalty = 50;
      break;

    default:
      urgencyPenalty = 0;
  }

  const redFlagCount =
    Number.isFinite(
      input.redFlagCount,
    )
      ? Math.max(
          0,
          Math.floor(
            input.redFlagCount,
          ),
        )
      : 0;

  /**
   * Maximum red-flag penalty = 30.
   */
  const redFlagPenalty =
    Math.min(
      30,
      redFlagCount * 10,
    );

  /**
   * Worsening is a separate patient-reported signal.
   */
  const worseningPenalty =
    input.worsening
      ? 8
      : 0;

  const score =
    baseline -
    urgencyPenalty -
    redFlagPenalty -
    worseningPenalty;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        score,
      ),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/*                       Patient-reported worsening                           */
/* -------------------------------------------------------------------------- */

/**
 * Worsening detection is deliberately restricted to:
 *
 * 1. Initial patient-reported symptoms
 * 2. Patient answers
 *
 * Question text is NEVER included.
 *
 * The detection also avoids common explicit negations.
 */

const WORSENING_PATTERNS =
  [
    /\bgetting\s+worse\b/i,
    /\bgetting\s+bad\b/i,
    /\bworse\b/i,
    /\bworst\b/i,
    /\bworsening\b/i,
    /\bmore\s+severe\b/i,
    /\bincreasing\b/i,
    /\bincreased\b/i,
    /\bprogressively\b/i,
    /\bdeteriorat/i,
    /\bdeclining\b/i,
    /\bdecline\b/i,
    /\bnot\s+improving\b/i,
    /\bno\s+better\b/i,

    /খারাপ হচ্ছে/,
    /খারাপ হয়েছে/,
    /আরও খারাপ/,
    /বেশি খারাপ/,
    /ক্রমশ খারাপ/,
    /বাড়ছে/,
    /বেড়েছে/,
    /তীব্র হচ্ছে/,
    /তীব্র হয়েছে/,
    /অবনতি/,
    /উন্নতি হচ্ছে না/,
  ];

/**
 * Explicit negations that should suppress a nearby
 * worsening expression.
 */
const WORSENING_NEGATION_PATTERNS =
  [
    /\bnot\b/i,
    /\bno\b/i,
    /\bnever\b/i,
    /\bwithout\b/i,
    /\bdenies\b/i,
    /\bdenied\b/i,

    /নয়/,
    /নেই/,
    /না/,
    /হয়নি/,
    /হয় না/,
    /কমেছে/,
    /ভালো হয়েছে/,
    /উন্নতি হয়েছে/,
    /উন্নতি হচ্ছে/,
  ];

function hasLocalWorseningNegation(
  text: string,
  matchStart: number,
): boolean {
  /**
   * Only inspect a small local window immediately
   * before the matched worsening phrase.
   *
   * This prevents a negation in a completely unrelated
   * sentence from suppressing a genuine later worsening.
   */
  const windowStart =
    Math.max(
      0,
      matchStart - 80,
    );

  const before =
    text.slice(
      windowStart,
      matchStart,
    );

  return WORSENING_NEGATION_PATTERNS.some(
    (pattern) =>
      pattern.test(
        before,
      ),
  );
}

function containsReportedWorsening(
  text: string,
): boolean {
  if (!text.trim()) {
    return false;
  }

  for (
    const pattern of WORSENING_PATTERNS
  ) {
    /**
     * Reset lastIndex in case a regex becomes global
     * in a future edit.
     */
    pattern.lastIndex = 0;

    const match =
      pattern.exec(
        text,
      );

    if (!match) {
      continue;
    }

    const matchStart =
      match.index;

    if (
      !hasLocalWorseningNegation(
        text,
        matchStart,
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Derive worsening ONLY from patient-reported data.
 */
function detectReportedWorsening(
  symptoms: string,
  answers: HistoryAnswer[],
): boolean {
  const patientReportedText =
    [
      symptoms.trim(),

      ...answers
        .map(
          (
            item,
          ) =>
            item.answer.trim(),
        )
        .filter(Boolean),
    ]
      .filter(Boolean)
      .join("\n");

  return containsReportedWorsening(
    patientReportedText,
  );
}

/* -------------------------------------------------------------------------- */
/*                         Stored red-flag count                              */
/* -------------------------------------------------------------------------- */

/**
 * The history record stores both:
 *
 * - red_flag
 * - red_flags[]
 *
 * For trend calculation, the actual list is preferred.
 *
 * This keeps the stored trend calculation consistent even
 * if the boolean and array were supplied inconsistently.
 */
function countStoredRedFlags(
  redFlag: boolean,
  redFlags: string[],
): number {
  if (
    redFlags.length >
    0
  ) {
    return Math.max(
      redFlags.length,
      redFlag ? 1 : 0,
    );
  }

  return redFlag
    ? 1
    : 0;
}

/* -------------------------------------------------------------------------- */
/*                            History Row Mapper                              */
/* -------------------------------------------------------------------------- */

function mapHistoryRow(
  row: any,
): HistoryCheck {
  const createdAt =
    safeIsoDate(
      row.created_at,
    );

  const redFlags =
    normalizeStringArray(
      row.red_flags,
    );

  const redFlag =
    Boolean(
      row.red_flag,
    ) ||
    redFlags.length >
      0;

  return {
    id:
      row.id,

    createdAt,

    /**
     * History graph uses chronological createdAt.
     */
    date:
      createdAt,

    symptoms:
      typeof row.symptoms ===
      "string"
        ? row.symptoms
        : "",

    duration:
      typeof row.duration ===
      "string"
        ? row.duration
        : "",

    /**
     * Existing metric remains unchanged.
     *
     * This is Symptom Match Strength.
     */
    severity:
      clampScore(
        row.severity,
      ),

    /**
     * IMPORTANT:
     *
     * NEVER derive a missing historical trend
     * from severity or another field.
     *
     * Old records without health_trend_score remain null.
     */
    healthTrendScore:
      row.health_trend_score ===
        null ||
      row.health_trend_score ===
        undefined
        ? null
        : clampScore(
            row.health_trend_score,
          ),

    urgency:
      normalizeUrgency(
        row.urgency,
      ),

    topCondition:
      typeof row.top_condition ===
      "string"
        ? row.top_condition
        : "",

    summary:
      typeof row.summary ===
      "string"
        ? row.summary
        : "",

    answers:
      normalizeAnswers(
        row.answers,
      ),

    redFlag,

    redFlags,

    categories:
      normalizeStringArray(
        row.categories,
      ),

    supportingFactors:
      normalizeStringArray(
        row.supporting_factors,
      ),

    uncertainty:
      typeof row.uncertainty ===
      "string"
        ? row.uncertainty
        : "",

    nextStep:
      typeof row.next_step ===
      "string"
        ? row.next_step
        : "",

    vitals:
      normalizeVitals(
        row.vitals,
      ),

    subjectType:
      row.subject_type ===
      "patient"
        ? "patient"
        : "self",

    patientId:
      row.patient_id ??
      null,
  };
}

/* -------------------------------------------------------------------------- */
/*                    Server-side patient ownership                            */
/* -------------------------------------------------------------------------- */

async function verifyOwnedPatient(
  supabase: SupabaseClient,
  userId: string,
  patientId: string,
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "patient_profiles",
    )
    .select("id")
    .eq(
      "id",
      patientId,
    )
    .eq(
      "owner_user_id",
      userId,
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to verify patient ownership: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Patient not found or access denied.",
    );
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/*                              Self History                                  */
/* -------------------------------------------------------------------------- */

export const listChecks =
  createServerFn({
    method: "GET",
  }).handler(
    async () => {
      const {
        supabase,
        user,
      } =
        await requireSupabaseAuth();

      /**
       * STRICT SELF HISTORY FILTER:
       *
       * user_id = current authenticated user
       * subject_type = self
       * patient_id IS NULL
       *
       * Therefore patient history cannot enter this result.
       */
      const {
        data,
        error,
      } = await supabase
        .from(
          "symptom_checks",
        )
        .select("*")
        .eq(
          "user_id",
          user.id,
        )
        .eq(
          "subject_type",
          "self",
        )
        .is(
          "patient_id",
          null,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        );

      if (error) {
        throw new Error(
          `Unable to load self history: ${error.message}`,
        );
      }

      return (
        data ?? []
      ).map(
        mapHistoryRow,
      );
    },
  );

/* -------------------------------------------------------------------------- */
/*                             Patient History                                */
/* -------------------------------------------------------------------------- */

export const listPatientChecks =
  createServerFn({
    method: "GET",
  })
    .inputValidator(
      PatientIdSchema,
    )
    .handler(
      async ({
        data,
      }) => {
        const {
          supabase,
          user,
        } =
          await requireSupabaseAuth();

        /**
         * Verify that this patient belongs to
         * the authenticated user.
         */
        await verifyOwnedPatient(
          supabase,
          user.id,
          data.patientId,
        );

        /**
         * STRICT PATIENT HISTORY FILTER:
         *
         * user_id = current authenticated user
         * subject_type = patient
         * patient_id = requested patient
         *
         * Therefore:
         * - self history cannot enter
         * - another patient's history cannot enter
         */
        const {
          data: rows,
          error,
        } = await supabase
          .from(
            "symptom_checks",
          )
          .select("*")
          .eq(
            "user_id",
            user.id,
          )
          .eq(
            "subject_type",
            "patient",
          )
          .eq(
            "patient_id",
            data.patientId,
          )
          .order(
            "created_at",
            {
              ascending: true,
            },
          );

        if (error) {
          throw new Error(
            `Unable to load patient history: ${error.message}`,
          );
        }

        return (
          rows ?? []
        ).map(
          mapHistoryRow,
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                                Save Check                                  */
/* -------------------------------------------------------------------------- */

export const saveCheck =
  createServerFn({
    method: "POST",
  })
    .inputValidator(
      SaveCheckSchema,
    )
    .handler(
      async ({
        data,
      }) => {
        const {
          supabase,
          user,
        } =
          await requireSupabaseAuth();

        /**
         * Validate again on the server.
         */
        const parsed =
          SaveCheckSchema.parse(
            data,
          );

        const subjectType =
          parsed.subjectType;

        let patientId:
          | string
          | null = null;

        /* ------------------------------------------------------------------ */
        /* Patient check                                                       */
        /* ------------------------------------------------------------------ */

        if (
          subjectType ===
          "patient"
        ) {
          if (
            !parsed.patientId
          ) {
            throw new Error(
              "A patient ID is required for a patient check.",
            );
          }

          /**
           * Server-side ownership check.
           *
           * A browser cannot choose another user's patient.
           */
          await verifyOwnedPatient(
            supabase,
            user.id,
            parsed.patientId,
          );

          patientId =
            parsed.patientId;
        }

        /* ------------------------------------------------------------------ */
        /* Self check                                                          */
        /* ------------------------------------------------------------------ */

        if (
          subjectType ===
          "self"
        ) {
          /**
           * Explicitly force NULL.
           *
           * A malicious/stale patientId from the client
           * cannot be persisted on a self record.
           */
          patientId =
            null;
        }

        /* ------------------------------------------------------------------ */
        /* Normalize patient answers                                           */
        /* ------------------------------------------------------------------ */

        const answers =
          (
            parsed.answers ??
            []
          )
            .slice(0, 6)
            .map(
              (item) => ({
                /**
                 * The question is stored for history/report
                 * display only.
                 */
                question:
                  item.question
                    .trim()
                    .slice(
                      0,
                      2000,
                    ),

                /**
                 * Patient-reported answer.
                 */
                answer:
                  item.answer
                    .trim()
                    .slice(
                      0,
                      2000,
                    ),
              }),
            );

        /* ------------------------------------------------------------------ */
        /* Normalize red flags                                                 */
        /* ------------------------------------------------------------------ */

        const redFlags =
          normalizeStringArray(
            parsed.redFlags,
          );

        /**
         * Keep boolean and array consistent.
         *
         * If red_flags contains findings, red_flag must
         * also be true.
         */
        const redFlag =
          Boolean(
            parsed.redFlag,
          ) ||
          redFlags.length >
            0;

        /* ------------------------------------------------------------------ */
        /* Server-authoritative trend calculation                              */
        /* ------------------------------------------------------------------ */

        /**
         * IMPORTANT:
         *
         * parsed.healthTrendScore is deliberately NOT used.
         *
         * The browser may send any value it wants.
         *
         * The server calculates the value from the stored
         * assessment fields instead.
         */

        const worsening =
          detectReportedWorsening(
            parsed.symptoms,
            answers,
          );

        const redFlagCount =
          countStoredRedFlags(
            redFlag,
            redFlags,
          );

        const serverHealthTrendScore =
          calculateServerHealthTrendScore(
            {
              urgency:
                parsed.urgency,

              redFlagCount,

              worsening,
            },
          );

        /* ------------------------------------------------------------------ */
        /* Build database payload                                              */
        /* ------------------------------------------------------------------ */

        const insertPayload = {
          user_id:
            user.id,

          symptoms:
            parsed.symptoms
              .trim(),

          duration:
            parsed.duration
              ?.trim() ?? "",

          /**
           * Existing 0-100 metric.
           *
           * Symptom Match Strength.
           *
           * This remains untouched so existing history
           * graph data is preserved.
           */
          severity:
            clampScore(
              parsed.severity,
            ),

          /**
           * NEW:
           *
           * Server-calculated Health Condition Trend.
           *
           * Browser value is ignored.
           */
          health_trend_score:
            serverHealthTrendScore,

          urgency:
            parsed.urgency,

          top_condition:
            parsed.topCondition
              ?.trim() ?? "",

          summary:
            parsed.summary
              ?.trim() ?? "",

          answers,

          red_flag:
            redFlag,

          red_flags:
            redFlags,

          categories:
            normalizeStringArray(
              parsed.categories,
            ),

          supporting_factors:
            normalizeStringArray(
              parsed.supportingFactors,
            ),

          uncertainty:
            parsed.uncertainty
              ?.trim() ?? "",

          next_step:
            parsed.nextStep
              ?.trim() ?? "",

          vitals:
            normalizeVitals(
              parsed.vitals,
            ),

          /**
           * Explicit subject separation.
           */
          subject_type:
            subjectType,

          /**
           * Self => NULL
           * Patient => verified patient UUID
           */
          patient_id:
            patientId,
        };

        /* ------------------------------------------------------------------ */
        /* Insert                                                              */
        /* ------------------------------------------------------------------ */

        const {
          data: inserted,
          error,
        } = await supabase
          .from(
            "symptom_checks",
          )
          .insert(
            insertPayload,
          )
          .select(
            "id,health_trend_score",
          )
          .single();

        if (error) {
          throw new Error(
            `Unable to save symptom check: ${error.message}`,
          );
        }

        /**
         * Never mark a save as successful without
         * an actual database ID.
         */
        if (
          !inserted?.id
        ) {
          throw new Error(
            "The symptom check was not saved because no database ID was returned.",
          );
        }

        /* ------------------------------------------------------------------ */
        /* Return actual persisted values                                      */
        /* ------------------------------------------------------------------ */

        return {
          id:
            inserted.id,

          /**
           * Return the value actually persisted by
           * the database response.
           */
          healthTrendScore:
            inserted.health_trend_score ===
              null ||
            inserted.health_trend_score ===
              undefined
              ? null
              : clampScore(
                  inserted.health_trend_score,
                ),
        };
      },
    );

/* -------------------------------------------------------------------------- */
/*                              Delete Check                                  */
/* -------------------------------------------------------------------------- */

export const deleteCheck =
  createServerFn({
    method: "POST",
  })
    .inputValidator(
      z.object({
        id:
          z.string().uuid(),
      }),
    )
    .handler(
      async ({
        data,
      }) => {
        const {
          supabase,
          user,
        } =
          await requireSupabaseAuth();

        /**
         * First find the record under the current user.
         *
         * This prevents deleting another user's record.
         */
        const {
          data: existing,
          error:
            lookupError,
        } = await supabase
          .from(
            "symptom_checks",
          )
          .select(
            "id,user_id,subject_type,patient_id",
          )
          .eq(
            "id",
            data.id,
          )
          .eq(
            "user_id",
            user.id,
          )
          .maybeSingle();

        if (lookupError) {
          throw new Error(
            `Unable to find symptom check: ${lookupError.message}`,
          );
        }

        if (!existing) {
          throw new Error(
            "Symptom check not found or access denied.",
          );
        }

        /**
         * For patient records, verify patient ownership
         * again before deletion.
         */
        if (
          existing.subject_type ===
            "patient" &&
          existing.patient_id
        ) {
          await verifyOwnedPatient(
            supabase,
            user.id,
            existing.patient_id,
          );
        }

        /**
         * Owner-scoped delete.
         */
        const {
          error:
            deleteError,
        } = await supabase
          .from(
            "symptom_checks",
          )
          .delete()
          .eq(
            "id",
            data.id,
          )
          .eq(
            "user_id",
            user.id,
          );

        if (deleteError) {
          throw new Error(
            `Unable to delete symptom check: ${deleteError.message}`,
          );
        }

        return {
          success:
            true,

          id:
            data.id,
        };
      },
    );

/* -------------------------------------------------------------------------- */
/*                              User Profile                                  */
/* -------------------------------------------------------------------------- */

export const getProfile =
  createServerFn({
    method: "GET",
  }).handler(
    async () => {
      const {
        supabase,
        user,
      } =
        await requireSupabaseAuth();

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select(
          `
            id,
            name,
            age,
            sex
          `,
        )
        .eq(
          "id",
          user.id,
        )
        .maybeSingle();

      if (error) {
        throw new Error(
          `Unable to load profile: ${error.message}`,
        );
      }

      return (
        data ?? {
          id:
            user.id,

          name:
            "",

          age:
            null,

          sex:
            null,
        }
      );
    },
  );

/* -------------------------------------------------------------------------- */
/*                         Patient History Count                              */
/* -------------------------------------------------------------------------- */

export const getPatientHistoryCount =
  createServerFn({
    method: "GET",
  })
    .inputValidator(
      PatientIdSchema,
    )
    .handler(
      async ({
        data,
      }) => {
        const {
          supabase,
          user,
        } =
          await requireSupabaseAuth();

        /**
         * Verify ownership before returning
         * patient-specific history count.
         */
        await verifyOwnedPatient(
          supabase,
          user.id,
          data.patientId,
        );

        const {
          count,
          error,
        } = await supabase
          .from(
            "symptom_checks",
          )
          .select(
            "id",
            {
              count:
                "exact",

              head:
                true,
            },
          )
          .eq(
            "user_id",
            user.id,
          )
          .eq(
            "subject_type",
            "patient",
          )
          .eq(
            "patient_id",
            data.patientId,
          );

        if (error) {
          throw new Error(
            `Unable to count patient history: ${error.message}`,
          );
        }

        return {
          count:
            count ?? 0,
        };
      },
    );