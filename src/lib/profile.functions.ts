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

const ProfileSchema = z
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
        message:
          "Pregnancy status is only applicable to female users.",
      });
    }
  });

export type ProfileInput = z.infer<typeof ProfileSchema>;

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(
      `Unable to verify your session: ${error.message}`,
    );
  }

  if (!user) {
    throw new Error("You must be signed in.");
  }

  return user;
}

function normaliseProfile(input: ProfileInput) {
  const parsed = ProfileSchema.parse(input);

  return {
    name: parsed.name.trim(),

    age: parsed.age.trim() || null,

    sex: parsed.sex,

    allergies: parsed.allergies,

    existing_conditions: parsed.existingConditions,

    current_medications:
      parsed.currentMedications.trim() || null,

    previous_major_illnesses:
      parsed.previousMajorIllnesses === "Yes"
        ? parsed.previousMajorIllnessDetails.trim() || null
        : null,

    smoking_status: parsed.smokingStatus,

    family_history:
      parsed.familyHistory.trim() || null,

    pregnancy_status:
      parsed.sex === "Female"
        ? parsed.pregnancyStatus.trim() || null
        : null,

    updated_at: new Date().toISOString(),
  };
}

/**
 * Check that the authenticated Supabase session is available.
 *
 * Kept for compatibility with the existing UI.
 */
export async function checkSupabaseConfig() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    configured: Boolean(user),
  };
}

/**
 * Read the currently logged-in user's own profile.
 */
export async function getProfile() {
  const user = await requireUser();

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
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load profile: ${error.message}`,
    );
  }

  return {
    configured: true,
    profile: data,
  };
}

/**
 * Save the currently logged-in user's own profile.
 */
export async function saveProfile(input: ProfileInput) {
  const user = await requireUser();

  const parsed = ProfileSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ??
        "Please check your profile information.",
    );
  }

  const payload = normaliseProfile(parsed.data);

  const { data: saved, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", user.id)
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
    throw new Error(
      `Unable to save profile: ${error.message}`,
    );
  }

  return {
    success: true,
    profile: saved,
  };
}