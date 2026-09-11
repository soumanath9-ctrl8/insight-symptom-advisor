import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  detectRedFlags,
  redFlagUrgencyNotice,
  type RedFlagResult,
} from "./red-flags";
import {
  KNOWLEDGE_PROVENANCE,
  QUESTION_TEMPLATES,
  SAFETY_GUARDRAILS,
  ageGuidance,
  pregnancyGuidance,
} from "./medical-knowledge";
import { validateAssessment } from "./safety-validator";
import {
  describeVitals,
  extractVitals,
  flagVitals,
  type Vitals,
} from "./vitals";

/* -------------------------------------------------------------------------- */
/*                                    Schemas                                 */
/* -------------------------------------------------------------------------- */

const AnswerSchema = z.object({
  question: z.string().max(4000),
  answer: z.string().max(4000),
});

const ContextInput = z.object({
  /*
   * IMPORTANT:
   * This is the original/self-checker context.
   *
   * Do NOT put patientProfile here.
   */
  symptoms: z.string().min(3).max(2000),

  age: z.string().max(10).optional(),

  sex: z.string().max(20).optional(),

  duration: z.string().max(60).optional(),

  severity: z.number().min(1).max(10).optional(),

  language: z.enum(["en", "bn"]).default("en"),
});

const AssessmentInput = ContextInput.extend({
  answers: z.array(AnswerSchema).max(6).default([]),
});

/* -------------------------------------------------------------------------- */
/*                         Patient-specific input                              */
/* -------------------------------------------------------------------------- */

/**
 * Patient checker has its own input schema.
 *
 * The patient profile is NOT accepted directly from the browser.
 * Only patientId is accepted.
 *
 * The server verifies that patientId belongs to the logged-in user and then
 * reads the actual profile from patient_profiles.
 */
const PatientAssessmentInput = z.object({
  patientId: z.string().uuid(),

  symptoms: z.string().min(3).max(2000),

  duration: z.string().max(60).optional(),

  severity: z.number().min(1).max(10).optional(),

  language: z.enum(["en", "bn"]).default("en"),

  answers: z.array(AnswerSchema).max(6).default([]),
});

const PatientQuestionsInput = z.object({
  patientId: z.string().uuid(),

  symptoms: z.string().min(3).max(2000),

  duration: z.string().max(60).optional(),

  severity: z.number().min(1).max(10).optional(),

  language: z.enum(["en", "bn"]).default("en"),
});

/* -------------------------------------------------------------------------- */
/*                             Assessment schemas                              */
/* -------------------------------------------------------------------------- */

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

export type Urgency =
  | "self-care"
  | "see-a-doctor"
  | "urgent"
  | "emergency";

export type FollowUpQuestion =
  z.infer<typeof QuestionsSchema>["questions"][number];

export type Condition = Omit<
  RawAssessment["conditions"][number],
  "riskLevel"
> & {
  riskLevel: RiskLevel;
};

export type Assessment = Omit<
  RawAssessment,
  "urgency" | "conditions" | "confidence"
> & {
  urgency: Urgency;
  confidence: Confidence;
  conditions: Condition[];
};

/* -------------------------------------------------------------------------- */
/*                              Normalizers                                    */
/* -------------------------------------------------------------------------- */

function normalizeConfidence(value: string): Confidence {
  const v = value.toLowerCase();

  if (v.includes("high") || v.includes("উচ্চ")) {
    return "high";
  }

  if (v.includes("low") || v.includes("কম")) {
    return "low";
  }

  return "moderate";
}

function normalizeRisk(value: string): RiskLevel {
  const v = value.toLowerCase();

  if (
    v.includes("high") ||
    v.includes("severe") ||
    v.includes("উচ্চ")
  ) {
    return "high";
  }

  if (
    v.includes("mod") ||
    v.includes("medium") ||
    v.includes("মধ্যম")
  ) {
    return "moderate";
  }

  return "low";
}

function normalizeUrgency(value: string): Urgency {
  const v = value.toLowerCase();

  if (
    v.includes("emerg") ||
    v.includes("জরুরি অবস্থা") ||
    v.includes("আপৎকাল")
  ) {
    return "emergency";
  }

  if (
    v.includes("urgent") ||
    v.includes("জরুরি") ||
    v.includes("তাৎক্ষণিক")
  ) {
    return "urgent";
  }

  if (
    v.includes("doctor") ||
    v.includes("clinic") ||
    v.includes("gp") ||
    v.includes("ডাক্তার") ||
    v.includes("চিকিৎসক")
  ) {
    return "see-a-doctor";
  }

  return "self-care";
}

