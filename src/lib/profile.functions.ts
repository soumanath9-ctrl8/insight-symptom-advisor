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

const ProfileSchema = z
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
     * Previous major illness:
     * Yes -> illness details are mandatory.
     * No  -> details must not be required.
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
     * Pregnancy status is applicable only to female users.
     */
    if (
      value.sex === "Male" &&
      value.pregnancyStatus.trim().length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pregnancyStatus"],
        message:
          "Pregnancy status is only applicable to female users.",
      });
    }
  });

export type ProfileInput = z.infer<typeof ProfileSchema>;

/* -------------------------------------------------------------------------- */
/*                              Authentication                                */
/* -------------------------------------------------------------------------- */

/**
 * Get the currently authenticated user.
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
      "You must be signed in to manage your profile.",
    );
  }

  return user;
}

/* -------------------------------------------------------------------------- */
/*                              Database Mapping                              */
/* -------------------------------------------------------------------------- */

function toProfileRow(
  input: ProfileInput,
) {
  const parsed = ProfileSchema.parse(input);

  return {
    name: parsed.name.trim(),

    age:
      parsed.age.trim() || null,

    sex:
      parsed.sex,

    allergies:
      parsed.allergies,

    existing_conditions:
      parsed.existingConditions,

    current_medications:
      parsed.currentMedications.trim() || null,

    /*
     * Store the actual previous illness only when
     * the user answered Yes.
     */
    previous_major_illnesses:
      parsed.previousMajorIllnesses === "Yes"
        ? parsed.previousMajorIllnessDetails.trim() || null
        : null,

    smoking_status:
      parsed.smokingStatus,

    family_history:
      parsed.familyHistory.trim() || null,

    /*
     * Only female users can have pregnancy information.
     */
    pregnancy_status:
      parsed.sex === "Female"
        ? parsed.pregnancyStatus.trim() || null
        : null,

    updated_at:
      new Date().toISOString(),
  };
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

  return (
    error.message ||
    "Database operation failed."
  );
}

/* -------------------------------------------------------------------------- */
/*                           Supabase Configuration                           */
/* -------------------------------------------------------------------------- */

/**
 * Kept for compatibility with the existing UI.
 *
 * The old implementation checked SUPABASE_URL /
 * SUPABASE_PUBLISHABLE_KEY on the server.
 *
 * That check is no longer necessary because this application
 * is using the Lovable Cloud Supabase client configured through
 * VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
 */
export async function checkSupabaseConfig() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    configured: true,
    authenticated: Boolean(user),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Get Own Profile                               */
/* -------------------------------------------------------------------------- */

/**
 * Load the logged-in user's own profile.
 *
 * IMPORTANT:
 * This function only reads the row whose id equals
 * the authenticated user's Supabase Auth user ID.
 */
export async function getProfile() {
  const user =
    await requireAuthenticatedUser();

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
      `Unable to load profile: ${getDatabaseErrorMessage(
        error,
      )}`,
    );
  }

  return {
    configured: true,
    profile: data,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Save Own Profile                              */
/* -------------------------------------------------------------------------- */

/**
 * Save/update the logged-in user's own profile.
 *
 * This NEVER writes to patient_profiles.
 *
 * Therefore:
 *
 * profiles
 *     = logged-in user's own profile
 *
 * patient_profiles
 *     = separate profiles for other people
 */
export async function saveProfile(
  input: ProfileInput,
) {
  const user =
    await requireAuthenticatedUser();

  const parsed =
    ProfileSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ??
        "Please check your profile information.",
    );
  }

  const payload =
    toProfileRow(parsed.data);

  /*
   * We update only the currently authenticated
   * user's profile.
   */
  const { data: saved, error } =
    await supabase
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
      `Unable to save profile: ${getDatabaseErrorMessage(
        error,
      )}`,
    );
  }

  return {
    success: true,
    profile: saved,
  };
}