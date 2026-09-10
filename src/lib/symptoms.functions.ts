import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectRedFlags, redFlagUrgencyNotice, type RedFlagResult } from "./red-flags";
import {
  KNOWLEDGE_PROVENANCE,
  QUESTION_TEMPLATES,
  SAFETY_GUARDRAILS,
  ageGuidance,
  pregnancyGuidance,
} from "./medical-knowledge";
import { validateAssessment } from "./safety-validator";
import { describeVitals, extractVitals, flagVitals, type Vitals } from "./vitals";



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
  confidence: z.string().default("moderate"),
  confidenceNote: z.string().default(""),
  missingInfo: z.array(z.string()).default([]),
  nextStep: z.string().default(""),
});

type RawAssessment = z.infer<typeof AssessmentSchema>;

export type RiskLevel = "low" | "moderate" | "high";
export type Confidence = "low" | "moderate" | "high";
export type Urgency = "self-care" | "see-a-doctor" | "urgent" | "emergency";
export type FollowUpQuestion = z.infer<typeof QuestionsSchema>["questions"][number];
export type Condition = Omit<RawAssessment["conditions"][number], "riskLevel"> & {
  riskLevel: RiskLevel;
};
export type Assessment = Omit<RawAssessment, "urgency" | "conditions" | "confidence"> & {
  urgency: Urgency;
  confidence: Confidence;
  conditions: Condition[];
};

function normalizeConfidence(value: string): Confidence {
  const v = value.toLowerCase();
  if (v.includes("high") || v.includes("উচ্চ")) return "high";
  if (v.includes("low") || v.includes("কম")) return "low";
  return "moderate";
}

type SafetyInput = {
  symptoms: string;
  answers?: { question: string; answer: string }[] | undefined;
  age?: string | undefined;
  duration?: string | undefined;
  language?: "en" | "bn" | undefined;
};

function allText(input: SafetyInput) {
  return [
    input.symptoms,
    input.duration ?? "",
    ...(input.answers ?? []).map((a) => `${a.question} ${a.answer}`),
  ].join("\n");
}

/**
 * Deterministic Red-Flag Rule Engine: symptom rules PLUS any vital signs the
 * patient actually reported. Runs before, and takes priority over, the AI.
 */
export function safetyScreen(input: SafetyInput): RedFlagResult & { vitals: Vitals } {
  const lang = input.language === "bn" ? "bn" : "en";
  const base = detectRedFlags(input);
  const vitals = extractVitals(allText(input));
  const hits = [
    ...base.hits,
    ...flagVitals(vitals).map((f, i) => ({
      id: `vital-${i}`,
      severity: f.severity,
      message: f.message[lang],
    })),
  ];
  const level = hits.some((h) => h.severity === "critical")
    ? ("critical" as const)
    : hits.length
      ? ("urgent" as const)
      : null;
  return { hits, level, vitals };
}

/**
 * Deterministic, AI-free emergency result. Used to short-circuit the flow the
 * moment a life-threatening warning sign appears, so the emergency screen
 * (112 / 108 + nearby hospitals) is shown before any normal prediction.
 */
