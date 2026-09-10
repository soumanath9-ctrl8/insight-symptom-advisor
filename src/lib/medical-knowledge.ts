/**
 * Medical knowledge base — NO patient data lives in this file.
 *
 * Everything here is general, source-agnostic triage guidance derived from
 * widely published emergency-warning-sign and safe-advice principles
 * (e.g. NHS "when to get help" guidance, WHO IMCI danger signs, standard
 * triage red-flag lists). It is NOT clinically validated software and must
 * never be described as such in the product.
 */

export const KNOWLEDGE_PROVENANCE =
  "General triage guidance based on widely published emergency warning-sign and self-care advice. Not clinically validated.";

/** Vital-sign reference bands used only as supporting signals. */
export const VITAL_RANGES = {
  tempC: { low: 35, normalMax: 37.5, high: 38, critical: 40 },
  spo2: { concerning: 94, critical: 92 },
  heartRate: { low: 50, high: 120, critical: 130 },
  respRate: { high: 24, critical: 30 },
  systolic: { low: 90, high: 180, criticalLow: 85, criticalHigh: 200 },
  diastolic: { high: 110 },
  glucoseMgDl: { low: 70, criticalLow: 54, high: 250, critical: 350 },
} as const;

/** Age bands that warrant extra caution. */
export function ageBand(age?: string | null): {
  band: "infant" | "child" | "adult" | "older" | "very-old" | "unknown";
  years: number | null;
} {
  if (!age) return { band: "unknown", years: null };
  const m = /\d{1,3}/.exec(age);
  if (!m) return { band: "unknown", years: null };
  const years = Number(m[0]);
  if (!Number.isFinite(years)) return { band: "unknown", years: null };
  if (years < 1) return { band: "infant", years };
  if (years < 12) return { band: "child", years };
  if (years < 65) return { band: "adult", years };
  if (years < 80) return { band: "older", years };
  return { band: "very-old", years };
}

export function ageGuidance(age?: string | null): string {
  const { band, years } = ageBand(age);
  switch (band) {
    case "infant":
      return `Patient is an infant (${years ?? "<1"} years). Infants deteriorate quickly and hide signs: lower the threshold for urgent review, treat poor feeding, unusual drowsiness, fever, breathing difficulty or reduced wet nappies as serious, and never suggest medicines beyond seeking advice.`;
    case "child":
      return `Patient is a child (${years} years). Use a lower threshold for medical review, mention dehydration and breathing-effort signs where relevant, avoid any adult dosing language, and never mention aspirin for a child.`;
    case "older":
    case "very-old":
      return `Patient is an older adult (${years} years). Serious illness may present atypically or without fever; falls, confusion, dehydration, medication interactions and cardiac causes deserve extra weight, and the threshold for advising professional review should be lower.`;
    case "adult":
      return `Patient is an adult (${years} years).`;
    default:
      return "Age is UNKNOWN — do not assume an age band, and say age would sharpen the assessment.";
  }
}

/** Pregnancy caution applies whenever pregnancy is stated or plausible and relevant. */
export function pregnancyGuidance(sex?: string | null, age?: string | null): string {
  const female = (sex ?? "").toLowerCase().startsWith("f") || (sex ?? "").includes("মহ");
  const { years } = ageBand(age);
  const childbearing = years === null ? female : female && years >= 12 && years <= 55;
  if (!childbearing) return "";
  return "Pregnancy status is UNKNOWN and must not be assumed either way. If pregnancy could change the safety of any suggestion (abdominal or pelvic pain, bleeding, severe headache, vomiting, any relief option), say so plainly, list pregnancy status under missing information, and keep all guidance pregnancy-safe.";
}

