import { createServerFn } from "@tanstack/react-start";
import { streamText, Output } from "ai";
import { z } from "zod";

const AssessmentInput = z.object({
  symptoms: z.string().min(3).max(2000),
  age: z.string().max(10).optional(),
  sex: z.string().max(20).optional(),
  duration: z.string().max(60).optional(),
});

const ConditionSchema = z.object({
  name: z.string(),
  riskLevel: z.string(),
  likelihood: z.number(),
  explanation: z.string(),
  matchingSymptoms: z.array(z.string()),
  nextSteps: z.string(),
});

const AssessmentSchema = z.object({
  summary: z.string(),
  urgency: z.string(),
  urgencyReason: z.string(),
  conditions: z.array(ConditionSchema),
  redFlags: z.array(z.string()),
  generalAdvice: z.string(),
});

type RawAssessment = z.infer<typeof AssessmentSchema>;

export type RiskLevel = "low" | "moderate" | "high";
export type Urgency = "self-care" | "see-a-doctor" | "urgent" | "emergency";

export type Assessment = Omit<RawAssessment, "urgency" | "conditions"> & {
  urgency: Urgency;
  conditions: Array<Omit<RawAssessment["conditions"][number], "riskLevel"> & { riskLevel: RiskLevel }>;
};

function normalizeRisk(value: string): RiskLevel {
  const v = value.toLowerCase();
  if (v.includes("high") || v.includes("severe")) return "high";
  if (v.includes("mod") || v.includes("medium")) return "moderate";
  return "low";
}

function normalizeUrgency(value: string): Urgency {
  const v = value.toLowerCase();
  if (v.includes("emerg")) return "emergency";
  if (v.includes("urgent")) return "urgent";
  if (v.includes("doctor") || v.includes("clinic") || v.includes("gp")) return "see-a-doctor";
  return "self-care";
}

export const assessSymptoms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AssessmentInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured (missing LOVABLE_API_KEY)");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const result = streamText({
      model: gateway("google/gemini-3.7-flash"),
      system: [
        "You are a careful clinical triage assistant.",
        "Given symptoms, list 3-5 plausible conditions ranked by likelihood (0-100 integer, not necessarily summing to 100).",
        'riskLevel must be exactly one of: "low", "moderate", "high". urgency must be exactly one of: "self-care", "see-a-doctor", "urgent", "emergency".',
        "Explain in plain language WHY each condition fits or doesn't, referencing the reported symptoms.",
        "Be honest about uncertainty. Never claim a diagnosis. Flag emergency signs clearly.",
      ].join(" "),
      prompt: [
        `Symptoms: ${data.symptoms}`,
        data.age ? `Age: ${data.age}` : "",
        data.sex ? `Sex: ${data.sex}` : "",
        data.duration ? `Duration: ${data.duration}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      output: Output.object({ schema: AssessmentSchema }),
    });

    const raw = await result.output;
    return {
      ...raw,
      urgency: normalizeUrgency(raw.urgency),
      conditions: raw.conditions.map((c) => ({
        ...c,
        riskLevel: normalizeRisk(c.riskLevel),
      })),
    } satisfies Assessment;
  });
