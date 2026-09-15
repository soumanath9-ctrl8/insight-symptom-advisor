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
      .max(
        2000,
        "Current medications information is too long.",
      )
      .default(""),

    previousMajorIllnesses: YesNoSchema,

    previousMajorIllnessDetails: z
      .string()
      .trim()
      .max(
        2000,
        "Previous illness information is too long.",
      )
      .default(""),

    smokingStatus: YesNoSchema,

    familyHistory: z
      .string()
      .trim()
      .max(
        2000,
        "Family history information is too long.",
      )
      .default(""),

    pregnancyStatus: z
      .string()
      .trim()
      .max(
        100,
        "Pregnancy status is invalid.",
      )
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
        message:
          "Please enter the previous major illness.",
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

export type ProfileInput =
  z.infer<typeof ProfileSchema>;

/* -------------------------------------------------------------------------- */
/*                              Server Supabase                               */
/* -------------------------------------------------------------------------- */

/**
 * IMPORTANT:
 *
 * The browser Supabase client is NOT used in this file.
 *
 * This dynamically loads the generated server-only Supabase client.
 *
 * The service-role credential therefore remains server-side.
 *
 * Every operation below still performs explicit ownership checks.
 * Service-role access must NEVER be treated as an authorization mechanism.
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
  context:
    | {
        userId?: string;
      }
    | undefined,
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
  error:
    | {
        message?: string;
        code?: string;
        details?: string;
        hint?: string;
      }
    | null,
) {
  if (!error) {
    return "An unknown database error occurred.";
  }

  if (error.code === "PGRST116") {
    return "Profile was not found.";
  }

  return (
    error.message ||
    "Database operation failed."
  );
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
     * Only save the illness description when
     * the answer is Yes.
     *
     * The database column stores the actual
     * previous-illness description rather than
     * a separate Yes/No flag.
     */
    previous_major_illnesses:
      input.previousMajorIllnesses ===
      "Yes"
        ? input.previousMajorIllnessDetails.trim() ||
          null
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
        ? input.pregnancyStatus.trim() ||
          null
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
 *
 * This function does not expose Supabase credentials.
 */
export const checkSupabaseConfig =
  createServerFn({
    method: "GET",
  })
    .middleware([requireSupabaseAuth])
    .handler(
      async ({ context }) => {
        const userId = (
          context as {
            userId?: string;
          }
        )?.userId;

        return {
          configured: true,
          authenticated:
            Boolean(userId),
        };
      },
    );

/* -------------------------------------------------------------------------- */
/*                              Get Own Profile                               */
/* -------------------------------------------------------------------------- */

export const getProfile =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(
      async ({ context }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        /*
         * IMPORTANT:
         *
         * Self profile is addressed ONLY by the
         * authenticated user's own auth user ID.
         *
         * No arbitrary profile ID is accepted
         * from the browser.
         */
        const {
          data,
          error,
        } =
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
            `Unable to load profile: ${databaseError(
              error,
            )}`,
          );
        }

        return {
          configured: true,
          profile: data,
        };
      },
    );

/* -------------------------------------------------------------------------- */
/*                              Save Own Profile                              */
/* -------------------------------------------------------------------------- */

export const saveProfile =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      ProfileSchema,
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        const payload =
          toProfileRow(data);

        /*
         * Update the authenticated user's
         * own profile only.
         */
        const {
          data: updated,
          error: updateError,
        } =
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
            `Unable to save profile: ${databaseError(
              updateError,
            )}`,
          );
        }

        /*
         * If the row does not exist,
         * create it using the authenticated
         * user's ID.
         */
        if (!updated) {
          const {
            data: inserted,
            error: insertError,
          } =
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
              `Unable to create profile: ${databaseError(
                insertError,
              )}`,
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
      },
    );

/* -------------------------------------------------------------------------- */
/*                     UI-facing profile / patient helpers                    */
/* -------------------------------------------------------------------------- */

/**
 * Shape used by the existing profile editor UI.
 *
 * IMPORTANT:
 *
 * previousMajorIllnesses is kept as free text here
 * because the existing UI uses this value to hold
 * the actual illness description.
 *
 * This preserves compatibility with the current UI
 * while the validated ProfileSchema above remains
 * available for the stricter profile workflow.
 */
