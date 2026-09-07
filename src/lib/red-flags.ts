/**
 * Deterministic Red-Flag Detection Engine.
 *
 * Runs BEFORE / alongside the LLM assessment. Pure, rule-based, no AI.
 * A "critical" hit forces an emergency assessment; an "urgent" hit forces at
 * least urgent. The LLM can never downgrade these.
 */

export type RedFlagSeverity = "critical" | "urgent";

export type RedFlagRule = {
  id: string;
  severity: RedFlagSeverity;
  /** Patterns matched against the combined symptom + answer text (lowercased). */
  patterns: RegExp[];
  /** Optional negation guards — if any matches, the rule does not fire. */
  exclude?: RegExp[];
  message: { en: string; bn: string };
};

const r = (source: string) => new RegExp(source, "i");

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: "breathing",
    severity: "critical",
    patterns: [
      r("(severe|extreme|can'?t|cannot|unable to|struggling to|gasping|difficulty)\\s*(catch my breath|breath|breathe|breathing)"),
      r("shortness of breath at rest|breathless(ness)? at rest|suffocat"),
      r("শ্বাস (নিতে|নিতে খুব) (কষ্ট|সমস্যা)|দম বন্ধ|শ্বাসকষ্ট"),
    ],
    exclude: [r("mild (shortness of breath|breathless)|slight(ly)? breathless")],
    message: {
      en: "Severe difficulty breathing — treat as a medical emergency.",
      bn: "শ্বাস নিতে তীব্র কষ্ট — এটি চিকিৎসা-সংক্রান্ত আপৎকাল হিসেবে ধরুন।",
    },
  },
  {
    id: "chest-pain",
    severity: "critical",
    patterns: [
      r("(chest|left arm|jaw)\\s*(pain|pressure|tightness|heaviness|crushing)"),
      r("(crushing|squeezing|severe) (pain|pressure) in (my )?chest"),
      r("বুকে (তীব্র )?(ব্যথা|চাপ|ভার)"),
    ],
    exclude: [r("mild chest (discomfort|ache)|chest pain only when (coughing|sneezing)")],
    message: {
      en: "Chest pain, pressure or tightness — possible cardiac emergency.",
      bn: "বুকে ব্যথা, চাপ বা ভারী অনুভূতি — সম্ভাব্য হার্টের আপৎকাল।",
    },
  },
  {
    id: "syncope",
    severity: "critical",
    patterns: [
      r("faint(ed|ing)?|passed out|pass out|loss of consciousness|unconscious|blackout|blacked out|collapsed"),
      r("অজ্ঞান|জ্ঞান হারা|মূর্ছা"),
    ],
    exclude: [r("felt (a bit )?(light[- ]?headed|dizzy) but did ?n'?t faint")],
    message: {
      en: "Fainting or loss of consciousness — needs emergency assessment.",
      bn: "অজ্ঞান হওয়া বা জ্ঞান হারানো — অবিলম্বে আপৎকালীন মূল্যায়ন দরকার।",
    },
  },
  {
    id: "cyanosis",
    severity: "critical",
    patterns: [
      r("(blue|bluish|grey|gray|purple)\\s*(lips|face|skin|fingers|nails|tongue)"),
      r("ঠোঁট নীল|মুখ নীল|নীলচে"),
    ],
    message: {
      en: "Blue or grey lips, face or skin — sign of dangerously low oxygen.",
      bn: "ঠোঁট, মুখ বা ত্বক নীলচে/ধূসর — অক্সিজেন বিপজ্জনকভাবে কম।",
    },
  },
  {
    id: "confusion",
    severity: "critical",
    patterns: [
      r("(severe|sudden|very)\\s*(confus|disorient|drowsy|unrespons)"),
      r("not making sense|can'?t (wake|rouse)|hard to wake|unresponsive"),
      r("প্রচণ্ড বিভ্রান্ত|অস্বাভাবিক আচরণ|সাড়া দিচ্ছে না"),
    ],
    message: {
      en: "Sudden or severe confusion / reduced responsiveness.",
      bn: "হঠাৎ বা তীব্র বিভ্রান্তি / সাড়া কমে যাওয়া।",
    },
  },
  {
    id: "stroke",
    severity: "critical",
    patterns: [
      r("(sudden|one[- ]sided|one side)\\s*(weakness|numbness|paralysis)"),
      r("face droop|facial droop|slurred speech|can'?t speak|trouble speaking|vision loss in one eye|worst headache of my life|thunderclap headache"),
      r("মুখ বেঁকে|কথা জড়িয়ে|শরীরের এক দিক অবশ|পক্ষাঘাত"),
    ],
    message: {
      en: "Possible stroke signs (weakness, numbness, drooping face, slurred speech) — time-critical.",
      bn: "স্ট্রোকের সম্ভাব্য লক্ষণ (দুর্বলতা, অবশভাব, মুখ বেঁকে যাওয়া, কথা জড়ানো) — সময় অত্যন্ত জরুরি।",
    },
  },
  {
    id: "bleeding",
    severity: "critical",
    patterns: [
      r("(uncontrolled|heavy|won'?t stop|wont stop|profuse|severe)\\s*bleed"),
      r("vomiting blood|coughing (up )?blood|blood in (my )?(vomit|stool)|black tarry stool"),
      r("রক্তক্ষরণ (বন্ধ হচ্ছে না|প্রচুর)|রক্ত বমি|রক্ত কাশি"),
    ],
    message: {
      en: "Uncontrolled or heavy bleeding, or blood in vomit/stool.",
      bn: "অনিয়ন্ত্রিত বা প্রচুর রক্তক্ষরণ, অথবা বমি/মলে রক্ত।",
    },
  },
  {
    id: "anaphylaxis",
    severity: "critical",
    patterns: [
      r("anaphyla|throat (closing|swelling|tightness)|swollen (tongue|lips|throat|face)|hives (and|with) (swelling|breathing)"),
      r("গলা ফুলে|জিভ ফুলে|তীব্র অ্যালার্জি"),
    ],
    message: {
      en: "Signs of a severe allergic reaction (swelling of face, tongue or throat).",
      bn: "তীব্র অ্যালার্জির লক্ষণ (মুখ, জিভ বা গলা ফুলে যাওয়া)।",
    },
  },
  {
    id: "seizure",
    severity: "critical",
    patterns: [r("seizure|convuls|fit(s)? with (shaking|jerking)|epileptic attack"), r("খিঁচুনি")],
    message: {
      en: "Seizure or convulsions.",
      bn: "খিঁচুনি বা কনভালশন।",
    },
  },
  {
    id: "dehydration",
    severity: "urgent",
    patterns: [
      r("(severe|badly)\\s*dehydrat"),
      r("no urine|not passing urine|ha(s|ve)n'?t urinated|sunken eyes|cannot keep (any )?(fluids|water) down|keep vomiting everything"),
      r("তীব্র পানিশূন্যতা|প্রস্রাব হচ্ছে না|পানি খেলেই বমি"),
    ],
    message: {
      en: "Signs of severe dehydration (no urine, unable to keep fluids down).",
      bn: "তীব্র পানিশূন্যতার লক্ষণ (প্রস্রাব না হওয়া, পানি ধরে রাখতে না পারা)।",
    },
  },
  {
    id: "rapid-worsening",
    severity: "urgent",
    patterns: [
      r("(rapidly|quickly|fast)\\s*(worse|worsening|deteriorat)"),
      r("getting (much )?worse (by the hour|every hour|very fast)|worst pain (i'?ve )?ever|unbearable pain|10\\/10 pain"),
      r("দ্রুত খারাপ হচ্ছে|অসহনীয় ব্যথা"),
    ],
    message: {
      en: "Very severe or rapidly worsening symptoms.",
      bn: "খুব তীব্র বা দ্রুত অবনতিশীল উপসর্গ।",
    },
  },
  {
    id: "pregnancy",
    severity: "critical",
    patterns: [
      r("pregnan(t|cy).{0,60}(bleed|severe (pain|headache)|no fetal movement|reduced movement|fluid leak|blurred vision|fits)"),
      r("(bleed|severe (pain|headache)).{0,60}pregnan"),
      r("গর্ভাবস্থা.{0,40}(রক্ত|তীব্র ব্যথা)|গর্ভবতী.{0,40}রক্ত"),
    ],
    message: {
      en: "Pregnancy with bleeding, severe pain, severe headache or reduced fetal movement.",
      bn: "গর্ভাবস্থায় রক্তক্ষরণ, তীব্র ব্যথা, তীব্র মাথাব্যথা বা শিশুর নড়াচড়া কমে যাওয়া।",
    },
  },
  {
    id: "high-fever-stiff-neck",
    severity: "critical",
    patterns: [
      r("(stiff neck|neck stiffness).{0,60}(fever|light|rash)|fever.{0,60}stiff neck"),
      r("non[- ]?blanching rash|purple (spots|rash)"),
      r("ঘাড় শক্ত.{0,40}জ্বর|জ্বর.{0,40}ঘাড় শক্ত"),
    ],
    message: {
      en: "Fever with a stiff neck or a non-fading rash — possible meningitis.",
      bn: "জ্বরের সঙ্গে ঘাড় শক্ত বা না-মিলিয়ে যাওয়া র‍্যাশ — সম্ভাব্য মেনিনজাইটিস।",
    },
  },
];

