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
 * Symptom Match Strength
 *
 * 0–100 relative symptom-match score.
 * This is NOT diagnostic probability or clinical risk.
 */
const MatchStrengthSchema = z
  .number()
  .min(0)
  .max(100);

/**
 * Health Condition Trend
 *
 * 0–100 independent non-clinical trend indicator.
 *
 * Higher = better reported condition.
 * Lower = worse reported condition.
 *
 * null = legacy record with no trend value.
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

type HistoryAnswer = z.infer<
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
     * Existing database field.
     *
     * This is Symptom Match Strength.
     * It is NOT diagnostic probability.
     */
    severity: MatchStrengthSchema
      .optional()
      .default(0),

    /**
     * Independent Health Condition Trend.
     *
     * null is deliberately accepted for legacy/no-trend records.
     */
    healthTrendScore:
      HealthTrendScoreSchema,

    urgency: UrgencySchema
      .default("self-care"),

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

    /**
     * JSON-compatible vitals object.
     *
     * The checker currently sends a plain object.
     */
    vitals: z
      .record(
        z.string(),
        z.any(),
      )
      .optional()
      .nullable(),

    subjectType: SubjectTypeSchema
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
          code: z.ZodIssueCode.custom,
          path: ["patientId"],
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
          code: z.ZodIssueCode.custom,
          path: ["patientId"],
          message:
            "A patient ID is required for a patient check.",
        });
      }
    },
  );

const PatientIdSchema = z.object({
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
   *
   * 0–100.
   */
  severity: number;

  /**
   * Health Condition Trend.
   *
   * 0–100.
   *
   * null = legacy record without trend data.
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

  vitals: Json | null;

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
     * Existing metric remains completely
     * independent from Health Condition Trend.
     */
    severity:
      clampScore(
        row.severity,
      ),

    /**
     * IMPORTANT:
     *
     * Do not use severity as fallback.
     * Legacy records remain null.
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

/**
 * Server-side patient ownership verification.
 */
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
  }).handler(async () => {
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
  });

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

        /**
         * The validator has already executed,
         * but parse again so this function remains
         * safe if its implementation is called
         * through another generated client boundary.
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
           * Self records are ALWAYS detached
           * from patient_profiles.
           */
          patientId = null;
        }

        const answers =
          (parsed.answers ??
            [])
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
           * Independent Health Condition Trend.
           *
           * NULL remains NULL.
           */
          health_trend_score:
            parsed.healthTrendScore ===
              null ||
            parsed.healthTrendScore ===
              undefined
              ? null
              : clampScore(
                  parsed.healthTrendScore,
                ),

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
            Boolean(
              parsed.redFlag,
            ),

          red_flags:
            normalizeStringArray(
              parsed.redFlags,
            ),

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
            "id",
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

        /**
         * Only after the database confirms the insert
         * do we return success.
         */
        return {
          id:
            inserted.id,
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
          success: true,
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
  }).handler(async () => {
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
  });

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