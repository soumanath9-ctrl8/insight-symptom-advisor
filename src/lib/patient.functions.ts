import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                                   Schemas                                  */
/* -------------------------------------------------------------------------- */

const SexSchema = z.enum(["Male", "Female"]);

const YesNoSchema = z.enum(["Yes", "No"]);

const ExistingConditionSchema = z.enum([
  "Well",
  "Very Well",
  "Moderate",
  "Worst",
  "Emergency",
]);

const PatientSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required.")
      .max(100, "Name is too long."),

    age: z
      .string()
      .trim()
      .max(10, "Age is invalid.")
      .default(""),

    sex: SexSchema,

    allergies: YesNoSchema,

    existingConditions: ExistingConditionSchema,

    currentMedications: z
      .string()
      .trim()
      .max(2000, "Current medications information is too long.")
      .default(""),

    previousMajorIllnesses: YesNoSchema,

    previousMajorIllnessDetails: z
      .string()
      .trim()
      .max(2000, "Previous illness information is too long.")
      .default(""),

    smokingStatus: YesNoSchema,

    familyHistory: z
      .string()
      .trim()
      .max(2000, "Family history information is too long.")
      .default(""),

    pregnancyStatus: z
      .string()
      .trim()
      .max(100, "Pregnancy status is invalid.")
      .default(""),
  })
  .superRefine((value, ctx) => {
    if (
      value.previousMajorIllnesses === "Yes" &&
      !value.previousMajorIllnessDetails.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousMajorIllnessDetails"],
        message: "Please enter the previous major illness.",
      });
    }

    if (
      value.previousMajorIllnesses === "No" &&
      value.previousMajorIllnessDetails.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousMajorIllnessDetails"],
        message:
          "Previous illness details should be empty when the answer is No.",
      });
    }

    if (
      value.sex === "Male" &&
      value.pregnancyStatus.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pregnancyStatus"],
        message:
          "Pregnancy status is only applicable to female patients.",
      });
    }
  });

export type PatientInput = z.infer<typeof PatientSchema>;

/* -------------------------------------------------------------------------- */
/*                              Database Types                                */
/* -------------------------------------------------------------------------- */

type PatientIdInput = {
  patientId: string;
};

/* -------------------------------------------------------------------------- */
/*                              Server Supabase                               */
/* -------------------------------------------------------------------------- */

/**
 * IMPORTANT:
 *
 * We intentionally import client.server dynamically inside server handlers.
 *
 * Do NOT import "@/integrations/supabase/client" here.
 *
 * client.ts is the browser client.
 * client.server.ts is the Lovable Cloud server-side client.
 *
 * The generated server client uses SUPABASE_SERVICE_ROLE_KEY and therefore
 * must never be sent to the browser.
 */
async function getSupabaseAdmin() {
  const module = await import(
    "@/integrations/supabase/client.server"
  );

  return module.supabaseAdmin;
}

/* -------------------------------------------------------------------------- */
/*                              Authentication                                */
/* -------------------------------------------------------------------------- */

/**
 * All server functions use context.userId supplied by the application's
 * authenticated server context.
 *
 * Even though the server client bypasses RLS, every query below explicitly
 * checks user_id. Therefore one logged-in user cannot access another user's
 * patient profiles through these functions.
 */
function requireUserId(context: { userId?: string } | undefined) {
  const userId = context?.userId;

  if (!userId) {
    throw new Error(
      "You must be signed in to manage patient profiles.",
    );
  }

  return userId;
}

/* -------------------------------------------------------------------------- */
/*                              Error Handling                                */
/* -------------------------------------------------------------------------- */

function databaseError(
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null,
) {
  if (!error) {
    return "An unknown database error occurred.";
  }

  if (error.code === "PGRST116") {
    return "The requested patient profile was not found.";
  }

  return error.message || "Database operation failed.";
}

/* -------------------------------------------------------------------------- */
/*                              Database Mapping                              */
/* -------------------------------------------------------------------------- */