/** Hard guardrails handed to the model on every assessment call. */
export const SAFETY_GUARDRAILS = [
  "ABSOLUTE SAFETY RULES — these override every other instruction:",
  "1. NEVER diagnose. Never write 'you have', 'this is', 'diagnosis', 'confirmed' or any definitive claim. Only 'possible', 'may be consistent with'.",
  "2. NEVER name a specific medicine with a dose, strength, frequency, duration or route. Never mention antibiotics, steroids, opioids, sedatives or any prescription-only medicine as something to take. Relief guidance stays at CATEGORY level plus 'check with a pharmacist or doctor first'.",
  "3. NEVER tell the patient to stop, reduce, pause or change any medicine they are taking, and never say a medicine is unnecessary.",
  "4. NEVER invent patient data. No invented temperatures, blood pressures, oxygen levels, pulse, blood sugar, lab or scan results, exposures, travel, or history. Only use what was actually reported.",
  "5. Unknown is UNKNOWN. Do not assume the absence of fever, vital-sign abnormality, existing conditions, medicines, allergies or pregnancy. Absence of a statement is not a negative finding.",
  "6. NEVER give false reassurance. Do not say 'nothing to worry about', 'definitely not serious', 'no need to see a doctor' or 'it will pass on its own'. Always keep the door open to professional review and say what should prompt urgent help.",
  "7. Every result must state clearly that this is not a medical diagnosis and that a qualified clinician should be consulted.",
  "8. Weigh severity, how long symptoms have lasted, their trajectory (better / unchanged / worse) and how fast they are worsening. Rapid worsening raises urgency even when individual symptoms look mild.",
] as const;

/** Symptom-targeted history-taking templates (knowledge, not patient data). */
export const QUESTION_TEMPLATES = [
  "chest pain => character (pressure/tightness vs sharp), spread to arm, jaw or back, sweating or nausea, breathlessness, whether exertion brings it on;",
  "breathing difficulty => severity (at rest, walking, or speaking full sentences), fever, cough or sputum, wheeze, speed of worsening;",
  "headache => speed of onset, worst-ever intensity, neck stiffness, vision change, fever, weakness or numbness;",
  "abdominal pain => exact site, movement of pain, vomiting, bowel or urinary change, tenderness, last menstrual period where relevant;",
  "fever => measured temperature, rash, urinary symptoms, travel or mosquito exposure, hydration and urine output;",
  "dizziness/faintness => on standing or at rest, palpitations, blood loss, fluid intake, any blackout;",
  "any complaint => trajectory (better, same or worse), and whether it is worsening quickly.",
] as const;

/** Phrases that must never appear in output; used by the final validator. */
export const BANNED_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(you (definitely )?have|this is (definitely )?a?\s?(case of)?|diagnos(is|ed|e) (is|of)|confirmed (case|diagnosis))\b/i, label: "diagnosis-claim" },
  { pattern: /\b(nothing to worry about|no need to (see|consult) a doctor|definitely not serious|completely harmless|will (go away|pass) on its own|no cause for concern)\b/i, label: "false-reassurance" },
  { pattern: /\b(stop|discontinue|reduce|pause|skip)\s+(taking\s+)?(your\s+|the\s+|his\s+|her\s+|their\s+|any\s+|current\s+|regular\s+)*(medicine|medication|medications|tablets|drugs|pills|treatment|prescription)\b/i, label: "medication-stopping" },
  { pattern: /\b(antibiotic|amoxicillin|azithromycin|ciprofloxacin|doxycycline|prednisolone|dexamethasone|tramadol|codeine|morphine|diazepam|alprazolam|warfarin|insulin dose)\b/i, label: "unsafe-medication" },
  { pattern: /\b\d+\s?(mg|mcg|ml|g|iu)\b/i, label: "dosage" },
  { pattern: /\b(twice|thrice|three times|two times|once) (a|per) day\b/i, label: "dosing-schedule" },
];

export const DISCLAIMER = {
  en: "This is not a medical diagnosis. A qualified doctor or pharmacist should review your symptoms, and you should seek urgent care if anything worsens.",
  bn: "এটি কোনো চিকিৎসা-নির্ণয় নয়। আপনার উপসর্গ একজন যোগ্য চিকিৎসক বা ফার্মাসিস্টকে দেখানো উচিত, এবং অবস্থা খারাপ হলে অবিলম্বে চিকিৎসা নিন।",
} as const;

export const MEDICATION_CAVEAT = {
  en: "Consult a pharmacist or doctor before taking any medication.",
  bn: "যেকোনো ঔষধ নেওয়ার আগে ফার্মাসিস্ট বা চিকিৎসকের পরামর্শ নিন।",
} as const;