export function immediateEmergencyAssessment(input: SafetyInput): Assessment | null {
  const check = safetyScreen(input);
  if (check.level !== "critical") return null;
  const lang = input.language === "bn" ? "bn" : "en";
  const notice = redFlagUrgencyNotice("critical", lang);
  return {
    summary:
      lang === "bn"
        ? "আপনার বর্ণনায় সম্ভাব্য জীবনসংশয়ী সতর্ক-সংকেত পাওয়া গেছে। কোনো সম্ভাব্য রোগের অনুমান না করে সরাসরি আপৎকালীন পরামর্শ দেখানো হচ্ছে।"
        : "Your description contains possible life-threatening warning signs, so emergency guidance is shown straight away instead of a condition prediction.",
    urgency: "emergency",
    urgencyReason: notice,
    conditions: [],
    redFlags: check.hits.map((h) => h.message),
    generalAdvice:
      lang === "bn"
        ? "এখনই ১১২ বা ১০৮-এ কল করুন, অথবা নিচের নিকটতম হাসপাতাল/ক্লিনিক দেখে সঙ্গে সঙ্গে রওনা দিন। রোগীকে একা রাখবেন না এবং নিজে থেকে কোনো ঔষধ দেবেন না।"
        : "Call 112 or 108 now, or head to one of the nearest hospitals or clinics listed below. Do not leave the person alone and do not give any medicine on your own.",
    confidence: "high",
    confidenceNote:
      lang === "bn"
        ? "এটি নিয়মভিত্তিক সুরক্ষা যাচাই — এআই অনুমান নয়।"
        : "This comes from a rule-based safety check, not an AI guess.",
    missingInfo: [],
    nextStep:
      lang === "bn"
        ? "এখনই ১১২ বা ১০৮-এ কল করুন বা নিকটতম আপৎকালীন বিভাগে যান।"
        : "Call 112 or 108 now, or go to the nearest emergency department.",
  };
}

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
        "Every question MUST target the problem actually reported. Worked examples:",
        "- chest pain => character (pressure/tightness vs sharp), whether it spreads to the arm, jaw or back, sweating or nausea, breathlessness, whether exertion brings it on;",
        "- breathing difficulty => how severe (at rest, on walking, talking in full sentences), fever, cough or sputum, wheeze, whether it is getting worse and how fast;",
        "- headache => speed of onset, worst-ever intensity, neck stiffness, vision changes, fever;",
        "- abdominal pain => exact site, movement of the pain, vomiting, bowel or urinary change, tenderness;",
        "- fever => measured temperature, rash, urinary symptoms, travel or mosquito exposure, hydration and urine output.",
        "Ask about age, sex, existing conditions, current medicines or allergies ONLY when that detail would genuinely change the assessment of THIS complaint (e.g. medicines for chest pain, pregnancy for abdominal pain, allergies before suggesting relief options). Never ask for them routinely, and never ask for details already provided in the context above.",
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

const WORSENING = [
  /\bworse|worsening|deteriorat|not improving|no better|getting bad/i,
  /খারাপ হচ্ছে|আরও খারাপ|উন্নতি হচ্ছে না/,
];