function toPatientRow(
  input: PatientInput,
  userId: string,
) {
  return {
    user_id: userId,

    name: input.name.trim(),

    age: input.age.trim() || null,

    sex: input.sex,

    allergies: input.allergies,

    existing_conditions: input.existingConditions,

    current_medications:
      input.currentMedications.trim() || null,

    /*
     * We store the actual illness description only when
     * previousMajorIllnesses is Yes.
     */
    previous_major_illnesses:
      input.previousMajorIllnesses === "Yes"
        ? input.previousMajorIllnessDetails.trim() || null
        : null,

    smoking_status: input.smokingStatus,

    family_history:
      input.familyHistory.trim() || null,

    /*
     * Male patients never receive pregnancy information.
     */
    pregnancy_status:
      input.sex === "Female"
        ? input.pregnancyStatus.trim() || null
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/*                              List Patients                                 */
/* -------------------------------------------------------------------------- */

export const listPatients = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  const userId = requireUserId(context);

  const supabaseAdmin = await getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("patient_profiles")
    .select(
      [
        "id",
        "user_id",
        "name",
        "age",
        "sex",
        "allergies",
        "existing_conditions",
        "current_medications",
        "previous_major_illnesses",
        "smoking_status",
        "family_history",
        "pregnancy_status",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("user_id", userId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `Unable to load patient profiles: ${databaseError(error)}`,
    );
  }

  return data ?? [];
});

/* -------------------------------------------------------------------------- */
/*                              Get Patient                                   */
/* -------------------------------------------------------------------------- */

export const getPatient = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      patientId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);

    const supabaseAdmin = await getSupabaseAdmin();

    const { data: patient, error } = await supabaseAdmin
      .from("patient_profiles")
      .select("*")
      .eq("id", data.patientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to load patient: ${databaseError(error)}`,
      );
    }

    if (!patient) {
      throw new Error(
        "Patient profile was not found.",
      );
    }

    return patient;
  });

/* -------------------------------------------------------------------------- */
/*                              Create Patient                                */
/* -------------------------------------------------------------------------- */

export const createPatient = createServerFn({
  method: "POST",
})
  .inputValidator(PatientSchema)
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);

    const supabaseAdmin = await getSupabaseAdmin();

    const payload = toPatientRow(
      data,
      userId,
    );

    const { data: patient, error } =
      await supabaseAdmin
        .from("patient_profiles")
        .insert(payload)
        .select("*")
        .single();

    if (error) {
      throw new Error(
        `Unable to create patient: ${databaseError(error)}`,
      );
    }

    return {
      success: true,
      patient,
    };
  });

/* -------------------------------------------------------------------------- */
/*                              Update Patient                                */
/* -------------------------------------------------------------------------- */

export const updatePatient = createServerFn({
  method: "POST",
})
  .inputValidator(
    PatientSchema.extend({
      patientId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);

    const supabaseAdmin = await getSupabaseAdmin();

    const {
      patientId,
      ...patientInput
    } = data;

    const payload = {
      ...toPatientRow(
        patientInput,
        userId,
      ),

      updated_at:
        new Date().toISOString(),
    };

    const { data: patient, error } =
      await supabaseAdmin
        .from("patient_profiles")
        .update(payload)
        .eq("id", patientId)
        .eq("user_id", userId)
        .select("*")
        .single();

    if (error) {
      throw new Error(
        `Unable to update patient: ${databaseError(error)}`,
      );
    }

    return {
      success: true,
      patient,
    };
  });

/* -------------------------------------------------------------------------- */
/*                              Delete Patient                                */
/* -------------------------------------------------------------------------- */

export const deletePatient = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      patientId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);

    const supabaseAdmin = await getSupabaseAdmin();

    /*
     * Ownership check is deliberately repeated here.
     *
     * Even though this server client bypasses RLS, a user can delete
     * only a patient profile belonging to their own account.
     */
    const { data: deletedPatient, error } =
      await supabaseAdmin
        .from("patient_profiles")
        .delete()
        .eq("id", data.patientId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to delete patient: ${databaseError(error)}`,
      );
    }

    if (!deletedPatient) {
      throw new Error(
        "Patient profile was not found or does not belong to your account.",
      );
    }

    return {
      success: true,
      patientId: deletedPatient.id,
    };
  });