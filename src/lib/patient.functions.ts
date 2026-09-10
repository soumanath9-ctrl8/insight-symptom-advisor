import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseServerConfig } from "@/lib/supabase-env.server";
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

const PatientSchema = z.object({
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
});

export type PatientInput = z.infer<typeof PatientSchema>;

function toRow(input: PatientInput, userId: string) {
  return {
    user_id: userId,
    name: input.name,
    age: input.age || null,
    sex: input.sex,
    allergies: input.allergies,
    existing_conditions: input.existingConditions,
    current_medications: input.currentMedications || null,
    previous_major_illnesses:
      input.previousMajorIllnesses === "Yes"
        ? input.previousMajorIllnessDetails || null
        : null,
    smoking_status: input.smokingStatus,
    family_history: input.familyHistory || null,
    pregnancy_status:
      input.sex === "Female"
        ? input.pregnancyStatus || null
        : null,
  };
}

export const listPatients = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  requireSupabaseServerConfig();

  if (!context?.userId) {
    throw new Error("You must be signed in.");
  }

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
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load patient profiles: ${error.message}`);
  }

  return data ?? [];
});

export const getPatient = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      patientId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    requireSupabaseServerConfig();

    if (!context?.userId) {
      throw new Error("You must be signed in.");
    }

    const { data: patient, error } = await supabase
      .from("patient_profiles")
      .select("*")
      .eq("id", data.patientId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load patient: ${error.message}`);
    }

    if (!patient) {
      throw new Error("Patient profile was not found.");
    }

    return patient;
  });

export const createPatient = createServerFn({
  method: "POST",
})
  .inputValidator(PatientSchema)
  .handler(async ({ data, context }) => {
    requireSupabaseServerConfig();

    if (!context?.userId) {
      throw new Error("You must be signed in.");
    }

    const payload = toRow(data, context.userId);

    const { data: patient, error } = await supabase
      .from("patient_profiles")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Unable to create patient: ${error.message}`);
    }

    return {
      success: true,
      patient,
    };
  });

export const updatePatient = createServerFn({
  method: "POST",
})
  .inputValidator(
    PatientSchema.extend({
      patientId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    requireSupabaseServerConfig();

    if (!context?.userId) {
      throw new Error("You must be signed in.");
    }

    const { patientId, ...profile } = data;

    const payload = {
      ...toRow(profile, context.userId),
      updated_at: new Date().toISOString(),
    };

    const { data: patient, error } = await supabase
      .from("patient_profiles")
      .update(payload)
      .eq("id", patientId)
      .eq("user_id", context.userId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Unable to update patient: ${error.message}`);
    }

    return {
      success: true,
      patient,
    };
  });

export const deletePatient = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      patientId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    requireSupabaseServerConfig();

    if (!context?.userId) {
      throw new Error("You must be signed in.");
    }

    const { error } = await supabase
      .from("patient_profiles")
      .delete()
      .eq("id", data.patientId)
      .eq("user_id", context.userId);

    if (error) {
      throw new Error(`Unable to delete patient: ${error.message}`);
    }

    return {
      success: true,
    };
  });