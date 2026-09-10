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
     *
     * Yes -> actual illness details required.
     * No  -> details must remain empty.
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

    /*
     * Pregnancy information applies only to female users.
     */
    if (
      value.sex === "Male" &&
      value.pregnancyStatus.trim()
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
/*                              Server Supabase                               */
/* -------------------------------------------------------------------------- */

/**
 * IMPORTANT:
 *
 * The browser Supabase client is NOT used in this file.
 *
 * This dynamically loads Lovable's generated server-only Supabase client.
 *
 * The service-role credential therefore remains server-side.
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

function requireUserId(
  context: { userId?: string } | undefined,
) {
  const userId = context?.userId;

  if (!userId) {
    throw new Error(
      "You must be signed in to manage your profile.",
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
    return "Profile was not found.";
  }

  return error.message || "Database operation failed.";
}

/* -------------------------------------------------------------------------- */
/*                              Database Mapping                              */
/* -------------------------------------------------------------------------- */

function toProfileRow(
  input: ProfileInput,
) {
  return {
    name: input.name.trim(),

    age:
      input.age.trim() || null,

    sex:
      input.sex,

    allergies:
      input.allergies,

    existing_conditions:
      input.existingConditions,

    current_medications:
      input.currentMedications.trim() || null,

    /*
     * Only save the illness description when the answer is Yes.
     */
    previous_major_illnesses:
      input.previousMajorIllnesses === "Yes"
        ? input.previousMajorIllnessDetails.trim() || null
        : null,

    smoking_status:
      input.smokingStatus,

    family_history:
      input.familyHistory.trim() || null,

    /*
     * Male users never receive pregnancy data.
     */
    pregnancy_status:
      input.sex === "Female"
        ? input.pregnancyStatus.trim() || null
        : null,

    updated_at:
      new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*                           Supabase Configuration                           */
/* -------------------------------------------------------------------------- */

/**
 * Kept for compatibility with the existing profile UI.
 *
 * IMPORTANT:
 * This no longer checks SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.
 *
 * Those browser environment variables are not required for this server
 * function because the server uses Lovable's generated client.server.ts.
 */
export const checkSupabaseConfig = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  const userId = context?.userId;

  return {
    configured: true,
    authenticated: Boolean(userId),
  };
});

/* -------------------------------------------------------------------------- */
/*                              Get Own Profile                               */
/* -------------------------------------------------------------------------- */

export const getProfile = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  const userId = requireUserId(context);

  const supabaseAdmin =
    await getSupabaseAdmin();

  const { data, error } =
    await supabaseAdmin
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
      .eq("id", userId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load profile: ${databaseError(error)}`,
    );
  }

  return {
    configured: true,
    profile: data,
  };
});

/* -------------------------------------------------------------------------- */
/*                              Save Own Profile                              */
/* -------------------------------------------------------------------------- */

export const saveProfile = createServerFn({
  method: "POST",
})
  .inputValidator(ProfileSchema)
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);

    const supabaseAdmin =
      await getSupabaseAdmin();

    const payload =
      toProfileRow(data);

    /*
     * The profile table is normally created automatically when
     * a Supabase Auth user is created.
     *
     * We first attempt an update because the profile already exists
     * in the normal application flow.
     */
    const { data: updated, error: updateError } =
      await supabaseAdmin
        .from("profiles")
        .update(payload)
        .eq("id", userId)
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
        .maybeSingle();

    if (updateError) {
      throw new Error(
        `Unable to save profile: ${databaseError(updateError)}`,
      );
    }

    /*
     * If the row does not exist for some reason, create it.
     *
     * This protects the profile page from a missing profile row
     * without requiring the user to manually create one.
     */
    if (!updated) {
      const { data: inserted, error: insertError } =
        await supabaseAdmin
          .from("profiles")
          .insert({
            id: userId,
            ...payload,
          })
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

      if (insertError) {
        throw new Error(
          `Unable to create profile: ${databaseError(insertError)}`,
        );
      }

      return {
        success: true,
        profile: inserted,
      };
    }

    return {
      success: true,
      profile: updated,
    };
  });