import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

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
    name: z.string().trim().min(1, "Name is required.").max(100),

    age: z.string().trim().max(10).default(""),

    sex: SexSchema,

    allergies: YesNoSchema,

    existingConditions: ExistingConditionSchema,

    currentMedications: z.string().trim().max(2000).default(""),

    previousMajorIllnesses: YesNoSchema,

    previousMajorIllnessDetails: z
      .string()
      .trim()
      .max(2000)
      .default(""),

    smokingStatus: YesNoSchema,

    familyHistory: z.string().trim().max(2000).default(""),

    pregnancyStatus: z.string().trim().max(100).default(""),
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

    if (value.sex === "Male" && value.pregnancyStatus.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pregnancyStatus"],
        message: "Pregnancy status is only applicable to female patients.",
      });
    }
  });

export type PatientInput = z.infer<typeof PatientSchema>;

function toRow(input: PatientInput, userId: string) {
  return {
    user_id: userId,
    name: input.name.trim(),
    age: input.age.trim() || null,
    sex: input.sex,
    allergies: input.allergies,
    existing_conditions: input.existingConditions,
    current_medications:
      input.currentMedications.trim() || null,

    previous_major_illnesses:
      input.previousMajorIllnesses === "Yes"
        ? input.previousMajorIllnessDetails.trim() || null
        : null,

    smoking_status: input.smokingStatus,

    family_history:
      input.familyHistory.trim() || null,

    pregnancy_status:
      input.sex === "Female"
        ? input.pregnancyStatus.trim() || null
        : null,
  };
}

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Unable to verify your session: ${error.message}`);
  }

  if (!user) {
    throw new Error("You must be signed in.");
  }

  return user;
}

/**
 * Load all patient profiles belonging to the currently
 * authenticated user.
 */
export async function listPatients() {
  const user = await requireUser();

  const { data, error } = await supabase
    .from("patient_profiles")
    .select(
      [
        "id",
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
      `Unable to load patient profiles: ${error.message}`,
    );
  }

  return data ?? [];
}

/**
 * Load one patient belonging to the currently authenticated user.
 */
export async function getPatient(patientId: string) {
  const user = await requireUser();

  const parsedId = z.string().uuid().safeParse(patientId);

  if (!parsedId.success) {
    throw new Error("Invalid patient profile.");
  }

  const { data, error } = await supabase
    .from("patient_profiles")
    .select("*")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load patient: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error("Patient profile was not found.");
  }

  return data;
}

/**
 * Create a new separate patient profile.
 */
export async function createPatient(input: PatientInput) {
  const user = await requireUser();

  const parsed = PatientSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ??
        "Please check the patient information.",
    );
  }

  const payload = toRow(parsed.data, user.id);

  const { data: patient, error } = await supabase
    .from("patient_profiles")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to create patient: ${error.message}`,
    );
  }

  return {
    success: true,
    patient,
  };
}

/**
 * Update an existing patient belonging to the current user.
 */
export async function updatePatient(
  input: PatientInput & {
    patientId: string;
  },
) {
  const user = await requireUser();

  const idResult = z
    .string()
    .uuid()
    .safeParse(input.patientId);

  if (!idResult.success) {
    throw new Error("Invalid patient profile.");
  }

  const parsed = PatientSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ??
        "Please check the patient information.",
    );
  }

  const payload = {
    ...toRow(parsed.data, user.id),
    updated_at: new Date().toISOString(),
  };

  const { data: patient, error } = await supabase
    .from("patient_profiles")
    .update(payload)
    .eq("id", idResult.data)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to update patient: ${error.message}`,
    );
  }

  return {
    success: true,
    patient,
  };
}

/**
 * Delete a patient belonging to the current user.
 */
export async function deletePatient(patientId: string) {
  const user = await requireUser();

  const idResult = z
    .string()
    .uuid()
    .safeParse(patientId);

  if (!idResult.success) {
    throw new Error("Invalid patient profile.");
  }

  const { error } = await supabase
    .from("patient_profiles")
    .delete()
    .eq("id", idResult.data)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(
      `Unable to delete patient: ${error.message}`,
    );
  }

  return {
    success: true,
  };
}