export type RedFlagHit = {
  id: string;
  severity: RedFlagSeverity;
  message: string;
};

export type RedFlagResult = {
  hits: RedFlagHit[];
  /** Highest severity found, or null when nothing fired. */
  level: RedFlagSeverity | null;
};

function parseAge(age?: string): number | null {
  if (!age) return null;
  const match = /\d{1,3}/.exec(age);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

const HIGH_RISK_AGE_TRIGGERS = [
  r("fever|জ্বর"),
  r("breath|শ্বাস"),
  r("chest|বুক"),
  r("vomit|বমি"),
  r("diarr|পাতলা পায়খানা"),
  r("dehydrat|পানিশূন্য"),
  r("lethargic|drowsy|not feeding|ঝিমুনি"),
];

/**
 * Deterministic red-flag evaluation over the free text the patient supplied
 * plus their follow-up answers.
 */
export function detectRedFlags(input: {
  symptoms: string;
  answers?: { question: string; answer: string }[];
  age?: string;
  duration?: string;
  language?: "en" | "bn";
}): RedFlagResult {
  const lang = input.language === "bn" ? "bn" : "en";
  const text = [
    input.symptoms,
    input.duration ?? "",
    ...(input.answers ?? []).map((a) => `${a.question} ${a.answer}`),
  ]
    .join("\n")
    .toLowerCase();

  const hits: RedFlagHit[] = [];

  for (const rule of RED_FLAG_RULES) {
    if (rule.exclude?.some((p) => p.test(text))) continue;
    if (rule.patterns.some((p) => p.test(text))) {
      hits.push({ id: rule.id, severity: rule.severity, message: rule.message[lang] });
    }
  }

  // Serious symptoms in high-risk age groups (infants and the very elderly).
  const age = parseAge(input.age);
  if (age !== null && (age <= 2 || age >= 75) && HIGH_RISK_AGE_TRIGGERS.some((p) => p.test(text))) {
    hits.push({
      id: "high-risk-age",
      severity: "urgent",
      message:
        lang === "bn"
          ? "উচ্চ-ঝুঁকির বয়সসীমায় (শিশু বা প্রবীণ) এই ধরনের উপসর্গ দ্রুত চিকিৎসকের মূল্যায়ন দরকার।"
          : "These symptoms in a high-risk age group (very young or elderly) need prompt medical review.",
    });
  }

  const level = hits.some((h) => h.severity === "critical")
    ? "critical"
    : hits.length > 0
      ? "urgent"
      : null;

  return { hits, level };
}

export function redFlagUrgencyNotice(level: RedFlagSeverity, lang: "en" | "bn") {
  if (level === "critical") {
    return lang === "bn"
      ? "সুরক্ষা যাচাইয়ে সম্ভাব্য জীবনসংশয়ী সতর্ক-সংকেত পাওয়া গেছে, তাই এটি আপৎকাল হিসেবে চিহ্নিত করা হয়েছে। এখনই ১১২ বা ১০৮-এ ফোন করুন বা নিকটতম আপৎকালীন বিভাগে যান।"
      : "A safety check found possible life-threatening warning signs, so this has been marked as an emergency. Call 112 or 108 now, or go to the nearest emergency department.";
  }
  return lang === "bn"
    ? "সুরক্ষা যাচাইয়ে এমন লক্ষণ পাওয়া গেছে যার জন্য আজই চিকিৎসকের মূল্যায়ন দরকার।"
    : "A safety check found signs that need same-day medical review.";
}
