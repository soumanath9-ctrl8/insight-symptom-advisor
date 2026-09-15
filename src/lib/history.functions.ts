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
 * SaveCheck no longer trusts this value as the
 * source of truth. New values are calculated
 * server-side inside this file.
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
     * Kept for backwards client compatibility.
     *
     * IMPORTANT:
     * New saves do NOT trust this value.
     *
     * The server calculates its own trend score below.
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
    (value, ctx) => {
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
   * Symptom Match Strength.
   */
  severity: number;

  /**
   * Health Condition Trend.
   *
   * null = legacy record with no saved trend.
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
  if (!Array.isArray(value)) {
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
  if (!Array.isArray(value)) {
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

/* -------------------------------------------------------------------------- */
/*                       Trend calculation — server only                     */
/* -------------------------------------------------------------------------- */

type TrendUrgency =
  | "self-care"
  | "see-a-doctor"
  | "urgent"
  | "emergency";

/**
 * Same Health Condition Trend formula used by the
 * assessment pipeline.
 *
 * IMPORTANT:
 *
 * severity here means patient-reported severity
 * only if available.
 *
 * The existing DB `severity` field is Symptom Match
 * Strength, so it MUST NOT be used as self-rated severity.
 *
 * Therefore new history saves intentionally use a
 * neutral severity baseline.
 */
function calculateServerHealthTrendScore(
  input: {
    urgency: TrendUrgency;

    redFlagCount: number;

    worsening: boolean;
  },
): number {
  /*
   * Neutral baseline because the history schema's
   * existing `severity` field is NOT patient severity.
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
      urgencyPenalty = 6;
      break;

    case "urgent":
      urgencyPenalty = 18;
      break;

    case "emergency":
      urgencyPenalty = 45;
      break;

    default:
      urgencyPenalty = 0;
  }

  const safeRedFlagCount =
    Math.max(
      0,
      Math.floor(
        Number.isFinite(
          input.redFlagCount,
        )
          ? input.redFlagCount
          : 0,
      ),
    );

  const redFlagPenalty =
    Math.min(
      30,
      safeRedFlagCount *
        10,
    );

  const worseningPenalty =
    input.worsening
      ? 8
      : 0;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        baseline -
          urgencyPenalty -
          redFlagPenalty -
          worseningPenalty,
      ),
    ),
  );
}

/**
 * Worsening is derived ONLY from patient-reported
 * symptom text and patient answers.
 *
 * Question text is deliberately ignored.
 */
const WORSENING_PATTERNS = [
  /\bworse\b|\bworsening\b|\bdeteriorat/i,

  /\bnot improving\b|\bno better\b|\bgetting bad\b|\bgetting worse\b/i,

  /খারাপ হচ্ছে|আরও খারাপ|উন্নতি হচ্ছে না|অবনতি হচ্ছে|অবস্থা খারাপ/,
];

function detectReportedWorsening(
  symptoms: string,
  answers: HistoryAnswer[],
): boolean {
  const text = [
    symptoms,

    ...answers.map(
      (item) =>
        item.answer,
    ),
  ].join("\n");

  return WORSENING_PATTERNS.some(
    (pattern) =>
      pattern.test(text),
  );
}

/**
 * Only deterministic-looking stored red flags are counted
 * for the server-side trend pipeline.
 *
 * We use the actual red_flags array plus the red_flag boolean.
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

function mapHistoryRow(
  row: any,
): HistoryCheck {
  const createdAt =
    row.created_at
      ? new Date(
          row.created_at,
        ).toISOString()
      : new Date().toISOString();

  return {
    id:
      row.id,

    createdAt,

    date:
      createdAt,

    symptoms:
      row.symptoms ?? "",

    duration:
      row.duration ?? "",

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
     * NEVER fallback to severity.
     *
     * Old records without a trend remain null.
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
      row.top_condition ??
      "",

    summary:
      row.summary ?? "",

    answers:
      normalizeAnswers(
        row.answers,
      ),

    redFlag:
      Boolean(
        row.red_flag,
      ),

    redFlags:
      normalizeStringArray(
        row.red_flags,
      ),

    categories:
      normalizeStringArray(
        row.categories,
      ),

    supportingFactors:
      normalizeStringArray(
        row.supporting_factors,
      ),

    uncertainty:
      row.uncertainty ?? "",

    nextStep:
      row.next_step ?? "",

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
      row.patient_id ?? null,
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

        await verifyOwnedPatient(
          supabase,
          user.id,
          data.patientId,
        );

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
          patientId =
            null;
        }

        const answers =
          (
            parsed.answers ??
            []
          )
            .slice(0, 6)
            .map(
              (item) => ({
                question:
                  item.question
                    .trim()
                    .slice(
                      0,
                      2000,
                    ),

                answer:
                  item.answer
                    .trim()
                    .slice(
                      0,
                      2000,
                    ),
              }),
            );

        const redFlags =
          normalizeStringArray(
            parsed.redFlags,
          );

        const redFlag =
          Boolean(
            parsed.redFlag,
          );

        /*
         * IMPORTANT STEP 2:
         *
         * Do NOT trust parsed.healthTrendScore.
         *
         * It may have been sent by the browser and therefore
         * cannot be treated as authoritative.
         *
         * The server independently derives the trend score
         * from saved triage fields + patient-reported answers.
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
           * Existing metric:
           * Symptom Match Strength.
           */
          severity:
            clampScore(
              parsed.severity,
            ),

          /**
           * SERVER-AUTHORITATIVE Health Condition Trend.
           *
           * Browser-supplied healthTrendScore is deliberately
           * ignored for new saves.
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

          subject_type:
            subjectType,

          patient_id:
            patientId,
        };

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

        if (
          !inserted?.id
        ) {
          throw new Error(
            "The symptom check was not saved because no database ID was returned.",
          );
        }

        /*
         * Return the actual inserted database ID and the
         * actual server-calculated trend value.
         */
        return {
          id:
            inserted.id,

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