function langLine(language: "en" | "bn") {
  return language === "bn"
    ? "Write every user-visible string in natural Bengali (বাংলা). JSON keys stay in English."
    : "Write every user-visible string in plain English.";
}

/* -------------------------------------------------------------------------- */
/*                              Safety input                                   */
/* -------------------------------------------------------------------------- */

type SafetyInput = {
  symptoms: string;

  answers?: {
    question: string;
    answer: string;
  }[];

  age?: string;

  duration?: string;

  language?: "en" | "bn";
};

/**
 * IMPORTANT:
 *
 * Red-flag detection must receive patient-reported information, not the
 * question text itself.
 *
 * Therefore answers contain ONLY answer text here.
 */
function patientReportedText(input: SafetyInput) {
  return [
    input.symptoms,
    input.duration ?? "",
    ...(input.answers ?? []).map((a) => a.answer),
  ]
    .filter(Boolean)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/*                          Deterministic safety screen                        */
/* -------------------------------------------------------------------------- */

export function safetyScreen(
  input: SafetyInput,
): RedFlagResult & { vitals: Vitals } {
  const lang = input.language === "bn" ? "bn" : "en";

  /*
   * Red-flag detector receives the original symptom statement and answers,
   * but vital extraction is deliberately performed only on patient-reported
   * content.
   */
  const base = detectRedFlags({
    symptoms: input.symptoms,
    answers: (input.answers ?? []).map((a) => ({
      question: "",
      answer: a.answer,
    })),
    age: input.age,
    duration: input.duration,
    language: input.language,
  });

  const reportedText = patientReportedText(input);

  const vitals = extractVitals(reportedText);

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
    : hits.some((h) => h.severity === "urgent")
      ? ("urgent" as const)
      : null;

  return {
    hits,
    level,
    vitals,
  };
}

/* -------------------------------------------------------------------------- */
/*                         Immediate emergency result                          */
/* -------------------------------------------------------------------------- */

export function immediateEmergencyAssessment(
  input: SafetyInput,
): Assessment | null {
  const check = safetyScreen(input);

  if (check.level !== "critical") {
    return null;
  }

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
        ? "এখনই ১১২ বা ১০৮-এ কল করুন অথবা নিকটতম আপৎকালীন বিভাগে যান। রোগীকে একা রাখবেন না।"
        : "Call 112 or 108 now, or go to the nearest emergency department. Do not leave the person alone.",

    confidence: "high",

    confidenceNote:
      lang === "bn"
        ? "এটি নিয়মভিত্তিক সুরক্ষা যাচাই — এআই অনুমান নয়।"
        : "This comes from a rule-based safety check, not an AI guess.",

    missingInfo: [],

    nextStep:
      lang === "bn"
        ? "এখনই ১১২ বা ১০৮-এ কল করুন অথবা নিকটতম আপৎকালীন বিভাগে যান।"
        : "Call 112 or 108 now, or go to the nearest emergency department.",
  };
}

/* -------------------------------------------------------------------------- */
/*                              AI gateway                                     */
/* -------------------------------------------------------------------------- */

