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

const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  age: z.string().trim().max(10).optional().default(""),
  sex: SexSchema.optional(),
  allergies: YesNoSchema.optional(),
  existingConditions: ExistingConditionSchema.optional(),
  currentMedications: z.string().trim().max(2000).optional().default(""),
  previousMajorIllnesses: YesNoSchema.optional(),
  previousMajorIllnessDetails: z.string().trim().max(2000).optional().default(""),
  smokingStatus: YesNoSchema.optional(),
  familyHistory: z.string().trim().max(2000).optional().default(""),
  pregnancyStatus: z.string().trim().max(100).optional().default(""),
});

export type ProfileInput = z.infer<typeof ProfileSchema>;

function normaliseProfile(input: ProfileInput) {
  const parsed = ProfileSchema.parse(input);

  return {
    name: parsed.name,
    age: parsed.age || null,
    sex: parsed.sex || null,
    allergies: parsed.allergies || null,
    existing_conditions: parsed.existingConditions || null,
    current_medications: parsed.currentMedications || null,
    previous_major_illnesses:
      parsed.previousMajorIllnesses === "Yes"
        ? parsed.previousMajorIllnessDetails || null
        : null,
    smoking_status: parsed.smokingStatus || null,
    family_history: parsed.familyHistory || null,
    pregnancy_status:
      parsed.sex === "Female"
        ? parsed.pregnancyStatus || null
        : null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Check whether Supabase is configured.
 * This is deliberately public and does not expose any secret.
 */
export const checkSupabaseConfig = createServerFn({
  method: "GET",
}).handler(async () => {
  const config = requireSupabaseServerConfig();

  return {
    configured: config.configured,
  };
});

/**
 * Read the logged-in user's own profile.
 */
export const getProfile = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  const config = requireSupabaseServerConfig();

  if (!context?.userId) {
    throw new Error("You must be signed in.");
  }

  const { data, error } = await supabase
    .from("profiles")
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
    .eq("id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load profile: ${error.message}`);
  }

  return {
    configured: config.configured,
    profile: data,
  };
});

/**
 * Update the logged-in user's own profile.
 */
export const saveProfile = createServerFn({
  method: "POST",
})
  .inputValidator(ProfileSchema)
  .handler(async ({ data, context }) => {
    requireSupabaseServerConfig();

    if (!context?.userId) {
      throw new Error("You must be signed in.");
    }

    const payload = normaliseProfile(data);

    const { data: saved, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", context.userId)
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
      .single();

    if (error) {
      throw new Error(`Unable to save profile: ${error.message}`);
    }

    return {
      success: true,
      profile: saved,
    };
  });