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

const SaveCheckSchema = z.object({
  symptoms: z.string().min(1).max(4000),

  severity: z
    .number()
    .min(1)
    .max(10)
    .optional(),

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
        question: z.string().max(4000),
        answer: z.string().max(4000),
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
    .array(z.string().max(2000))
    .max(20)
    .optional()
    .default([]),

  categories: z
    .array(z.string().max(500))
    .max(20)
    .optional()
    .default([]),

  supportingFactors: z
    .array(
      z.object({
        factor: z.string().max(1000),
        weight: z.number().optional(),
        effect: z.string().max(2000).optional(),
      }),
    )
    .max(30)
    .optional()
    .default([]),

  vitals: z
    .record(z.string(), z.unknown())
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

const DeleteCheckSchema = z.object({
  id: z.string().uuid(),
});

const PatientIdSchema = z.object({
  patientId: z.string().uuid(),
});

/* -------------------------------------------------------------------------- */
/*                              Returned types                                */
/* -------------------------------------------------------------------------- */

export type HistoryCheck = {
  id: string;
  date: string;
  symptoms: string;
  severity: number;
  urgency:
    | "self-care"
    | "see-a-doctor"
    | "urgent"
    | "emergency";
  topCondition: string;
  summary: string;
  subjectType: "self" | "patient";
  patientId: string | null;
};

export type SavedCheck = {
  id: string;
};

/* -------------------------------------------------------------------------- */
/*                         Internal ownership helpers                          */
/* -------------------------------------------------------------------------- */

async function verifyOwnedPatient(
  supabase: {
    from: (table: string) => any;
  },
  userId: string,
  patientId: string,
) {
  const { data, error } = await supabase
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

/* -------------------------------------------------------------------------- */
/*                              List self checks                               */
/* -------------------------------------------------------------------------- */

export const listChecks = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    if (!userId) {
      throw new Error(
        "You must be signed in to view your history.",
      );
    }

    const { data, error } = await context.supabase
      .from("symptom_checks")
      .select("id,symptoms,severity,urgency,top_condition,summary,subject_type,patient_id,created_at")
      .eq("user_id", userId)
      .eq("subject_type", "self")
      .is("patient_id", null)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      throw new Error(
        `Unable to load symptom history: ${error.message}`,
      );
    }

    return (data ?? []).map(
      (row): HistoryCheck => ({
        id: row.id,

        date: row.created_at,

        symptoms: row.symptoms,

        severity:
          typeof row.severity === "number"
            ? row.severity
            : 0,

        urgency: UrgencySchema.parse(row.urgency),

        topCondition:
          row.top_condition ?? "",

        summary: row.summary ?? "",

        subjectType: "self",

        patientId: null,
      }),
    );
  });

/* -------------------------------------------------------------------------- */
/*                         List patient-specific checks                        */
/* -------------------------------------------------------------------------- */

export const listPatientChecks =
  createServerFn({
    method: "GET",
  })
    .middleware([requireSupabaseAuth])
    .inputValidator((input: unknown) =>
      PatientIdSchema.parse(input),
    )
    .handler(async ({ data, context }) => {
      const userId = context.userId;

      if (!userId) {
        throw new Error(
          "You must be signed in to view patient history.",
        );
      }

      /*
       * Ownership is checked BEFORE reading symptom history.
       */
      await verifyOwnedPatient(
        context.supabase,
        userId,
        data.patientId,
      );

      const { data: checks, error } =
        await context.supabase
          .from("symptom_checks")
          .select("id,symptoms,severity,urgency,top_condition,summary,subject_type,patient_id,created_at")
          .eq("user_id", userId)
          .eq("subject_type", "patient")
          .eq("patient_id", data.patientId)
          .order("created_at", {
            ascending: true,
          });

      if (error) {
        throw new Error(
          `Unable to load patient history: ${error.message}`,
        );
      }

      return (checks ?? []).map(
        (row): HistoryCheck => ({
          id: row.id,

          date: row.created_at,

          symptoms: row.symptoms,

          severity:
            typeof row.severity === "number"
              ? row.severity
              : 0,

          urgency: UrgencySchema.parse(row.urgency),

          topCondition:
            row.top_condition ?? "",

          summary: row.summary ?? "",

          subjectType: "patient",

          patientId: data.patientId,
        }),
      );
    });

/* -------------------------------------------------------------------------- */
/*                              Save check                                     */
/* -------------------------------------------------------------------------- */

