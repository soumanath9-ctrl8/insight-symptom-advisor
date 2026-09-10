/**
 * Final Safety Validator.
 *
 * The last deterministic gate before any assessment reaches the existing result
 * UI. It never changes how results are displayed — it only corrects unsafe or
 * unsupported content:
 *
 *  - red flags / emergency escalation are enforced (AI can never downgrade)
 *  - diagnosis claims, false reassurance and medication-stopping advice removed
 *  - specific drug names, doses and schedules stripped from care guidance
 *  - match-strength numbers damped when the history is thin or contradictory
 *  - missing / contradictory information surfaced instead of assumed
 *  - age-related and professional-care advice always present
 */

import {
  BANNED_PATTERNS,
  DISCLAIMER,
  MEDICATION_CAVEAT,
  ageBand,
} from "./medical-knowledge";
import type { RedFlagSeverity } from "./red-flags";

export type ValidatorUrgency = "self-care" | "see-a-doctor" | "urgent" | "emergency";

const ORDER: ValidatorUrgency[] = ["self-care", "see-a-doctor", "urgent", "emergency"];

type Condition = {
  name: string;
  riskLevel: "low" | "moderate" | "high";
  likelihood: number;
  explanation: string;
  riskRationale: string;
  matchingSymptoms: string[];
  contributingFactors: { factor: string; weight: number; effect: string }[];
  nextSteps: string;
  selfCare: string[];
  reliefCategories: string[];
};

type Validatable = {
  summary: string;
  urgency: ValidatorUrgency;
  urgencyReason: string;
  conditions: Condition[];
  redFlags: string[];
  generalAdvice: string;
  confidence: "low" | "moderate" | "high";
  confidenceNote: string;
  missingInfo: string[];
  nextStep?: string;
};

export type ValidationIssue = { label: string; where: string };

/**
 * Removes unsafe content from a free-text field. Whole sentences are dropped
 * rather than single phrases, so nothing mangled or half-true survives. When
 * everything is dropped, the caller's safe fallback is used instead.
 */
function scrubText(
  value: string,
  issues: ValidationIssue[],
  where: string,
  fallback = "",
): string {
  const sentences = value.split(/(?<=[.!?।])\s+/).filter((s) => s.trim().length > 0);
  const kept = sentences.filter((sentence) => {
    const bad = BANNED_PATTERNS.find(({ pattern }) => pattern.test(sentence));
    if (bad) {
      issues.push({ label: bad.label, where });
      return false;
    }
    return true;
  });
  const out = kept.join(" ").replace(/\s{2,}/g, " ").trim();
  return out.length > 0 ? out : fallback;
}

/** Drops any care-guidance item that names a drug, dose or schedule. */
function scrubGuidance(items: string[], issues: ValidationIssue[], where: string): string[] {
  return items.filter((item) => {
    const bad = BANNED_PATTERNS.find(({ pattern }) => pattern.test(item));
    if (bad) {
      issues.push({ label: bad.label, where });
      return false;
    }
    return true;
  });
}

