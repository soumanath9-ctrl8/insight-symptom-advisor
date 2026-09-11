import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* -------------------------------------------------------------------------- */
/*                                    Schemas                                 */
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
 * Existing database column is named `severity`.
 *
 * In the current SymptomScope architecture this field stores
 * symptom-match strength from 0–100.
 *
 * It is intentionally NOT called probability because it is not
 * a clinically validated probability.
 */
const MatchStrengthSchema = z
  .number()
  .min(0)
  .max(100);

const SaveCheckSchema = z.object({
  symptoms: z
    .string()
    .min(1)
    .max(4000),

  /**
   * Existing DB field name.
   *
   * Application meaning:
   * 0–100 symptom-match strength.
   */
  severity: MatchStrengthSchema
    .optional()
    .default(0),

  urgency: UrgencySchema,

  topCondition: z
    .string()
    .max(500)
    .optional()
    .default(""),

  summary: z
    .string()
    .max(5000)
    .optional()
    .default(""),

  answers: z
    .array(
      z.object({
        question: z
          .string()
          .max(4000),

        answer: z
          .string()
          .max(4000),
      }),
    )
    .max(6)
    .optional()
    .default([]),

  redFlag: z
    .boolean()
    .optional()
    .default(false),

  redFlags: z
    .array(
      z.string().max(2000),
    )
    .max(20)
    .optional()
    .default([]),

  categories: z
    .array(
      z.string().max(500),
    )
    .max(20)
    .optional()
    .default([]),

  supportingFactors: z
    .array(
      z.object({
        factor: z
          .string()
          .max(1000),

        weight: z
          .number()
          .optional(),

        effect: z
          .string()
          .max(2000)
          .optional(),
      }),
    )
    .max(30)
    .optional()
    .default([]),

  vitals: z
    .record(
      z.string(),
      z.number(),
    )
    .optional()
    .nullable(),

  uncertainty: z
    .string()
    .max(5000)
    .optional()
    .default(""),

  nextStep: z
    .string()
    .max(5000)
    .optional()
    .default(""),

  subjectType: SubjectTypeSchema
    .optional()
    .default("self"),

  patientId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .default(null),
});

const DeleteCheckSchema =
  z.object({
    id: z.string().uuid(),
  });

const PatientIdSchema =
  z.object({
    patientId: z.string().uuid(),
  });

/* -------------------------------------------------------------------------- */
/*                              Returned Types                                */
/* -------------------------------------------------------------------------- */

export type HistoryCheck = {
  id: string;

  date: string;

  symptoms: string;

  /**
   * 0–100 symptom-match strength.
   */
  severity: number;

  urgency:
    | "self-care"
    | "see-a-doctor"
    | "urgent"
    | "emergency";

  topCondition: string;

  summary: string;

  subjectType:
    | "self"
    | "patient";

  patientId:
    | string
    | null;
};

export type SavedCheck = {
  id: string;
};

/* -------------------------------------------------------------------------- */
/*                         Internal Helper Functions                          */
/* -------------------------------------------------------------------------- */

/**
 * Verify that a patient belongs to the authenticated user.
 *
 * This check is deliberately performed server-side and must not trust
 * a patient ID supplied by the client by itself.
 */
async function verifyOwnedPatient(
  supabase: {
    from: (table: string) => any;
  },
  userId: string,
  patientId: string,
) {
  const {
    data,
    error,
  } = await supabase
    .from("patient_profiles")
    .select("id")
    .eq("id", patientId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to verify patient profile: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Patient profile was not found or you do not have access to it.",
    );
  }

  return true;
}

/**
 * Normalize database value into a safe 0–100 match strength.
 */
