import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";

import { detectRedFlags, redFlagUrgencyNotice } from "./red-flags";


const ContextInput = z.object({
  symptoms: z.string().min(3).max(2000),
  age: z.string().max(10).optional(),
  sex: z.string().max(20).optional(),
  duration: z.string().max(60).optional(),
  severity: z.number().min(1).max(10).optional(),
  language: z.enum(["en", "bn"]).default("en"),
});

const AnswerSchema = z.object({ question: z.string(), answer: z.string() });

const AssessmentInput = ContextInput.extend({
  answers: z.array(AnswerSchema).max(6).default([]),
});

const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        why: z.string().optional().default(""),
        options: z.array(z.string()).optional().default([]),
      }),
    )
    .min(2)
    .max(4),
});

const FactorSchema = z.object({
  factor: z.string(),
  weight: z.number(),
  effect: z.string(),
});

const ConditionSchema = z.object({
  name: z.string(),
  riskLevel: z.string(),
  likelihood: z.number(),
  explanation: z.string(),
  riskRationale: z.string(),
  matchingSymptoms: z.array(z.string()).default([]),
  contributingFactors: z.array(FactorSchema).default([]),
  nextSteps: z.string(),
  selfCare: z.array(z.string()).default([]),
  reliefCategories: z.array(z.string()).default([]),
});

const AssessmentSchema = z.object({
  summary: z.string(),
  urgency: z.string(),
  urgencyReason: z.string(),
  conditions: z.array(ConditionSchema),
  redFlags: z.array(z.string()).default([]),
  generalAdvice: z.string(),
});

type RawAssessment = z.infer<typeof AssessmentSchema>;

export type RiskLevel = "low" | "moderate" | "high";
export type Urgency = "self-care" | "see-a-doctor" | "urgent" | "emergency";
export type FollowUpQuestion = z.infer<typeof QuestionsSchema>["questions"][number];
export type Condition = Omit<RawAssessment["conditions"][number], "riskLevel"> & {
  riskLevel: RiskLevel;
};
export type Assessment = Omit<RawAssessment, "urgency" | "conditions"> & {
  urgency: Urgency;
  conditions: Condition[];
};

function normalizeRisk(value: string): RiskLevel {
  const v = value.toLowerCase();
  if (v.includes("high") || v.includes("severe") || v.includes("উচ্চ")) return "high";
  if (v.includes("mod") || v.includes("medium") || v.includes("মধ্যম")) return "moderate";
  return "low";
}

function normalizeUrgency(value: string): Urgency {
  const v = value.toLowerCase();
  if (v.includes("emerg")) return "emergency";
  if (v.includes("urgent")) return "urgent";
  if (v.includes("doctor") || v.includes("clinic") || v.includes("gp")) return "see-a-doctor";
  return "self-care";
}

function langLine(language: "en" | "bn") {
  return language === "bn"
    ? "Write every user-visible string in natural Bengali (বাংলা). JSON keys stay in English."
    : "Write every user-visible string in plain English.";
}

async function callModel(system: string, prompt: string) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured (missing LOVABLE_API_KEY)");
  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);
  const result = streamText({ model: gateway("google/gemini-3.7-flash"), system, prompt });
  const text = await result.text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The AI response could not be read. Please try again.");
  }
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

