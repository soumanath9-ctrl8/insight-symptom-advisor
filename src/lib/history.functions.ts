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
 * Symptom Match Strength = 0–100
 *
 * This is NOT diagnostic probability or clinical risk.
 */
const MatchStrengthSchema = z
  .number()
  .min(0)
  .max(100);

/**
 * New independent metric:
 *
 * Health Condition Trend = 0–100
 *
 * Higher = better reported health trend.
 * Lower = worse reported health trend.
 *
 * NULL is allowed for legacy records that were created
 * before this metric existed.
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

/**
 * IMPORTANT:
 *
 * AnswerSchema is a Zod runtime schema.
 * HistoryCheck must use the inferred TypeScript type instead
 * of using AnswerSchema directly as a type.
 */
type HistoryAnswer =
  z.infer<typeof AnswerSchema>;

/* -------------------------------------------------------------------------- */
/*                             Save Check Schema                              */
/* -------------------------------------------------------------------------- */

const SaveCheckSchema = z.object({
  symptoms:
    z.string()
      .min(1)
      .max(2000),

  duration:
    z.string()
      .max(100)
      .optional()
      .default(""),

  /*
   * IMPORTANT:
   *
   * severity is retained for backwards compatibility
   * and represents Symptom Match Strength (0–100).
   *
   * It is NOT a diagnostic probability.
   */
  severity:
    MatchStrengthSchema
      .optional()
      .default(0),

  /*
   * NEW:
   *
   * Independent 0–100 non-clinical health trend score.
   *
   * Higher = better reported health trend.
   * Lower = worse reported health trend.
   *
   * It must NEVER be calculated from condition likelihood.
   */
  healthTrendScore:
    HealthTrendScoreSchema,

  urgency:
    UrgencySchema
      .default("self-care"),

  topCondition:
    z.string()
      .max(300)
      .optional()
      .default(""),

  summary:
    z.string()
      .max(4000)
      .optional()
      .default(""),

  answers:
    z.array(AnswerSchema)
      .max(6)
      .optional()
      .default([]),

  redFlag:
    z.boolean()
      .optional()
      .default(false),

  redFlags:
    z.array(z.string())
      .max(30)
      .optional()
      .default([]),

  categories:
    z.array(z.string())
      .max(30)
      .optional()
      .default([]),

  supportingFactors:
    z.array(z.string())
      .max(30)
      .optional()
      .default([]),

  uncertainty:
    z.string()
      .max(4000)
      .optional()
      .default(""),

  nextStep:
    z.string()
      .max(4000)
      .optional()
      .default(""),

  vitals:
    z.record(
      z.string(),
      z.any(),
    )
      .optional()
      .nullable(),

  subjectType:
    SubjectTypeSchema
      .optional()
      .default("self"),

  patientId:
    z.string()
      .uuid()
      .optional()
      .nullable(),
});

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

  /*
   * Existing metric:
   *
   * Symptom Match Strength.
   *
   * 0–100.
   */
  severity: number;

  /*
   * New metric:
   *
   * Health Condition Trend.
   *
   * 0–100.
   *
   * Higher = better reported health trend.
   * Lower = worse reported health trend.
   *
   * NULL = legacy record with no trend value.
   */
  healthTrendScore:
    number | null;

  urgency: Urgency;

  topCondition: string;

  summary: string;

  /*
   * IMPORTANT:
   *
   * Use the inferred TypeScript type,
   * not AnswerSchema directly.
   */
  answers: HistoryAnswer[];

  redFlag: boolean;

  redFlags: string[];

  categories: string[];

  supportingFactors: string[];

  uncertainty: string;

  nextStep: string;

  vitals:
    Json | null;

  subjectType:
    HistorySubjectType;

  patientId:
    string | null;
};

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireSupabaseAuth>
  >["supabase"];

type AuthUser =
  Awaited<
    ReturnType<typeof requireSupabaseAuth>
  >["user"];

/* -------------------------------------------------------------------------- */
/*                              Helper Functions                              */
/* -------------------------------------------------------------------------- */

/**
 * Clamp any numeric 0–100 score.
 *
 * This protects the application layer from malformed
 * or unexpected persisted values.
 */
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

/**
 * Convert database row into the application
 * HistoryCheck shape.
 *
 * IMPORTANT:
 *
 * severity and health_trend_score are deliberately
 * mapped independently.
 *
 * severity
 *   = Symptom Match Strength
 *
 * health_trend_score
 *   = Health Condition Trend
 */