export function validateAssessment(input: {
  assessment: Validatable;
  redFlagLevel: RedFlagSeverity | null;
  redFlagMessages: string[];
  language: "en" | "bn";
  age?: string | undefined;
  hasUnknownHistory: boolean;
  contradictionUnresolved: boolean;
  worseningOverride: boolean;
}): { assessment: Validatable; issues: ValidationIssue[] } {
  const { language: lang } = input;
  const issues: ValidationIssue[] = [];
  const a: Validatable = {
    ...input.assessment,
    conditions: input.assessment.conditions.map((c) => ({ ...c })),
  };

  // 1. Red-flag escalation always wins.
  if (input.redFlagLevel) {
    const floor: ValidatorUrgency = input.redFlagLevel === "critical" ? "emergency" : "urgent";
    if (ORDER.indexOf(a.urgency) < ORDER.indexOf(floor)) {
      issues.push({ label: "red-flag-escalation", where: "urgency" });
      a.urgency = floor;
    }
    const missing = input.redFlagMessages.filter((m) => !a.redFlags.includes(m));
    if (missing.length) a.redFlags = [...missing, ...a.redFlags];
  }

  // 2. Worsening on reassessment can never stay low risk.
  if (input.worseningOverride && ORDER.indexOf(a.urgency) < ORDER.indexOf("see-a-doctor")) {
    issues.push({ label: "worsening-escalation", where: "urgency" });
    a.urgency = "see-a-doctor";
  }

  const emergency = a.urgency === "emergency" || a.urgency === "urgent";

  // 3. Text scrubbing across every user-visible field.
  a.summary = scrubText(a.summary, issues, "summary");
  a.urgencyReason = scrubText(a.urgencyReason, issues, "urgencyReason");
  a.generalAdvice = scrubText(a.generalAdvice, issues, "generalAdvice");
  a.confidenceNote = scrubText(a.confidenceNote, issues, "confidenceNote");
  if (a.nextStep) a.nextStep = scrubText(a.nextStep, issues, "nextStep");

  a.conditions = a.conditions.map((c) => {
    const cleaned: Condition = {
      ...c,
      explanation: scrubText(c.explanation, issues, `condition:${c.name}`),
      riskRationale: scrubText(c.riskRationale, issues, `condition:${c.name}`),
      nextSteps: scrubText(c.nextSteps, issues, `condition:${c.name}`),
      selfCare: scrubGuidance(c.selfCare, issues, `selfCare:${c.name}`),
      reliefCategories: scrubGuidance(c.reliefCategories, issues, `relief:${c.name}`),
    };
    // 4. High risk / emergency: no medication or self-care suggestions at all.
    if (emergency || cleaned.riskLevel === "high") {
      cleaned.selfCare = [];
      cleaned.reliefCategories = [];
    }
    // 5. Unsupported probabilities: a match strength cannot exceed what the
    //    evidence supports, and can never read as a certainty.
    let cap = a.confidence === "high" ? 92 : a.confidence === "moderate" ? 78 : 60;
    if (input.contradictionUnresolved) cap = Math.min(cap, 55);
    if (input.hasUnknownHistory) cap = Math.min(cap, 85);
    cleaned.likelihood = Math.max(1, Math.min(cap, Math.round(cleaned.likelihood)));
    return cleaned;
  });

  a.conditions.sort((x, y) => y.likelihood - x.likelihood);

  // 6. Medication caveat wherever any relief category survived.
  const hasRelief = a.conditions.some((c) => c.reliefCategories.length > 0 || c.selfCare.length > 0);
  const caveat = MEDICATION_CAVEAT[lang];
  if (hasRelief && !a.generalAdvice.includes(caveat)) {
    a.generalAdvice = `${a.generalAdvice} ${caveat}`.trim();
  }

  // 7. Unknown history must be stated, never assumed absent.
  if (input.hasUnknownHistory) {
    const note =
      lang === "bn"
        ? "আপনার অন্য কোনো রোগ, চলমান ঔষধ বা অ্যালার্জি সম্পর্কে তথ্য নেই — এগুলো অজানা ধরে নেওয়া হয়েছে, নেই ধরে নেওয়া হয়নি।"
        : "Existing conditions, current medicines and allergies were not reported — these are treated as unknown, not as absent.";
    if (!a.missingInfo.some((m) => m.includes("allerg") || m.includes("অ্যালার্জি"))) {
      a.missingInfo = [...a.missingInfo, note];
    }
  }

  // 8. Contradictions must be visible, and confidence lowered.
  if (input.contradictionUnresolved) {
    a.confidence = "low";
    const note =
      lang === "bn"
        ? "আপনার দেওয়া কিছু উত্তর পরস্পরবিরোধী মনে হয়েছে, তাই নিশ্চয়তা কম রাখা হয়েছে।"
        : "Some of your answers appear to conflict, so confidence has been kept low.";
    if (!a.confidenceNote.includes(note)) a.confidenceNote = `${note} ${a.confidenceNote}`.trim();
  }

  // 9. Age-related caution, when age is known.
  const { band, years } = ageBand(input.age);
  if (band === "infant" || band === "child" || band === "older" || band === "very-old") {
    const line =
      band === "infant" || band === "child"
        ? lang === "bn"
          ? `রোগীর বয়স ${years} — শিশুদের ক্ষেত্রে অবস্থা দ্রুত বদলায়, তাই সন্দেহ হলেই চিকিৎসকের পরামর্শ নিন।`
          : `The patient is ${years} — children can change quickly, so seek medical advice sooner rather than later.`
        : lang === "bn"
          ? `রোগীর বয়স ${years} — বয়স্কদের ক্ষেত্রে গুরুতর সমস্যা মৃদু লক্ষণেও দেখা দিতে পারে, তাই সতর্কতা বেশি রাখা হয়েছে।`
          : `The patient is ${years} — serious illness can look mild in older adults, so extra caution has been applied.`;
    if (!a.generalAdvice.includes(line)) a.generalAdvice = `${a.generalAdvice} ${line}`.trim();
  }

  // 10. Professional care + no-diagnosis statement always present.
  const disclaimer = DISCLAIMER[lang];
  if (!a.generalAdvice.includes(disclaimer)) {
    a.generalAdvice = `${a.generalAdvice} ${disclaimer}`.trim();
  }

  // 11. A concrete next step is always available.
  if (!a.nextStep || a.nextStep.length < 4) {
    a.nextStep =
      a.urgency === "emergency"
        ? lang === "bn"
          ? "এখনই ১১২ বা ১০৮-এ কল করুন বা নিকটতম আপৎকালীন বিভাগে যান।"
          : "Call 112 or 108 now, or go to the nearest emergency department."
        : a.urgency === "urgent"
          ? lang === "bn"
            ? "আজই একজন চিকিৎসকের মূল্যায়ন নিন।"
            : "Get reviewed by a doctor today."
          : a.urgency === "see-a-doctor"
            ? lang === "bn"
              ? "কয়েক দিনের মধ্যে একজন চিকিৎসকের সঙ্গে দেখা করুন।"
              : "Arrange to see a doctor in the next few days."
            : lang === "bn"
              ? "বিশ্রাম নিন, পানি পান করুন এবং অবস্থা খারাপ হলে চিকিৎসকের পরামর্শ নিন।"
              : "Rest, keep hydrated, and seek advice if anything worsens.";
  }

  return { assessment: a, issues };
}