const UiProfileSchema =
  z.object({
    name: z
      .string()
      .trim()
      .max(100)
      .default(""),

    age: z
      .string()
      .trim()
      .max(10)
      .default(""),

    sex: z
      .string()
      .trim()
      .max(20)
      .default(""),

    allergies: z
      .string()
      .trim()
      .max(20)
      .default(""),

    existingConditions: z
      .string()
      .trim()
      .max(40)
      .default(""),

    currentMedications: z
      .string()
      .trim()
      .max(2000)
      .default(""),

    previousMajorIllnesses:
      z
        .string()
        .trim()
        .max(2000)
        .default(""),

    smokingStatus: z
      .string()
      .trim()
      .max(20)
      .default(""),

    familyHistory: z
      .string()
      .trim()
      .max(2000)
      .default(""),

    pregnancyStatus:
      z
        .string()
        .trim()
        .max(20)
        .default(""),
  });

type UiProfileInput =
  z.infer<
    typeof UiProfileSchema
  >;

/* -------------------------------------------------------------------------- */
/*                         UI profile normalization                           */
/* -------------------------------------------------------------------------- */

function normalizeUiSex(
  value: string,
): "" | "Male" | "Female" {
  const normalized =
    value.trim();

  if (
    normalized === "Male"
  ) {
    return "Male";
  }

  if (
    normalized === "Female"
  ) {
    return "Female";
  }

  return "";
}

function normalizeUiYesNo(
  value: string,
): "" | "Yes" | "No" {
  const normalized =
    value.trim();

  if (
    normalized === "Yes"
  ) {
    return "Yes";
  }

  if (
    normalized === "No"
  ) {
    return "No";
  }

  return "";
}

function normalizeExistingCondition(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    ExistingConditionSchema.safeParse(
      normalized,
    ).success
  ) {
    return normalized;
  }

  return normalized;
}

/* -------------------------------------------------------------------------- */
/*                       UI profile database mapping                          */
/* -------------------------------------------------------------------------- */

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