function normalizeMatchStrength(
  value: unknown,
): number {
  const numeric = Number(value);

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

/* -------------------------------------------------------------------------- */
/*                              List Self Checks                              */
/* -------------------------------------------------------------------------- */

export const listChecks =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(
      async ({ context }) => {
        const userId =
          context.userId;

        if (!userId) {
          throw new Error(
            "You must be signed in to view your history.",
          );
        }

        /*
         * SELF HISTORY ONLY
         *
         * This query intentionally requires:
         *
         * subject_type = self
         * patient_id IS NULL
         *
         * Therefore patient history cannot appear here.
         */
        const {
          data,
          error,
        } = await context.supabase
          .from("symptom_checks")
          .select(
            [
              "id",
              "symptoms",
              "severity",
              "urgency",
              "top_condition",
              "summary",
              "subject_type",
              "patient_id",
              "created_at",
            ].join(","),
          )
          .eq(
            "user_id",
            userId,
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
            `Unable to load symptom history: ${error.message}`,
          );
        }

        return (
          data ?? []
        ).map(
          (
            row,
          ): HistoryCheck => ({
            id: row.id,

            date:
              row.created_at,

            symptoms:
              row.symptoms,

            severity:
              normalizeMatchStrength(
                row.severity,
              ),

            urgency:
              UrgencySchema.parse(
                row.urgency,
              ),

            topCondition:
              row.top_condition ??
              "",

            summary:
              row.summary ??
              "",

            subjectType:
              "self",

            patientId:
              null,
          }),
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                         List Patient-Specific Checks                       */
/* -------------------------------------------------------------------------- */

export const listPatientChecks =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        PatientIdSchema.parse(
          input,
        ),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          context.userId;

        if (!userId) {
          throw new Error(
            "You must be signed in to view patient history.",
          );
        }

        /*
         * First verify ownership of the patient.
         */
        await verifyOwnedPatient(
          context.supabase,
          userId,
          data.patientId,
        );

        /*
         * PATIENT HISTORY ONLY
         *
         * This query can never return self history because:
         *
         * subject_type = patient
         * patient_id = selected patient
         */
        const {
          data: checks,
          error,
        } = await context.supabase
          .from("symptom_checks")
          .select(
            [
              "id",
              "symptoms",
              "severity",
              "urgency",
              "top_condition",
              "summary",
              "subject_type",
              "patient_id",
              "created_at",
            ].join(","),
          )
          .eq(
            "user_id",
            userId,
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
          checks ?? []
        ).map(
          (
            row,
          ): HistoryCheck => ({
            id: row.id,

            date:
              row.created_at,

            symptoms:
              row.symptoms,

            severity:
              normalizeMatchStrength(
                row.severity,
              ),

            urgency:
              UrgencySchema.parse(
                row.urgency,
              ),

            topCondition:
              row.top_condition ??
              "",

            summary:
              row.summary ??
              "",

            subjectType:
              "patient",

            patientId:
              data.patientId,
          }),
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                              Save Check                                    */
/* -------------------------------------------------------------------------- */

export const saveCheck =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        SaveCheckSchema.parse(
          input,
        ),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          context.userId;

        if (!userId) {
          throw new Error(
            "You must be signed in to save a symptom check.",
          );
        }

        /* ------------------------------------------------------------------ */
        /*                                SELF                                */
        /* ------------------------------------------------------------------ */

        if (
          data.subjectType ===
          "self"
        ) {
          /*
           * A self assessment can NEVER carry a patient ID.
           */
          const payload = {
            user_id:
              userId,

            symptoms:
              data.symptoms,

            /*
             * 0–100 symptom-match strength.
             */
            severity:
              normalizeMatchStrength(
                data.severity,
              ),

            urgency:
              data.urgency,

            top_condition:
              data.topCondition,

            summary:
              data.summary,

            answers:
              data.answers,

            red_flag:
              data.redFlag,

            red_flags:
              data.redFlags,

            categories:
              data.categories,

            supporting_factors:
              data.supportingFactors,

            vitals:
              data.vitals ??
              null,

            uncertainty:
              data.uncertainty,

            next_step:
              data.nextStep,

            subject_type:
              "self",

            patient_id:
              null,
          };

          const {
            data: inserted,
            error,
          } =
            await context.supabase
              .from(
                "symptom_checks",
              )
              .insert(
                payload,
              )
              .select("id")
              .single();

          if (error) {
            throw new Error(
              `Unable to save symptom check: ${error.message}`,
            );
          }

          return {
            id:
              inserted.id,
          } satisfies SavedCheck;
        }

        /* ------------------------------------------------------------------ */
        /*                              PATIENT                               */
        /* ------------------------------------------------------------------ */

        if (
          !data.patientId
        ) {
          throw new Error(
            "A patient ID is required when saving a patient assessment.",
          );
        }

        /*
         * Never trust the patient ID from the client.
         *
         * Verify that this patient belongs to the authenticated user.
         */
        await verifyOwnedPatient(
          context.supabase,
          userId,
          data.patientId,
        );

        const payload = {
          user_id:
            userId,

          symptoms:
            data.symptoms,

          /*
           * 0–100 symptom-match strength.
           */
          severity:
            normalizeMatchStrength(
              data.severity,
            ),

          urgency:
            data.urgency,

          top_condition:
            data.topCondition,

          summary:
            data.summary,

          answers:
            data.answers,

          red_flag:
            data.redFlag,

          red_flags:
            data.redFlags,

          categories:
            data.categories,

          supporting_factors:
            data.supportingFactors,

          vitals:
            data.vitals ??
            null,

          uncertainty:
            data.uncertainty,

          next_step:
            data.nextStep,

          subject_type:
            "patient",

          patient_id:
            data.patientId,
        };

        const {
          data: inserted,
          error,
        } =
          await context.supabase
            .from(
              "symptom_checks",
            )
            .insert(
              payload,
            )
            .select("id")
            .single();

        if (error) {
          throw new Error(
            `Unable to save patient symptom check: ${error.message}`,
          );
        }

        return {
          id:
            inserted.id,
        } satisfies SavedCheck;
      },
    );

/* -------------------------------------------------------------------------- */
/*                              Delete Check                                  */
/* -------------------------------------------------------------------------- */

export const deleteCheck =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        DeleteCheckSchema.parse(
          input,
        ),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          context.userId;

        if (!userId) {
          throw new Error(
            "You must be signed in to delete history.",
          );
        }

        /*
         * First locate the actual row owned by the current user.
         */
        const {
          data: existing,
          error: lookupError,
        } =
          await context.supabase
            .from(
              "symptom_checks",
            )
            .select(
              [
                "id",
                "user_id",
                "subject_type",
                "patient_id",
              ].join(","),
            )
            .eq(
              "id",
              data.id,
            )
            .eq(
              "user_id",
              userId,
            )
            .maybeSingle();

        if (lookupError) {
          throw new Error(
            `Unable to verify history entry: ${lookupError.message}`,
          );
        }

        if (!existing) {
          throw new Error(
            "History entry was not found or you do not have permission to delete it.",
          );
        }

        /*
         * Patient history must still point to a patient owned
         * by the authenticated user.
         */
        if (
          existing.subject_type ===
          "patient"
        ) {
          if (
            !existing.patient_id
          ) {
            throw new Error(
              "This patient history entry is invalid because it has no patient ID.",
            );
          }

          await verifyOwnedPatient(
            context.supabase,
            userId,
            existing.patient_id,
          );
        }

        /*
         * Owner-scoped DELETE.
         */
        const {
          error: deleteError,
        } =
          await context.supabase
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
              userId,
            );

        if (deleteError) {
          throw new Error(
            `Unable to delete history entry: ${deleteError.message}`,
          );
        }

        return {
          success: true,
          id: data.id,
        };
      },
    );

