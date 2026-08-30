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
  riskLevel: z.enum(["low", "moderate", "high"]),
  likelihood: z.number(),
  explanation: z.string(),
  matchingSymptoms: z.array(z.string()),
  nextSteps: z.string(),
});

const AssessmentSchema = z.object({
  summary: z.string(),
  urgency: z.enum(["self-care", "see-a-doctor", "urgent", "emergency"]),
  urgencyReason: z.string(),
  conditions: z.array(ConditionSchema),
  redFlags: z.array(z.string()),
  generalAdvice: z.string(),
});

export type Assessment = z.infer<typeof AssessmentSchema>;

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

    return (await result.output) as Assessment;
  });