function toUiRow(
  input: UiProfileInput,
) {
  const sex =
    normalizeUiSex(
      input.sex,
    );

  const allergies =
    normalizeUiYesNo(
      input.allergies,
    );

  const smokingStatus =
    normalizeUiYesNo(
      input.smokingStatus,
    );

  const pregnancyStatus =
    sex === "Female"
      ? normalizeUiYesNo(
          input.pregnancyStatus,
        )
      : "";

  return {
    name:
      input.name.trim(),

    age:
      input.age.trim() ||
      null,

    sex:
      sex || null,

    allergies:
      allergies || null,

    existing_conditions:
      normalizeExistingCondition(
        input.existingConditions,
      ) || null,

    current_medications:
      input.currentMedications.trim() ||
      null,

    previous_major_illnesses:
      input.previousMajorIllnesses.trim() ||
      null,

    smoking_status:
      smokingStatus || null,

    family_history:
      input.familyHistory.trim() ||
      null,

    /*
     * Male users can never persist
     * pregnancy information through
     * this server function.
     */
    pregnancy_status:
      pregnancyStatus || null,

    updated_at:
      new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*                           UI profile conversion                            */
/* -------------------------------------------------------------------------- */

function fromUiRow(
  row:
    | Record<string, unknown>
    | null,
) {
  if (!row) {
    return null;
  }

  const text = (
    value: unknown,
  ) =>
    typeof value ===
    "string"
      ? value
      : value == null
        ? ""
        : String(value);

  const sex =
    normalizeUiSex(
      text(row["sex"]),
    );

  const allergies =
    normalizeUiYesNo(
      text(row["allergies"]),
    );

  const smokingStatus =
    normalizeUiYesNo(
      text(
        row[
          "smoking_status"
        ],
      ),
    );

  const pregnancyStatus =
    sex === "Female"
      ? normalizeUiYesNo(
          text(
            row[
              "pregnancy_status"
            ],
          ),
        )
      : "";

  return {
    id: text(row["id"]),

    name: text(
      row["name"],
    ),

    age: text(
      row["age"],
    ),

    sex,

    allergies,

    existingConditions:
      normalizeExistingCondition(
        text(
          row[
            "existing_conditions"
          ],
        ),
      ) as never,

    currentMedications:
      text(
        row[
          "current_medications"
        ],
      ),

    previousMajorIllnesses:
      text(
        row[
          "previous_major_illnesses"
        ],
      ),

    smokingStatus,

    familyHistory:
      text(
        row[
          "family_history"
        ],
      ),

    pregnancyStatus,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Get Own UI Profile                               */
/* -------------------------------------------------------------------------- */

export const getOwnProfile =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(
      async ({
        context,
      }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        /*
         * SECURITY:
         *
         * The authenticated user ID is the
         * ONLY profile ID used here.
         */
        const {
          data,
          error,
        } =
          await supabaseAdmin
            .from("profiles")
            .select(
              UI_COLUMNS,
            )
            .eq(
              "id",
              userId,
            )
            .maybeSingle();

        if (error) {
          throw new Error(
            `Unable to load profile: ${databaseError(
              error,
            )}`,
          );
        }

        return fromUiRow(
          data as unknown as
            | Record<
                string,
                unknown
              >
            | null,
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                         Update Own UI Profile                              */
/* -------------------------------------------------------------------------- */

export const updateOwnProfile =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      UiProfileSchema,
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        const payload =
          toUiRow(data);

        /*
         * SECURITY:
         *
         * The row can ONLY be updated
         * when its primary key equals the
         * authenticated user's ID.
         */
        const {
          data: updated,
          error,
        } =
          await supabaseAdmin
            .from("profiles")
            .update(payload)
            .eq(
              "id",
              userId,
            )
            .select(
              UI_COLUMNS,
            )
            .maybeSingle();

        if (error) {
          throw new Error(
            `Unable to save profile: ${databaseError(
              error,
            )}`,
          );
        }

        if (!updated) {
          const {
            data: inserted,
            error:
              insertError,
          } =
            await supabaseAdmin
              .from("profiles")
              .insert({
                id: userId,
                ...payload,
              })
              .select(
                UI_COLUMNS,
              )
              .single();

          if (insertError) {
            throw new Error(
              `Unable to create profile: ${databaseError(
                insertError,
              )}`,
            );
          }

          return fromUiRow(
            inserted as unknown as Record<
              string,
              unknown
            >,
          );
        }

        return fromUiRow(
          updated as unknown as Record<
            string,
            unknown
          >,
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                       Patient ownership helper                             */
/* -------------------------------------------------------------------------- */

/**
 * Verify that a patient belongs to the authenticated user.
 *
 * This helper is intentionally server-only.
 *
 * A patient ID by itself is NEVER treated as sufficient
 * authorization.
 */
async function getOwnedPatientRow(
  supabaseAdmin: {
    from: (
      table: string,
    ) => any;
  },
  userId: string,
  patientId: string,
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "patient_profiles",
      )
      .select("*")
      .eq(
        "id",
        patientId,
      )
      .eq(
        "owner_user_id",
        userId,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load patient: ${databaseError(
        error,
      )}`,
    );
  }

  if (!data) {
    throw new Error(
      "Patient profile was not found or you do not have access to it.",
    );
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/*                         List Patient Profiles                              */
/* -------------------------------------------------------------------------- */

export const listPatientProfiles =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(
      async ({
        context,
      }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        /*
         * SECURITY:
         *
         * Never return all patient profiles.
         *
         * Only profiles owned by the authenticated
         * user are returned.
         */
        const {
          data,
          error,
        } =
          await supabaseAdmin
            .from(
              "patient_profiles",
            )
            .select("*")
            .eq(
              "owner_user_id",
              userId,
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              },
            );

        if (error) {
          throw new Error(
            `Unable to load patient profiles: ${databaseError(
              error,
            )}`,
          );
        }

        return (
          data ?? []
        ).map(
          (row) => {
            const profile =
              fromUiRow(
                row as unknown as Record<
                  string,
                  unknown
                >,
              );

            if (!profile) {
              throw new Error(
                "Unable to read patient profile.",
              );
            }

            const record =
              row as unknown as Record<
                string,
                unknown
              >;

            return {
              ...profile,

              ownerUserId:
                String(
                  record[
                    "owner_user_id"
                  ] ?? "",
                ),

              createdAt:
                String(
                  record[
                    "created_at"
                  ] ?? "",
                ),

              updatedAt:
                String(
                  record[
                    "updated_at"
                  ] ?? "",
                ),
            };
          },
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                              Get Patient                                   */
/* -------------------------------------------------------------------------- */

export const getPatient =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        /*
         * SECURITY:
         *
         * Patient ID + authenticated owner ID
         * are both required.
         *
         * Therefore another user's patient
         * cannot be loaded by guessing a UUID.
         */
        const patient =
          await getOwnedPatientRow(
            supabaseAdmin,
            userId,
            data.id,
          );

        return fromUiRow(
          patient as unknown as Record<
            string,
            unknown
          >,
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                         Create Patient Profile                             */
/* -------------------------------------------------------------------------- */

export const createPatientProfile =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      UiProfileSchema,
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        /*
         * The browser supplies only profile
         * fields.
         *
         * owner_user_id is ALWAYS taken from
         * authenticated server context.
         */
        const {
          updated_at,
          ...row
        } =
          toUiRow(data);

        const {
          data: inserted,
          error,
        } =
          await supabaseAdmin
            .from(
              "patient_profiles",
            )
            .insert({
              owner_user_id:
                userId,

              ...row,
            })
            .select("*")
            .single();

        if (error) {
          throw new Error(
            `Unable to create patient: ${databaseError(
              error,
            )}`,
          );
        }

        return fromUiRow(
          inserted as unknown as Record<
            string,
            unknown
          >,
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                         Update Patient Profile                             */
/* -------------------------------------------------------------------------- */

export const updatePatientProfile =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      z.object({
        id: z.string().uuid(),

        profile:
          UiProfileSchema,
      }),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        /*
         * SECURITY:
         *
         * Before updating, both patient ID
         * and authenticated owner ID are used.
         */
        const payload =
          toUiRow(
            data.profile,
          );

        const {
          data: updated,
          error,
        } =
          await supabaseAdmin
            .from(
              "patient_profiles",
            )
            .update(payload)
            .eq(
              "id",
              data.id,
            )
            .eq(
              "owner_user_id",
              userId,
            )
            .select("*")
            .maybeSingle();

        if (error) {
          throw new Error(
            `Unable to update patient: ${databaseError(
              error,
            )}`,
          );
        }

        if (!updated) {
          throw new Error(
            "Patient profile was not found or you do not have access to it.",
          );
        }

        return fromUiRow(
          updated as unknown as Record<
            string,
            unknown
          >,
        );
      },
    );

/* -------------------------------------------------------------------------- */
/*                         Delete Patient Profile                             */
/* -------------------------------------------------------------------------- */

export const deletePatientProfile =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const userId =
          requireUserId(
            context,
          );

        const supabaseAdmin =
          await getSupabaseAdmin();

        /*
         * SECURITY:
         *
         * Delete is explicitly owner-scoped.
         *
         * symptom_checks.patient_id has the
         * database cascade configured, so deleting
         * the patient removes only that patient's
         * dependent checks.
         */
        const {
          error,
          count,
        } =
          await supabaseAdmin
            .from(
              "patient_profiles",
            )
            .delete({
              count: "exact",
            })
            .eq(
              "id",
              data.id,
            )
            .eq(
              "owner_user_id",
              userId,
            );

        if (error) {
          throw new Error(
            `Unable to delete patient: ${databaseError(
              error,
            )}`,
          );
        }

        /*
         * A successful DELETE with zero affected
         * rows means the patient did not belong to
         * this authenticated user (or was already gone).
         *
         * Do not silently claim that a patient was deleted.
         */
        if (
          count === 0
        ) {
          throw new Error(
            "Patient profile was not found or you do not have access to it.",
          );
        }

        return {
          success: true,
        };
      },
    );