async function callModel(
  system: string,
  prompt: string,
) {
  const key = process.env["LOVABLE_API_KEY"];

  if (!key) {
    throw new Error(
      "AI is not configured (missing LOVABLE_API_KEY)",
    );
  }

  const {
    createLovableAiGatewayProvider,
  } = await import("./ai-gateway.server");

  const gateway =
    createLovableAiGatewayProvider(key);

  const result = streamText({
    model: gateway("google/gemini-3.7-flash"),
    system,
    prompt,
  });

  const text = await result.text;

  /*
   * The gateway may return surrounding whitespace or an occasional fenced
   * response. Extract only the JSON object.
   */
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new Error(
      "The AI response could not be read. Please try again.",
    );
  }

  try {
    return JSON.parse(
      text.slice(start, end + 1),
    ) as unknown;
  } catch {
    throw new Error(
      "The AI response was not valid JSON. Please try again.",
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                              Context blocks                                 */
/* -------------------------------------------------------------------------- */

function contextBlock(
  data: z.infer<typeof ContextInput>,
) {
  return [
    `Initial symptom description: ${data.symptoms}`,

    data.age
      ? `Age: ${data.age}`
      : "",

    data.sex
      ? `Sex: ${data.sex}`
      : "",

    data.duration
      ? `Duration: ${data.duration}`
      : "",

    data.severity
      ? `Self-rated overall severity: ${data.severity}/10`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/*                     Patient profile server-side retrieval                   */
/* -------------------------------------------------------------------------- */

type PatientProfileRow = {
  id: string;
  owner_user_id: string;
  name: string | null;
  age: string | null;
  sex: string | null;
  allergies: string | null;
  existing_conditions: string | null;
  current_medications: string | null;
  previous_major_illnesses: string | null;
  smoking_status: string | null;
  family_history: string | null;
  pregnancy_status: string | null;
};

async function getOwnedPatientProfile(
  supabase: {
    from: (table: string) => any;
  },
  userId: string,
  patientId: string,
): Promise<PatientProfileRow> {
  const { data, error } = await supabase
    .from("patient_profiles")
    .select(
      [
        "id",
        "owner_user_id",
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
      ].join(","),
    )
    .eq("id", patientId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load patient profile: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Patient profile was not found or you do not have access to it.",
    );
  }

  return data as PatientProfileRow;
}

/* -------------------------------------------------------------------------- */
/*                       Patient profile prompt context                        */
/* -------------------------------------------------------------------------- */

function buildPatientProfileContext(
  profile: PatientProfileRow,
) {
  const value = (
    input: string | null | undefined,
  ) =>
    input && input.trim()
      ? input.trim()
      : "Not provided";

  return [
    "PATIENT PROFILE CONTEXT:",
    `Patient name: ${value(profile.name)}`,
    `Age: ${value(profile.age)}`,
    `Sex: ${value(profile.sex)}`,
    `Allergies: ${value(profile.allergies)}`,
    `Existing conditions: ${value(profile.existing_conditions)}`,
    `Current medications: ${value(profile.current_medications)}`,
    `Previous major illnesses: ${value(profile.previous_major_illnesses)}`,
    `Smoking status: ${value(profile.smoking_status)}`,
    `Relevant family history: ${value(profile.family_history)}`,
    `Pregnancy status: ${
      profile.sex === "Female"
        ? value(profile.pregnancy_status)
        : "Not applicable"
    }`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/*                         Self follow-up questions                            */
/* -------------------------------------------------------------------------- */

export const getFollowUpQuestions = createServerFn({
  method: "POST",
})
  .inputValidator((input: unknown) =>
    ContextInput.parse(input),
  )
  .handler(async ({ data }) => {
    const raw = await callModel(
      [
        "You are a careful clinician taking a patient history before any assessment.",

        "Ask 2-4 short, specific follow-up questions that would most change your thinking about THIS presentation.",

        "Every question MUST target the problem actually reported.",

        "Worked examples:",
        ...QUESTION_TEMPLATES.map(
          (line) => `- ${line}`,
        ),

        `AGE CONTEXT: ${ageGuidance(data.age)}`,

        pregnancyGuidance(data.sex, data.age),

        "Ask about existing conditions, current medicines, allergies or pregnancy ONLY when that detail would genuinely change the assessment of THIS complaint.",

        "Never ask generic filler questions.",

        "Never repeat information already given.",

        "Never suggest a diagnosis.",

        "Never alarm the patient.",

        "One question per item, plain language, answerable in a sentence.",

        "Where sensible, offer 2-4 short answer options.",

        langLine(data.language),

        "Reply with ONLY JSON (no markdown fences):",

        '{"questions":[{"question": string, "why": string, "options": string[]}]}',
      ]
        .filter(Boolean)
        .join(" "),

      contextBlock(data),
    );

    return QuestionsSchema.parse(raw).questions;
  });

/* -------------------------------------------------------------------------- */
/*                       Patient follow-up questions                           */
/* -------------------------------------------------------------------------- */

export const getPatientFollowUpQuestions =
  createServerFn({
    method: "POST",
  })
    .middleware([requireSupabaseAuth])
    .inputValidator((input: unknown) =>
      PatientQuestionsInput.parse(input),
    )
    .handler(async ({ data, context }) => {
      const userId = context.userId;

      if (!userId) {
        throw new Error(
          "You must be signed in to check a patient's symptoms.",
        );
      }

      const profile =
        await getOwnedPatientProfile(
          context.supabase,
          userId,
          data.patientId,
        );

      const profileContext =
        buildPatientProfileContext(profile);

      const baseContext = [
        `Initial symptom description: ${data.symptoms}`,
        data.duration
          ? `Duration: ${data.duration}`
          : "",
        data.severity
          ? `Self-rated overall severity: ${data.severity}/10`
          : "",
        profileContext,
      ]
        .filter(Boolean)
        .join("\n\n");

      const raw = await callModel(
        [
          "You are a careful clinical triage assistant taking a history for a separate patient.",

          "The patient profile below is background context only. It is NOT a symptom list.",

          "Existing conditions, previous illnesses, medications, allergies, smoking history and family history must NEVER be treated as current symptoms unless the current symptom description explicitly reports them.",

          "Ask 2-4 short, specific follow-up questions that would most change the assessment of the CURRENT complaint.",

          "Use the patient's age, sex and profile only when clinically relevant to the current complaint.",

          "Do not ask questions whose answer is already present in the profile or current symptom description.",

          "Never suggest a diagnosis.",

          "Never alarm the patient unnecessarily.",

          "Where a measurement would materially change triage, ask for that measurement plainly.",

          `AGE CONTEXT: ${ageGuidance(profile.age ?? undefined)}`,

          pregnancyGuidance(
            profile.sex ?? undefined,
            profile.age ?? undefined,
          ),

          langLine(data.language),

          "Reply with ONLY JSON (no markdown fences):",

          '{"questions":[{"question": string, "why": string, "options": string[]}]}',
        ]
          .filter(Boolean)
          .join(" "),

        baseContext,
      );

      return QuestionsSchema.parse(raw).questions;
    });

/* -------------------------------------------------------------------------- */
/*                              Worsening logic                                */
/* -------------------------------------------------------------------------- */

const WORSENING = [
  /\bworse\b|\bworsening\b|\bdeteriorat/i,
  /\bnot improving\b|\bno better\b|\bgetting bad\b/i,
  /খারাপ হচ্ছে|আরও খারাপ|উন্নতি হচ্ছে না|অবনতি হচ্ছে/,
];

/**
 * Only detect worsening from patient-reported content.
 */
function isWorsening(
  symptoms: string,
  answers: { question: string; answer: string }[],
) {
  const text = [
    symptoms,
    ...answers.map((a) => a.answer),
  ].join("\n");

  return WORSENING.some((pattern) =>
    pattern.test(text),
  );
}

/* -------------------------------------------------------------------------- */
/*                          Shared assessment prompt                            */
/* -------------------------------------------------------------------------- */

function assessmentSystemPrompt(args: {
  language: "en" | "bn";
  age?: string;
  sex?: string;
  pregnancy?: string;
  redFlagCheck: ReturnType<typeof safetyScreen>;
  worseningOverride: boolean;
  profileContext?: string;
}) {
  const {
    language,
    age,
    sex,
    pregnancy,
    redFlagCheck,
    worseningOverride,
    profileContext,
  } = args;

  return [
    "You are a careful, calibrated clinical triage assistant.",

    "Accuracy and calm framing matter more than caution theatre.",

    ...SAFETY_GUARDRAILS,

    `KNOWLEDGE BASIS: ${KNOWLEDGE_PROVENANCE} Never claim this tool is clinically validated or approved.`,

    "CALIBRATION RULES:",

    "1. Score every condition using the FULL combination of current symptoms, duration, severity, trajectory, follow-up answers and relevant context.",

    "2. Never let a single non-specific symptom push a serious condition high.",

    "3. 'likelihood' is NOT a validated diagnostic probability. It is a 0-100 SYMPTOM-MATCH STRENGTH showing how well the reported findings fit that explanation. It must never be described as a medical probability and the scores do not need to sum to 100.",

    "4. Keep serious explanations low when evidence is weak or non-specific.",

    "5. riskLevel is 'high' only when the combination is genuinely dangerous or time-critical; 'moderate' when medical review is sensible; otherwise 'low'.",

    "6. urgency 'emergency' and 'urgent' must be reserved for genuinely time-sensitive situations. Do NOT convert every concerning symptom into an emergency.",

    "7. DIFFERENTIAL: provide 3-5 plausible explanations where enough information exists. Do not settle on one definitive diagnosis.",

    "8. Where appropriate, include a non-disease explanation such as medication effect, musculoskeletal cause, dehydration, poor sleep or stress-related symptoms.",

    `AGE AWARENESS: ${ageGuidance(age)}`,

    pregnancy
      ? `PREGNANCY CONTEXT: ${pregnancy}`
      : "",

    profileContext
      ? [
          "