function contextBlock(data: z.infer<typeof ContextInput>) {
  return [
    `Initial symptom description: ${data.symptoms}`,
    data.age ? `Age: ${data.age}` : "",
    data.sex ? `Sex: ${data.sex}` : "",
    data.duration ? `Duration: ${data.duration}` : "",
    data.severity ? `Self-rated overall severity: ${data.severity}/10` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const getFollowUpQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ContextInput.parse(input))
  .handler(async ({ data }) => {
    const raw = await callModel(
      [
        "You are a careful clinician taking a patient history before any assessment.",
        "Ask 2-4 short, specific follow-up questions that would most change your thinking about THIS presentation.",
        "Each question must be clearly derived from the symptoms already reported (character, timing, associated features, red-flag screening, exposures, relevant history or medication).",
        "Never ask generic filler questions, never repeat information already given, never suggest a diagnosis, never alarm the patient.",
        "One question per item, plain language, answerable in a sentence. Where sensible, offer 2-4 short answer options.",
        langLine(data.language),
        "Reply with ONLY JSON (no markdown fences):",
        '{"questions":[{"question": string, "why": string, "options": string[]}]}',
      ].join(" "),
      contextBlock(data),
    );
    return QuestionsSchema.parse(raw).questions;
  });

export const assessSymptoms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AssessmentInput.parse(input))
  .handler(async ({ data }) => {
    // Deterministic safety pass BEFORE the AI reasoning.
    const redFlagCheck = detectRedFlags({
      symptoms: data.symptoms,
      answers: data.answers,
      age: data.age,
      duration: data.duration,
      language: data.language,
    });

    const raw = AssessmentSchema.parse(
      await callModel(
        [
          "You are a careful, calibrated clinical triage assistant. Accuracy and calm framing matter more than caution theatre.",
          "CALIBRATION RULES (critical):",
          "1. Score every condition on the FULL combination of symptoms, their duration, severity, the follow-up answers and patient context together.",
          "2. Never let a single non-specific symptom (e.g. a dry cough, a mild headache) push a serious condition high. In isolation such a symptom supports only common, benign explanations.",
          "3. Common conditions must dominate the ranking unless the specific combination genuinely points elsewhere. Likelihoods are integers 0-100 and need not sum to 100; keep serious conditions low (typically under 15) when only weak, non-specific evidence exists.",
          "4. riskLevel is 'high' only when the combination is genuinely dangerous or time-critical; 'moderate' when review is sensible; otherwise 'low'.",
          "5. urgency is 'emergency' or 'urgent' only for genuinely emergency-level combinations or clear red flags. Otherwise use 'self-care' or 'see-a-doctor'.",
          redFlagCheck.level
            ? `SAFETY OVERRIDE: a deterministic red-flag screen already classified this presentation as ${redFlagCheck.level}. You MUST treat it at least that seriously (critical => "emergency"), explain why plainly, and give emergency-oriented next steps. Detected: ${redFlagCheck.hits.map((h) => h.id).join(", ")}.`
            : "",
          "TONE: for low and moderate results be warm, calm and reassuring, explicitly noting what makes serious causes unlikely. Reserve urgent, directive language for true emergencies. Never claim a diagnosis.",
          "riskRationale: one or two sentences naming the specific COMBINATION of factors (symptoms + duration + context) that produced this risk level, and stating plainly that no single symptom drove it.",
          "contributingFactors: 2-5 items, weight 0-100 for how much that factor moved this score, effect = 'increases' | 'decreases' | 'neutral'.",
          "CARE GUIDANCE: for low/moderate riskLevel give general self-care measures (rest, fluids, monitoring) and reliefCategories as CATEGORIES ONLY, e.g. 'a fever reducer such as paracetamol, taken as per package instructions'. Never give a prescription, never give doses, schedules, or prescription-only drugs. For high riskLevel leave selfCare and reliefCategories as empty arrays and put emergency-oriented wording in nextSteps.",
          langLine(data.language),
          "Reply with ONLY JSON (no markdown fences) of this exact shape:",
          '{"summary": string, "urgency": "self-care"|"see-a-doctor"|"urgent"|"emergency", "urgencyReason": string,',
          '"conditions":[{"name": string, "riskLevel": "low"|"moderate"|"high", "likelihood": number, "explanation": string,',
          '"riskRationale": string, "matchingSymptoms": string[], "contributingFactors":[{"factor": string, "weight": number, "effect": string}],',
          '"nextSteps": string, "selfCare": string[], "reliefCategories": string[]}],',
          '"redFlags": string[], "generalAdvice": string}',
        ]
          .filter(Boolean)
          .join(" "),
        [
          contextBlock(data),
          data.answers.length
            ? "History answers:\n" +
              data.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n")
            : "",
          redFlagCheck.hits.length
            ? "Deterministic red flags detected:\n" +
              redFlagCheck.hits.map((h) => `- [${h.severity}] ${h.message}`).join("\n")
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      ),
    );

    let urgency = normalizeUrgency(raw.urgency);
    let urgencyReason = raw.urgencyReason;
    let redFlags = raw.redFlags;

    // The AI can never downgrade a deterministic red flag.
    if (redFlagCheck.level) {
      const floor: Urgency = redFlagCheck.level === "critical" ? "emergency" : "urgent";
      const order: Urgency[] = ["self-care", "see-a-doctor", "urgent", "emergency"];
      if (order.indexOf(urgency) < order.indexOf(floor)) urgency = floor;
      const notice = redFlagUrgencyNotice(redFlagCheck.level, data.language);
      urgencyReason = `${notice} ${urgencyReason}`.trim();
      const detected = redFlagCheck.hits.map((h) => h.message);
      redFlags = [...detected, ...redFlags.filter((f) => !detected.includes(f))];
    }

    const emergency = urgency === "emergency" || urgency === "urgent";

    return {
      ...raw,
      urgency,
      urgencyReason,
      redFlags,
      conditions: raw.conditions.map((c) => {
        const riskLevel =
          redFlagCheck.level === "critical" && c === raw.conditions[0]
            ? "high"
            : normalizeRisk(c.riskLevel);
        return {
          ...c,
          riskLevel,
          ...(riskLevel === "high" || emergency ? { selfCare: [], reliefCategories: [] } : {}),
        };
      }),
    } satisfies Assessment;
  });

