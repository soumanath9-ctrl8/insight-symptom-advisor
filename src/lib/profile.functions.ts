import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PatientProfile, ProfileData } from "./profile.types";

const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  age: z.string().trim().max(10).optional().default(""),
  sex: z.enum(["Male", "Female", ""]).default(""),
  allergies: z.enum(["Yes", "No", ""]).default(""),
  existingConditions: z
    .enum(["Well", "Very Well", "Moderate", "Worst", "Emergency", ""])
    .default(""),
  currentMedications: z.string().trim().max(2000).default(""),
  previousMajorIllnesses: z.string().trim().max(2000).default(""),
  smokingStatus: z.enum(["Yes", "No", ""]).default(""),
  familyHistory: z.string().trim().max(2000).default(""),
  pregnancyStatus: z.enum(["Yes", "No", ""]).default(""),
});

function cleanPregnancyStatus(
  sex: ProfileData["sex"],
  pregnancyStatus: ProfileData["pregnancyStatus"],
) {
  return sex === "Female" ? pregnancyStatus : "";
}

function mapProfile(row: any): ProfileData {
  const sex =
    row.sex === "Male" || row.sex === "Female"
      ? row.sex
      : "";

  return {
    id: row.id,
    name: row.name ?? "",
    age: row.age ?? "",
    sex,
    allergies:
      row.allergies === "Yes" || row.allergies === "No"
        ? row.allergies
        : "",
    existingConditions:
      row.existing_conditions ?? "",
    currentMedications:
      row.current_medications ?? "",
    previousMajorIllnesses:
      row.previous_major_illnesses ?? "",
    smokingStatus:
      row.smoking_status === "Yes" || row.smoking_status === "No"
        ? row.smoking_status
        : "",
    familyHistory:
      row.family_history ?? "",
    pregnancyStatus:
      sex === "Female" &&
      (row.pregnancy_status === "Yes" ||
        row.pregnancy_status === "No")
        ? row.pregnancy_status
        : "",
  };
}

export const getOwnProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select(
        "id,name,age,sex,allergies,existing_conditions,current_medications,previous_major_illnesses,smoking_status,family_history,pregnancy_status",
      )
      .eq("id", context.userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return null;
    }

    return mapProfile(data);
  });

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ProfileSchema)
  .handler(async ({ context, data }) => {
    const parsed = ProfileSchema.parse(data);

    const payload = {
      name: parsed.name,
      age: parsed.age,
      sex: parsed.sex,
      allergies: parsed.allergies,
      existing_conditions: parsed.existingConditions,
      current_medications: parsed.currentMedications,
      previous_major_illnesses: parsed.previousMajorIllnesses,
      smoking_status: parsed.smokingStatus,
      family_history: parsed.familyHistory,
      pregnancy_status: cleanPregnancyStatus(
        parsed.sex,
        parsed.pregnancyStatus,
      ),
      updated_at: new Date().toISOString(),
    };

    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(payload)
      .eq("id", context.userId)
      .select(
        "id,name,age,sex,allergies,existing_conditions,current_medications,previous_major_illnesses,smoking_status,family_history,pregnancy_status",
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return mapProfile(row);
  });

export const listPatientProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("patient_profiles")
      .select(
        "id,owner_user_id,name,age,sex,allergies,existing_conditions,current_medications,previous_major_illnesses,smoking_status,family_history,pregnancy_status,created_at,updated_at",
      )
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map(
      (row): PatientProfile => ({
        ...mapProfile(row),
        ownerUserId: row.owner_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  });

export const createPatientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ProfileSchema)
  .handler(async ({ context, data }) => {
    const parsed = ProfileSchema.parse(data);

    const { data: row, error } = await context.supabase
      .from("patient_profiles")
      .insert({
        owner_user_id: context.userId,
        name: parsed.name,
        age: parsed.age,
        sex: parsed.sex,
        allergies: parsed.allergies,
        existing_conditions: parsed.existingConditions,
        current_medications: parsed.currentMedications,
        previous_major_illnesses:
          parsed.previousMajorIllnesses,
        smoking_status: parsed.smokingStatus,
        family_history: parsed.familyHistory,
        pregnancy_status: cleanPregnancyStatus(
          parsed.sex,
          parsed.pregnancyStatus,
        ),
      })
      .select(
        "id,owner_user_id,name,age,sex,allergies,existing_conditions,current_medications,previous_major_illnesses,smoking_status,family_history,pregnancy_status,created_at,updated_at",
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      ...mapProfile(row),
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies PatientProfile;
  });

export const updatePatientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      profile: ProfileSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    const parsed = ProfileSchema.parse(data.profile);

    const { data: row, error } = await context.supabase
      .from("patient_profiles")
      .update({
        name: parsed.name,
        age: parsed.age,
        sex: parsed.sex,
        allergies: parsed.allergies,
        existing_conditions: parsed.existingConditions,
        current_medications: parsed.currentMedications,
        previous_major_illnesses:
          parsed.previousMajorIllnesses,
        smoking_status: parsed.smokingStatus,
        family_history: parsed.familyHistory,
        pregnancy_status: cleanPregnancyStatus(
          parsed.sex,
          parsed.pregnancyStatus,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("owner_user_id", context.userId)
      .select(
        "id,owner_user_id,name,age,sex,allergies,existing_conditions,current_medications,previous_major_illnesses,smoking_status,family_history,pregnancy_status,created_at,updated_at",
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      ...mapProfile(row),
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies PatientProfile;
  });

export const deletePatientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("patient_profiles")
      .delete()
      .eq("id", data.id)
      .eq("owner_user_id", context.userId);

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });