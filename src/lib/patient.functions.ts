import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

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
    /*
     * If the user says that the patient had a previous major illness,
     * the actual illness must be entered.
     */
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

    /*
     * Pregnancy status applies only to female patients.
     */
    if (
      value.sex === "Male" &&
      value.pregnancyStatus.trim().length > 0
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
     * Database stores the actual illness description.
     *
     * If the answer is "No", the value is NULL.
     */
    previous_major_illnesses:
      input.previousMajorIllnesses === "Yes"
        ? input.previousMajorIllnessDetails.trim() || null
        : null,

    smoking_status: input.smokingStatus,

    family_history:
      input.familyHistory.trim() || null,

    /*
     * Pregnancy information is stored only for female patients.
     */
    pregnancy_status:
      input.sex === "Female"
        ? input.pregnancyStatus.trim() || null
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Authentication                                */
/* -------------------------------------------------------------------------- */

/**
 * Returns the currently authenticated Supabase user.
 *
 * This deliberately uses the browser Supabase client so the current
 * authenticated session is automatically used.
 *
 * RLS then limits database access to rows owned by this user.
 */
async function requireAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(
      `Unable to verify your login session: ${error.message}`,
    );
  }

  if (!user) {
    throw new Error(
      "You must be signed in to manage patient profiles.",
    );
  }

  return user;
}

/* -------------------------------------------------------------------------- */
/*                              Error Handling                                */
/* -------------------------------------------------------------------------- */

function getDatabaseErrorMessage(
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

  /*
   * Keep the actual Supabase message because it is useful while debugging
   * Lovable Cloud/RLS/table issues.
   */
  return error.message || "Database operation failed.";
}

/* -------------------------------------------------------------------------- */
/*                              List Patients                                 */
/* -------------------------------------------------------------------------- */

/**
 * Load all patient profiles created by the current logged-in user.
 *
 * IMPORTANT:
 * This query is explicitly filtered by user_id.
 *
 * Therefore:
 * User A cannot load User B's patient profiles.
 */
export async function listPatients() {
  const user = await requireAuthenticatedUser();

  const { data, error } = await supabase
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
    .eq("user_id", user.id)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `Unable to load patient profiles: ${getDatabaseErrorMessage(
        error,
      )}`,
    );
  }

  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*                              Get One Patient                               */
/* -------------------------------------------------------------------------- */

/**
 * Load one patient profile.
 *
 * The query contains BOTH:
 *   - patient id
 *   - authenticated user's id
 *
 * This prevents accidentally loading another user's patient.
 */
export async function getPatient(
  patientId: string,
) {
  const user = await requireAuthenticatedUser();

  const parsedId = z
    .string()
    .uuid()
    .safeParse(patientId);

  if (!parsedId.success) {
    throw new Error("Invalid patient profile ID.");
  }

  const { data, error } = await supabase
    .from("patient_profiles")
    .select("*")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load patient: ${getDatabaseErrorMessage(
        error,
      )}`,
    );
  }

  if (!data) {
    throw new Error(
      "Patient profile was not found.",
    );
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/*                              Create Patient                                */
/* -------------------------------------------------------------------------- */

/**
 * Create a completely separate patient profile.
 *
 * This is NOT connected to the logged-in user's own profile.
 */
export async function createPatient(
  input: PatientInput,
) {
  const user = await requireAuthenticatedUser();

  const parsed = PatientSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ??
        "Please check the patient information.",
    );
  }

  const payload = toPatientRow(
    parsed.data,
    user.id,
  );

  const { data: patient, error } = await supabase
    .from("patient_profiles")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to create patient: ${getDatabaseErrorMessage(
        error,
      )}`,
    );
  }

  return {
    success: true,
    patient,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Update Patient                                */
/* -------------------------------------------------------------------------- */

/**
 * Update an existing patient profile.
 *
 * Only the authenticated user's own patient profile can be updated.
 */
export async function updatePatient(
  input: PatientInput & {
    patientId: string;
  },
) {
  const user = await requireAuthenticatedUser();

  const parsedId = z
    .string()
    .uuid()
    .safeParse(input.patientId);

  if (!parsedId.success) {
    throw new Error("Invalid patient profile ID.");
  }

  const parsed = PatientSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ??
        "Please check the patient information.",
    );
  }

  const payload = {
    ...toPatientRow(
      parsed.data,
      user.id,
    ),

    updated_at:
      new Date().toISOString(),
  };

  const { data: patient, error } = await supabase
    .from("patient_profiles")
    .update(payload)
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to update patient: ${getDatabaseErrorMessage(
        error,
      )}`,
    );
  }

  return {
    success: true,
    patient,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Delete Patient                                */
/* -------------------------------------------------------------------------- */

/**
 * Delete a patient profile.
 *
 * The user_id condition ensures the currently logged-in user
 * can delete only their own patient record.
 */
export async function deletePatient(
  patientId: string,
) {
  const user = await requireAuthenticatedUser();

  const parsedId = z
    .string()
    .uuid()
    .safeParse(patientId);

  if (!parsedId.success) {
    throw new Error("Invalid patient profile ID.");
  }

  const { error } = await supabase
    .from("patient_profiles")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(
      `Unable to delete patient: ${getDatabaseErrorMessage(
        error,
      )}`,
    );
  }

  return {
    success: true,
  };
}