export const saveCheck = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    SaveCheckSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    if (!userId) {
      throw new Error(
        "You must be signed in to save a symptom check.",
      );
    }

    /*
     * SELF
     *
     * A self assessment can never carry a patient ID.
     */
    if (data.subjectType === "self") {
      const payload = {
        user_id: userId,

        symptoms: data.symptoms,

        severity:
          data.severity ?? 0,

        urgency: data.urgency,

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
          data.vitals ?? null,

        uncertainty:
          data.uncertainty,

        next_step:
          data.nextStep,

        subject_type: "self",

        patient_id: null,
      };

      const { data: inserted, error } =
        await context.supabase
          .from("symptom_checks")
          .insert(payload)
          .select("id")
          .single();

      if (error) {
        throw new Error(
          `Unable to save symptom check: ${error.message}`,
        );
      }

      return {
        id: inserted.id,
      } satisfies SavedCheck;
    }

    /* ---------------------------------------------------------------------- */
    /*                              PATIENT                                    */
    /* ---------------------------------------------------------------------- */

    if (!data.patientId) {
      throw new Error(
        "A patient ID is required when saving a patient assessment.",
      );
    }

    /*
     * Never trust patientId by itself.
     * Verify that this patient belongs to the authenticated user.
     */
    await verifyOwnedPatient(
      context.supabase,
      userId,
      data.patientId,
    );

    const payload = {
      user_id: userId,

      symptoms: data.symptoms,

      severity:
        data.severity ?? 0,

      urgency: data.urgency,

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
        data.vitals ?? null,

      uncertainty:
        data.uncertainty,

      next_step:
        data.nextStep,

      subject_type: "patient",

      patient_id:
        data.patientId,
    };

    const { data: inserted, error } =
      await context.supabase
        .from("symptom_checks")
        .insert(payload)
        .select("id")
        .single();

    if (error) {
      throw new Error(
        `Unable to save patient symptom check: ${error.message}`,
      );
    }

    return {
      id: inserted.id,
    } satisfies SavedCheck;
  });

/* -------------------------------------------------------------------------- */
/*                              Delete check                                   */
/* -------------------------------------------------------------------------- */

export const deleteCheck = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    DeleteCheckSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    if (!userId) {
      throw new Error(
        "You must be signed in to delete history.",
      );
    }

    /*
     * First verify ownership of the actual symptom-check row.
     *
     * This is deliberately done before DELETE so the server does not rely
     * solely on the client or on an assumed RLS configuration.
     */
    const { data: existing, error: lookupError } =
      await context.supabase
        .from("symptom_checks")
        .select(
          "id,user_id,subject_type,patient_id",
        )
        .eq("id", data.id)
        .eq("user_id", userId)
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
     * If this is a patient entry, additionally verify that the patient
     * itself still belongs to the authenticated user.
     */
    if (
      existing.subject_type === "patient"
    ) {
      if (!existing.patient_id) {
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
     * DELETE is also owner-scoped.
     */
    const { error: deleteError } =
      await context.supabase
        .from("symptom_checks")
        .delete()
        .eq("id", data.id)
        .eq("user_id", userId);

    if (deleteError) {
      throw new Error(
        `Unable to delete history entry: ${deleteError.message}`,
      );
    }

    return {
      success: true,
      id: data.id,
    };
  });

/* -------------------------------------------------------------------------- */
/*                              Self profile                                   */
/* -------------------------------------------------------------------------- */

export const getProfile = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    if (!userId) {
      throw new Error(
        "You must be signed in to view your profile.",
      );
    }

    const { data, error } =
      await context.supabase
        .from("profiles")
        .select("id,name,age,sex")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to load profile: ${error.message}`,
      );
    }

    return {
      id: data?.id ?? userId,
      name: data?.name ?? "",
      age:
        data?.age !== null &&
        data?.age !== undefined
          ? String(data.age)
          : "",
      sex: data?.sex ?? "",
    };
  });

/* -------------------------------------------------------------------------- */
/*                     Get one patient's history entry count                   */
/* -------------------------------------------------------------------------- */

export const getPatientHistoryCount =
  createServerFn({
    method: "GET",
  })
    .middleware([requireSupabaseAuth])
    .inputValidator((input: unknown) =>
      PatientIdSchema.parse(input),
    )
    .handler(async ({ data, context }) => {
      const userId = context.userId;

      if (!userId) {
        throw new Error(
          "You must be signed in to view patient history.",
        );
      }

      await verifyOwnedPatient(
        context.supabase,
        userId,
        data.patientId,
      );

      const { count, error } =
        await context.supabase
          .from("symptom_checks")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("user_id", userId)
          .eq("subject_type", "patient")
          .eq("patient_id", data.patientId);

      if (error) {
        throw new Error(
          `Unable to count patient history: ${error.message}`,
        );
      }

      return {
        count: count ?? 0,
      };
    });