function mapHistoryRow(
  row: any,
): HistoryCheck {
  return {
    id:
      row.id,

    createdAt:
      row.created_at,

    date:
      row.created_at,

    symptoms:
      row.symptoms ?? "",

    duration:
      row.duration ?? "",

    /*
     * Existing metric:
     *
     * Symptom Match Strength.
     */
    severity:
      clampScore(
        row.severity,
      ),

    /*
     * New independent metric:
     *
     * Health Condition Trend.
     *
     * NULL means this is a legacy record for which
     * no Health Trend was calculated.
     *
     * IMPORTANT:
     * We do NOT fall back to severity here.
     */
    healthTrendScore:
      row.health_trend_score === null ||
      row.health_trend_score === undefined
        ? null
        : clampScore(
            row.health_trend_score,
          ),

    urgency:
      normalizeUrgency(
        row.urgency,
      ),

    topCondition:
      row.top_condition ?? "",

    summary:
      row.summary ?? "",

    answers:
      Array.isArray(row.answers)
        ? row.answers
        : [],

    redFlag:
      Boolean(
        row.red_flag,
      ),

    redFlags:
      Array.isArray(
        row.red_flags,
      )
        ? row.red_flags
        : [],

    categories:
      Array.isArray(
        row.categories,
      )
        ? row.categories
        : [],

    supportingFactors:
      Array.isArray(
        row.supporting_factors,
      )
        ? row.supporting_factors
        : [],

    uncertainty:
      row.uncertainty ?? "",

    nextStep:
      row.next_step ?? "",

    vitals:
      row.vitals ?? null,

    subjectType:
      row.subject_type === "patient"
        ? "patient"
        : "self",

    patientId:
      row.patient_id ?? null,
  };
}

/**
 * Keep urgency values safe when reading
 * persisted database data.
 */
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

/**
 * Server-side patient ownership verification.
 *
 * A patient record must always belong to the
 * currently authenticated user.
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
    .from("patient_profiles")
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
      "Unable to verify patient ownership.",
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

/**
 * SELF HISTORY
 *
 * Returns ONLY records belonging to the
 * authenticated user's own self-check history.
 *
 * Patient records can NEVER appear here.
 *
 * Required separation:
 *
 * subject_type = "self"
 * patient_id   IS NULL
 */
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
      .from("symptom_checks")
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

/**
 * PATIENT HISTORY
 *
 * Returns ONLY records belonging to the
 * requested patient.
 *
 * Ownership is verified before querying history.
 *
 * Required separation:
 *
 * subject_type = "patient"
 * patient_id   = requested owned patient
 */
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

        const patientId =
          data.patientId;

        await verifyOwnedPatient(
          supabase,
          user.id,
          patientId,
        );

        const {
          data: rows,
          error,
        } = await supabase
          .from("symptom_checks")
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
            patientId,
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

/**
 * SAVE CHECK
 *
 * Self:
 *   subject_type = self
 *   patient_id   = null
 *
 * Patient:
 *   subject_type = patient
 *   patient_id   = verified owned patient
 *
 * The subject can never be switched by this function.
 */
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
          parsed.subjectType ??
          "self";

        let patientId:
          | string
          | null = null;

        /*
         * ------------------------------------------------------------------ *
         * Patient check
         * ------------------------------------------------------------------ *
         */
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

          /*
           * IMPORTANT:
           *
           * Never trust the patient ID merely because
           * it came from the client.
           *
           * Verify ownership on the server.
           */
          await verifyOwnedPatient(
            supabase,
            user.id,
            parsed.patientId,
          );

          patientId =
            parsed.patientId;
        }

        /*
         * ------------------------------------------------------------------ *
         * Self check
         * ------------------------------------------------------------------ *
         *
         * Self records are ALWAYS detached from
         * patient_profiles.
         */
        if (
          subjectType ===
          "self"
        ) {
          patientId = null;
        }

        const insertPayload = {
          user_id:
            user.id,

          symptoms:
            parsed.symptoms
              .trim(),

          duration:
            parsed.duration
              ?.trim() ?? "",

          /*
           * Existing metric:
           *
           * Symptom Match Strength.
           */
          severity:
            clampScore(
              parsed.severity,
            ),

          /*
           * NEW independent metric:
           *
           * Health Condition Trend.
           *
           * IMPORTANT:
           *
           * This value comes from the checker-side
           * health trend calculation.
           *
           * It is NOT derived from condition likelihood.
           *
           * NULL is preserved when no trend score was
           * calculated.
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

          answers:
            parsed.answers ?? [],

          red_flag:
            Boolean(
              parsed.redFlag,
            ),

          red_flags:
            parsed.redFlags ?? [],

          categories:
            parsed.categories ?? [],

          supporting_factors:
            parsed.supportingFactors ??
            [],

          uncertainty:
            parsed.uncertainty
              ?.trim() ?? "",

          next_step:
            parsed.nextStep
              ?.trim() ?? "",

          vitals:
            parsed.vitals ??
            null,

          subject_type:
            subjectType,

          patient_id:
            patientId,
        };

        const {
          data: inserted,
          error,
        } = await supabase
          .from("symptom_checks")
          .insert(
            insertPayload,
          )
          .select("id")
          .single();

        if (error) {
          throw new Error(
            `Unable to save symptom check: ${error.message}`,
          );
        }

        /*
         * IMPORTANT:
         *
         * Return the ACTUAL database ID.
         *
         * Client code must not assume that a check
         * was saved before this succeeds.
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

/**
 * DELETE SELF OR PATIENT CHECK
 *
 * The check must belong to the authenticated
 * user.
 *
 * Patient records additionally require ownership
 * of the referenced patient.
 */
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
          .from("symptom_checks")
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

        /*
         * Additional server-side patient ownership
         * verification.
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

        const {
          error:
            deleteError,
        } = await supabase
          .from("symptom_checks")
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

/**
 * Get the authenticated user's basic profile.
 *
 * This is intentionally separate from patient
 * profiles.
 */
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

/**
 * Count checks belonging to one patient.
 *
 * Ownership is verified first.
 *
 * Only patient records for the requested patient
 * are counted.
 */
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
          .from("symptom_checks")
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