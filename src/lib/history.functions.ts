import { z } from "zod";

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { supabase } from "@/integrations/supabase/client";
import type { Assessment } from "@/lib/symptoms.functions";

const SubjectTypeSchema = z.enum(["self", "patient"]);

const SaveCheckSchema = z.object({
  symptoms: z.string().min(1).max(2000),
  severity: z.number().min(0).max(100),
  urgency: z.string().max(50),
  topCondition: z.string().max(200),
  summary: z.string().max(4000),

  answers: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),

  redFlag: z.boolean(),
  redFlags: z.array(z.string()),
  categories: z.array(z.string()),
  supportingFactors: z.array(z.string()),
  vitals: z.record(z.string(), z.unknown()),
  uncertainty: z.string().max(4000),
  nextStep: z.string().max(2000),

  subjectType: SubjectTypeSchema.default("self"),
  patientId: z.string().uuid().nullable().optional(),
});

async function requireAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in.");
  }

  return user;
}

/**
 * SELF HISTORY
 *
 * Only checks created by the logged-in user for themselves.
 *
 * Older records with NULL subject_type are also treated as self
 * so existing history is not lost.
 */
export const listChecks = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireAuthenticatedUser();

    const { data, error } = await supabase
      .from("symptom_checks")
      .select(
        `
          id,
          symptoms,
          severity,
          urgency,
          top_condition,
          summary,
          subject_type,
          patient_id,
          created_at
        `,
      )
      .eq("user_id", user.id)
      .or("subject_type.eq.self,subject_type.is.null")
      .is("patient_id", null)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      date: row.created_at,
      symptoms: row.symptoms,
      severity: row.severity ?? 0,
      urgency: row.urgency,
      topCondition: row.top_condition ?? "",
      summary: row.summary ?? "",
      subjectType: "self" as const,
      patientId: null,
    }));
  },
);

/**
 * PATIENT-SPECIFIC HISTORY
 *
 * IMPORTANT:
 * user_id AND patient_id are checked.
 *
 * Therefore a user cannot accidentally receive another
 * user's patient history.
 */
export const listPatientChecks = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      patientId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireAuthenticatedUser();

    const { data: rows, error } = await supabase
      .from("symptom_checks")
      .select(
        `
          id,
          symptoms,
          severity,
          urgency,
          top_condition,
          summary,
          subject_type,
          patient_id,
          created_at
        `,
      )
      .eq("user_id", user.id)
      .eq("patient_id", data.patientId)
      .eq("subject_type", "patient")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []).map((row) => ({
      id: row.id,
      date: row.created_at,
      symptoms: row.symptoms,
      severity: row.severity ?? 0,
      urgency: row.urgency,
      topCondition: row.top_condition ?? "",
      summary: row.summary ?? "",
      subjectType: "patient" as const,
      patientId: row.patient_id,
    }));
  });

/**
 * SAVE CHECK
 */
export const saveCheck = createServerFn({
  method: "POST",
})
  .inputValidator(SaveCheckSchema)
  .handler(async ({ data }) => {
    const user = await requireAuthenticatedUser();

    if (data.subjectType === "patient") {
      if (!data.patientId) {
        throw new Error(
          "A patient ID is required for a patient symptom check.",
        );
      }

      /**
       * Verify ownership before inserting.
       */
      const { data: patient, error: patientError } = await supabase
        .from("patient_profiles")
        .select("id")
        .eq("id", data.patientId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (patientError) {
        throw new Error(patientError.message);
      }

      if (!patient) {
        throw new Error(
          "Patient profile was not found or is not owned by this account.",
        );
      }
    }

    const { data: inserted, error } = await supabase
      .from("symptom_checks")
      .insert({
        user_id: user.id,

        symptoms: data.symptoms,
        severity: data.severity,
        urgency: data.urgency,
        top_condition: data.topCondition,
        summary: data.summary,

        answers: data.answers,
        red_flag: data.redFlag,
        red_flags: data.redFlags,
        categories: data.categories,
        supporting_factors: data.supportingFactors,
        vitals: data.vitals,
        uncertainty: data.uncertainty,
        next_step: data.nextStep,

        subject_type: data.subjectType,
        patient_id:
          data.subjectType === "patient"
            ? data.patientId ?? null
            : null,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      id: inserted.id,
    };
  });

/**
 * DELETE SELF CHECK
 */
export const deleteCheck = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      id: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireAuthenticatedUser();

    const { error } = await supabase
      .from("symptom_checks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", user.id)
      .or("subject_type.eq.self,subject_type.is.null")
      .is("patient_id", null);

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });

/**
 * DELETE A PATIENT CHECK
 */
export const deletePatientCheck = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      patientId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireAuthenticatedUser();

    const { error } = await supabase
      .from("symptom_checks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", user.id)
      .eq("patient_id", data.patientId)
      .eq("subject_type", "patient");

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });