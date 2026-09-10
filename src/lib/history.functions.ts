import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { HistoryEntry } from "./history";
import type { Urgency } from "./symptoms.functions";

type Row = {
  id: string;
  symptoms: string;
  severity: number;
  urgency: string;
  top_condition: string;
  summary: string;
  created_at: string;
};

function toEntry(row: Row): HistoryEntry {
  return {
    id: row.id,
    date: row.created_at,
    symptoms: row.symptoms,
    severity: row.severity,
    urgency: row.urgency as Urgency,
    topCondition: row.top_condition,
    summary: row.summary,
  };
}

export const listChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("symptom_checks")
      .select("id, symptoms, severity, urgency, top_condition, summary, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntry(r as Row));
  });

export const saveCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      symptoms: string;
      severity: number;
      urgency: string;
      topCondition: string;
      summary: string;
      /** Structured triage record — stored alongside the existing fields. */
      answers?: { question: string; answer: string }[];
      redFlag?: boolean;
      redFlags?: string[];
      categories?: string[];
      supportingFactors?: { factor: string; weight: number; effect: string }[];
      vitals?: Record<string, number>;
      uncertainty?: string;
      nextStep?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("symptom_checks").insert({
      user_id: context.userId,
      symptoms: data.symptoms,
      severity: Math.max(0, Math.min(100, Math.round(data.severity))),
      urgency: data.urgency,
      top_condition: data.topCondition,
      summary: data.summary,
      answers: data.answers ?? [],
      red_flag: data.redFlag ?? false,
      red_flags: data.redFlags ?? [],
      categories: data.categories ?? [],
      supporting_factors: data.supportingFactors ?? [],
      vitals: data.vitals ?? {},
      uncertainty: data.uncertainty ?? "",
      next_step: data.nextStep ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("symptom_checks")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, name, age, sex")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { id: context.userId, name: "", age: null, sex: null };
  });