/* -------------------------------------------------------------------------- */
/*                              Self Profile                                  */
/* -------------------------------------------------------------------------- */

export const getProfile =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(
      async ({
        context,
      }) => {
        const userId =
          context.userId;

        if (!userId) {
          throw new Error(
            "You must be signed in to view your profile.",
          );
        }

        const {
          data,
          error,
        } =
          await context.supabase
            .from(
              "profiles",
            )
            .select(
              "id,name,age,sex",
            )
            .eq(
              "id",
              userId,
            )
            .maybeSingle();

        if (error) {
          throw new Error(
            `Unable to load profile: ${error.message}`,
          );
        }

        return {
          id:
            data?.id ??
            userId,

          name:
            data?.name ??
            "",

          age:
            data?.age !==
              null &&
            data?.age !==
              undefined
              ? String(
                  data.age,
                )
              : "",

          sex:
            data?.sex ??
            "",
        };
      },
    );

/* -------------------------------------------------------------------------- */
/*                       Patient History Count                                */
/* -------------------------------------------------------------------------- */

export const getPatientHistoryCount =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        PatientIdSchema.parse(
          input,
        ),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          context.userId;

        if (!userId) {
          throw new Error(
            "You must be signed in to view patient history.",
          );
        }

        /*
         * Verify patient ownership before exposing count.
         */
        await verifyOwnedPatient(
          context.supabase,
          userId,
          data.patientId,
        );

        const {
          count,
          error,
        } =
          await context.supabase
            .from(
              "symptom_checks",
            )
            .select(
              "id",
              {
                count:
                  "exact",
                head: true,
              },
            )
            .eq(
              "user_id",
              userId,
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