export const assessSymptoms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AssessmentInput.parse(input))
  .handler(async ({ data, context }) => {
    // 1. Deterministic Red-Flag Rule Engine (symptoms + reported vitals) —
    //    runs BEFORE any AI reasoning and always takes priority over it.
    const redFlagCheck = safetyScreen({
      symptoms: data.symptoms,
      answers: data.answers,
      age: data.age,
      duration: data.duration,
      language: data.language,
    });

    const text = [data.symptoms, ...data.answers.map((a) => a.answer)].join("\n");
    const trajectoryWorse = WORSENING.some((p) => p.test(text));

    // 2. Reassessment: compare against this patient's recent checks so that new
    //    warning signs or worsening symptoms cannot stay at a previous low risk.
    let previous: {
      created_at: string;
      urgency: string;
      severity: number;
      top_condition: string;
      symptoms: string;
    }[] = [];
    try {
      const { data: rows } = await context.supabase
        .from("symptom_checks")
        .select("created_at, urgency, severity, top_condition, symptoms")
        .order("created_at", { ascending: false })
        .limit(3);
      previous = (rows ?? []) as typeof previous;
    } catch {
      previous = [];
    }
    const previousWasLow = previous.some(
      (p) => p.urgency === "self-care" || p.urgency === "see-a-doctor",
    );
    const worseningOverride =
      (trajectoryWorse && previous.length > 0) ||
      (previousWasLow && redFlagCheck.level !== null);

    const vitalsLine = describeVitals(redFlagCheck.vitals);
    const pregnancy = pregnancyGuidance(data.sex, data.age);

    const raw = AssessmentSchema.parse(
      await callModel(
        [
          "You are a careful, calibrated clinical triage assistant. Accuracy and calm framing matter more than caution theatre.",
          ...SAFETY_GUARDRAILS,
          `KNOWLEDGE BASIS: ${KNOWLEDGE_PROVENANCE} Never claim this tool is clinically validated or approved.`,
          "CALIBRATION RULES (critical):",
          "1. Score every condition on the FULL combination of symptoms, their duration, severity, trajectory, the follow-up answers and patient context together.",
          "2. Never let a single non-specific symptom (e.g. a dry cough, a mild headache) push a serious condition high. In isolation such a symptom supports only common, benign explanations.",
          "3. 'likelihood' is NOT a validated diagnostic probability. It is a 0-100 SYMPTOM-MATCH STRENGTH: how well the reported findings fit that explanation. It must never be presented or worded as a medical probability, and the set need not sum to 100. Keep serious conditions low (typically under 15) when only weak, non-specific evidence exists.",
          "4. riskLevel is 'high' only when the combination is genuinely dangerous or time-critical; 'moderate' when review is sensible; otherwise 'low'.",
          "5. urgency is 'emergency' or 'urgent' only for genuinely emergency-level combinations or clear red flags. Otherwise use 'self-care' or 'see-a-doctor'.",
          "6. DIFFERENTIAL: never settle on one single answer. Give 3-5 plausible explanations, ranked, from broad categories to specific ones (e.g. 'viral respiratory infection', then 'bronchitis', then 'pneumonia'). Where the picture allows, include at least one NON-DISEASE explanation such as a medication side effect, a musculoskeletal cause, dehydration, poor sleep, or stress/anxiety-related symptoms.",
          `7. AGE AWARENESS: ${ageGuidance(data.age)}`,
          pregnancy ? `8. ${pregnancy}` : "",
          redFlagCheck.level
            ? `SAFETY OVERRIDE: a deterministic red-flag screen already classified this presentation as ${redFlagCheck.level}. You MUST treat it at least that seriously (critical => "emergency"), explain why plainly, and give emergency-oriented next steps. Detected: ${redFlagCheck.hits.map((h) => h.id).join(", ")}.`
            : "",
          worseningOverride
            ? "REASSESSMENT OVERRIDE: this patient has earlier checks on record and their symptoms are described as worsening or new warning signs have appeared. Do not return a lower urgency than 'see-a-doctor', and say plainly that the picture has changed since the last check."
            : "",
          vitalsLine
            ? "VITAL SIGNS: use the patient-reported measurements below as supporting signals only. Never invent, estimate or complete any measurement that was not reported, and never state that unreported vitals are normal."
            : "VITAL SIGNS: none were reported. Treat every vital sign as UNKNOWN, list the useful ones under missingInfo, and never assume they are normal.",
          "TONE: for low and moderate results be warm, calm and reassuring, explicitly noting what makes serious causes unlikely — but never give false reassurance and never say a doctor is unnecessary. Reserve urgent, directive language for true emergencies.",
          "riskRationale: one or two sentences naming the specific COMBINATION of factors (symptoms + duration + trajectory + context) that produced this risk level, and stating plainly that no single symptom drove it.",
          "contributingFactors: 3-5 items drawn ONLY from what the patient actually reported or from stated context (symptom, duration, trajectory, a reported measurement, age-related risk, an answer they gave). weight 0-100 for how much that factor moved this score, effect = 'increases' | 'decreases' | 'neutral'. Keep each factor a short observable finding, not a reasoning narrative, and never expose step-by-step internal deliberation.",
          "matchingSymptoms: quote only findings the patient actually reported. Never list a finding they did not mention.",
          "CARE GUIDANCE: for low/moderate riskLevel give general self-care measures (rest, fluids, monitoring) and reliefCategories as CATEGORIES ONLY, e.g. 'a fever reducer available over the counter, used as per the package instructions'. Never name a prescription-only medicine, never give a dose, strength, frequency or duration, never mention antibiotics as something to take, and never suggest changing or stopping an existing medicine. For high riskLevel leave selfCare and reliefCategories as empty arrays and put emergency-oriented wording in nextSteps.",
          "HONESTY ABOUT GAPS: never invent, assume or fill in details the patient did not give (no invented temperatures, blood pressures, oxygen levels, lab results, durations, exposures or history). Do NOT assume the absence of existing medical conditions, medicines, pregnancy or allergies — treat every one of these as UNKNOWN unless stated. List each important detail that is still missing in missingInfo, in the patient's own plain language. Set confidence to 'low' when key details are missing, answers were skipped or the picture is vague, 'moderate' when the history is partial, 'high' only when the reported combination is clear. confidenceNote: one short sentence saying why, and what would sharpen it. When confidence is low, say so plainly in summary, keep every match strength modest, and widen rather than narrow the list of explanations.",
          "nextStep: one short, concrete sentence naming the single most useful action now (self-care and monitoring, pharmacist advice, seeing a doctor within days, same-day review, or emergency care).",
          langLine(data.language),
          "Reply with ONLY JSON (no markdown fences) of this exact shape:",
          '{"summary": string, "urgency": "self-care"|"see-a-doctor"|"urgent"|"emergency", "urgencyReason": string,',
          '"conditions":[{"name": string, "riskLevel": "low"|"moderate"|"high", "likelihood": number, "explanation": string,',
          '"riskRationale": string, "matchingSymptoms": string[], "contributingFactors":[{"factor": string, "weight": number, "effect": string}],',
          '"nextSteps": string, "selfCare": string[], "reliefCategories": string[]}],',
          '"redFlags": string[], "generalAdvice": string, "confidence": "low"|"moderate"|"high", "confidenceNote": string, "missingInfo": string[], "nextStep": string}',
        ]
          .filter(Boolean)
          .join(" "),
        [
          contextBlock(data),
          vitalsLine,
          data.answers.length
            ? "History answers:\n" +
              data.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n")
            : "",
          redFlagCheck.hits.length
            ? "Deterministic red flags detected:\n" +
              redFlagCheck.hits.map((h) => `- [${h.severity}] ${h.message}`).join("\n")
            : "",
          previous.length
            ? "This patient's previous checks (most recent first), for comparison:\n" +
              previous
                .map(
                  (p) =>
                    `- ${p.created_at}: urgency ${p.urgency}, top match ${p.top_condition} (${p.severity}), symptoms: ${p.symptoms}`,
                )
                .join("\n")
            : "",
          trajectoryWorse ? "Trajectory: the patient describes the problem as worsening." : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      ),
    );

    const urgency = normalizeUrgency(raw.urgency);
    let urgencyReason = raw.urgencyReason;
    if (redFlagCheck.level) {
      urgencyReason = `${redFlagUrgencyNotice(redFlagCheck.level, data.language)} ${urgencyReason}`.trim();
    }

    const answeredCount = data.answers.filter((a) => a.answer.trim().length > 0).length;
    const mentionsHistory =
      /\b(diabet|hypertens|asthma|heart|kidney|cancer|pregnan|allerg|medicine|medication|tablet)\b/i.test(
        text,
      ) || /ডায়াবেটিস|উচ্চ রক্তচাপ|হাঁপানি|অ্যালার্জি|ঔষধ/.test(text);

    // 3. Final Safety Validator — the last gate before the existing result UI.
    const { assessment } = validateAssessment({
      assessment: {
        ...raw,
        urgency,
        urgencyReason,
        confidence: normalizeConfidence(raw.confidence),
        conditions: raw.conditions.map((c) => ({
          ...c,
          riskLevel: normalizeRisk(c.riskLevel),
        })),
      },
      redFlagLevel: redFlagCheck.level,
      redFlagMessages: redFlagCheck.hits.map((h) => h.message),
      language: data.language,
      age: data.age,
      hasUnknownHistory: !mentionsHistory,
      contradictionUnresolved: answeredCount === 0,
      worseningOverride,
    });

    return assessment as Assessment;
  });

const ClarifySchema = z.object({
  conflict: z.boolean().default(false),
  question: z.string().default(""),
  why: z.string().default(""),
  options: z.array(z.string()).default([]),
});

/**
 * Checks the collected answers for contradictions or a missing detail that
 * would otherwise have to be guessed. Returns one clarifying question, or null
 * when the history is internally consistent.
 */
export const clarifyAnswers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AssessmentInput.parse(input))
  .handler(async ({ data }): Promise<FollowUpQuestion | null> => {
    if (!data.answers.length) return null;
    const raw = await callModel(
      [
        "You are a clinician reviewing the history you just took, before making any assessment.",
        "Decide whether the patient's answers CONTRADICT each other or contradict their original description (e.g. 'no fever' but 'temperature 39', 'pain started today' but 'three weeks of pain', 'cannot breathe at all' but 'no breathing trouble'), or whether one single detail is missing that you would otherwise have to guess.",
        "If so, set conflict true and give exactly ONE short, polite clarifying question that resolves it, quoting both sides of the contradiction plainly. Offer 2-4 short answer options where sensible.",
        "Never guess or assume the answer yourself. If the history is consistent and workable, set conflict false and leave question empty.",
        langLine(data.language),
        "Reply with ONLY JSON (no markdown fences):",
        '{"conflict": boolean, "question": string, "why": string, "options": string[]}',
      ].join(" "),
      [
        contextBlock(data),
        "History answers:\n" +
          data.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n"),
      ].join("\n\n"),
    );
    const parsed = ClarifySchema.parse(raw);
    if (!parsed.conflict || parsed.question.trim().length < 5) return null;
    return { question: parsed.question, why: parsed.why, options: parsed.options };
  });


