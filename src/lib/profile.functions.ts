import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  const userId = (context as { userId?: string })?.userId;

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
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
  .middleware([requireSupabaseAuth])
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
/* -------------------------------------------------------------------------- */
/*                     UI-facing profile / patient helpers                    */
/* -------------------------------------------------------------------------- */

/**
 * Shape used by the profile editor UI (ProfileData in profile.types.ts).
 * previousMajorIllnesses is stored as free text here.
 */
const UiProfileSchema = z.object({
  name: z.string().trim().max(100).default(""),
  age: z.string().trim().max(10).default(""),
  sex: z.string().trim().max(20).default(""),
  allergies: z.string().trim().max(20).default(""),
  existingConditions: z.string().trim().max(40).default(""),
  currentMedications: z.string().trim().max(2000).default(""),
  previousMajorIllnesses: z.string().trim().max(2000).default(""),
  smokingStatus: z.string().trim().max(20).default(""),
  familyHistory: z.string().trim().max(2000).default(""),
  pregnancyStatus: z.string().trim().max(20).default(""),
});

type UiProfileInput = z.infer<typeof UiProfileSchema>;

const UI_COLUMNS = [
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
].join(",");

function toUiRow(input: UiProfileInput) {
  return {
    name: input.name,
    age: input.age || null,
    sex: input.sex || null,
    allergies: input.allergies || null,
    existing_conditions: input.existingConditions || null,
    current_medications: input.currentMedications || null,
    previous_major_illnesses: input.previousMajorIllnesses || null,
    smoking_status: input.smokingStatus || null,
    family_history: input.familyHistory || null,
    pregnancy_status:
      input.sex === "Female" ? input.pregnancyStatus || null : null,
    updated_at: new Date().toISOString(),
  };
}

function fromUiRow(row: Record<string, unknown> | null) {
  if (!row) return null;

  const text = (value: unknown) =>
    typeof value === "string" ? value : value == null ? "" : String(value);

  return {
    id: text(row["id"]),
    name: text(row["name"]),
    age: text(row["age"]),
    sex: text(row["sex"]) as "Male" | "Female" | "",
    allergies: text(row["allergies"]) as "Yes" | "No" | "",
    existingConditions: text(row["existing_conditions"]) as never,
    currentMedications: text(row["current_medications"]),
    previousMajorIllnesses: text(row["previous_major_illnesses"]),
    smokingStatus: text(row["smoking_status"]) as "Yes" | "No" | "",
    familyHistory: text(row["family_history"]),
    pregnancyStatus: text(row["pregnancy_status"]) as "Yes" | "No" | "",
  };
}

export const getOwnProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
  async ({ context }) => {
    const userId = requireUserId(context);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(UI_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load profile: ${databaseError(error)}`);
    }

    return fromUiRow(data as unknown as Record<string, unknown> | null);
  },
);

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(UiProfileSchema)
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);
    const supabaseAdmin = await getSupabaseAdmin();

    const payload = toUiRow(data);

    const { data: updated, error } = await supabaseAdmin
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select(UI_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to save profile: ${databaseError(error)}`);
    }

    if (!updated) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("profiles")
        .insert({ id: userId, ...payload })
        .select(UI_COLUMNS)
        .single();

      if (insertError) {
        throw new Error(
          `Unable to create profile: ${databaseError(insertError)}`,
        );
      }

      return fromUiRow(inserted as unknown as Record<string, unknown>);
    }

    return fromUiRow(updated as unknown as Record<string, unknown>);
  });

export const listPatientProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
  async ({ context }) => {
    const userId = requireUserId(context);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("patient_profiles")
      .select("*")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Unable to load patient profiles: ${databaseError(error)}`,
      );
    }

    return (data ?? []).map((row) => {
      const profile = fromUiRow(row as unknown as Record<string, unknown>)!;

      return {
        ...profile,
        ownerUserId: String((row as unknown as Record<string, unknown>)["owner_user_id"] ?? ""),
        createdAt: String((row as unknown as Record<string, unknown>)["created_at"] ?? ""),
        updatedAt: String((row as unknown as Record<string, unknown>)["updated_at"] ?? ""),
      };
    });
  },
);

export const createPatientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(UiProfileSchema)
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);
    const supabaseAdmin = await getSupabaseAdmin();

    const { updated_at, ...row } = toUiRow(data);

    const { data: inserted, error } = await supabaseAdmin
      .from("patient_profiles")
      .insert({ owner_user_id: userId, ...row })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Unable to create patient: ${databaseError(error)}`);
    }

    return fromUiRow(inserted as unknown as Record<string, unknown>);
  });

export const updatePatientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      profile: UiProfileSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: updated, error } = await supabaseAdmin
      .from("patient_profiles")
      .update(toUiRow(data.profile))
      .eq("id", data.id)
      .eq("owner_user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to update patient: ${databaseError(error)}`);
    }

    if (!updated) {
      throw new Error("Patient profile was not found.");
    }

    return fromUiRow(updated as unknown as Record<string, unknown>);
  });

export const deletePatientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const userId = requireUserId(context);
    const supabaseAdmin = await getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("patient_profiles")
      .delete()
      .eq("id", data.id)
      .eq("owner_user_id", userId);

    if (error) {
      throw new Error(`Unable to delete patient: ${databaseError(error)}`);
    }

    return { success: true };
  });
