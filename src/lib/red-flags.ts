import type { Vitals } from "./vitals";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

export type RedFlagSeverity =
  | "urgent"
  | "critical";

export type RedFlagHit = {
  id: string;
  severity: RedFlagSeverity;
  message: string;
};

export type RedFlagResult = {
  hits: RedFlagHit[];
  level:
    | "urgent"
    | "critical"
    | null;
};

/* -------------------------------------------------------------------------- */
/*                              Input types                                   */
/* -------------------------------------------------------------------------- */

type RedFlagAnswer = {
  /*
   * question is intentionally ignored.
   *
   * The detector must never treat the question itself as a symptom.
   */
  question?: string;

  answer: string;
};

type DetectRedFlagsInput = {
  symptoms: string;

  answers?: RedFlagAnswer[];

  age?: string;

  duration?: string;

  language?: "en" | "bn";
};

/* -------------------------------------------------------------------------- */
/*                         Language helpers                                   */
/* -------------------------------------------------------------------------- */

function message(
  language: "en" | "bn",
  en: string,
  bn: string,
) {
  return language === "bn" ? bn : en;
}

/* -------------------------------------------------------------------------- */
/*                         Text normalization                                 */
/* -------------------------------------------------------------------------- */

function normalizeText(
  value: string,
) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[“”‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split patient-reported text into reasonably independent clauses.
 *
 * This is important for negation handling:
 *
 *   "No chest pain but I am breathless"
 *
 * should not turn the whole sentence into a positive chest-pain finding.
 */
function splitClauses(
  text: string,
) {
  return text
    .split(
      /[\n.!?;।]+|\bbut\b|\bhowever\b|\balthough\b|\bwhile\b|কিন্তু|তবে|যদিও/gi,
    )
    .map((part) =>
      normalizeText(part),
    )
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/*                              Negation                                      */
/* -------------------------------------------------------------------------- */

const NEGATION_PATTERNS = [
  /\bno\b/i,
  /\bnot\b/i,
  /\bnever\b/i,
  /\bwithout\b/i,
  /\bdenies?\b/i,
  /\bdenied\b/i,
  /\bnegative for\b/i,
  /\bnone\b/i,
  /\bdoesn't have\b/i,
  /\bdoes not have\b/i,
  /\bdon't have\b/i,
  /\bdo not have\b/i,
  /\bisn't having\b/i,
  /\bis not having\b/i,
  /\bwasn't having\b/i,
  /\bwas not having\b/i,

  /নেই/i,
  /নয়/i,
  /নয়/i,
  /না\b/i,
  /হয়নি/i,
  /হয়নি/i,
  /হয় না/i,
  /হয় না/i,
  /হচ্ছে না/i,
  /করছি না/i,
  /করছে না/i,
  /ভুগছি না/i,
  /ভুগছে না/i,
  /নেই বলে/i,
];

function isNegated(
  clause: string,
) {
  return NEGATION_PATTERNS.some(
    (pattern) =>
      pattern.test(clause),
  );
}

/**
 * Some expressions are clearly positive even when a generic "not" occurs
 * elsewhere in the same clause.
 *
 * Example:
 *
 *   "I am not sure but I have severe chest pain"
 *
 * Clause splitting normally handles this, but this helper keeps detection
 * conservative.
 */
function hasStrongPositiveContext(
  clause: string,
  positivePatterns: RegExp[],
) {
  return positivePatterns.some(
    (pattern) =>
      pattern.test(clause),
  );
}

/**
 * Detect a pattern only if the relevant phrase appears in a positive
 * patient-reported clause.
 */
function containsPositiveFinding(
  clauses: string[],
  patterns: RegExp[],
) {
  return clauses.some((clause) => {
    const matched =
      hasStrongPositiveContext(
        clause,
        patterns,
      );

    if (!matched) {
      return false;
    }

    /*
     * A negated clause is considered negative unless there is a clear
     * positive symptom phrase after the negation.
     */
    if (isNegated(clause)) {
      const negationIndex =
        findFirstNegationIndex(
          clause,
        );

      if (negationIndex === -1) {
        return true;
      }

      const afterNegation =
        clause.slice(
          negationIndex,
        );

      /*
       * If the symptom phrase occurs after a negation marker, the expression
       * may still be positive:
       *
       * "I don't have fever but I have chest pain"
       *
       * Such compound statements are usually already split by splitClauses,
       * so this is intentionally conservative.
       */
      return !patterns.some(
        (pattern) =>
          pattern.test(
            afterNegation,
          ),
      );
    }

    return true;
  });
}

function findFirstNegationIndex(
  clause: string,
) {
  const indexes: number[] = [];

  for (const pattern of NEGATION_PATTERNS) {
    const match =
      pattern.exec(clause);

    if (match?.index !== undefined) {
      indexes.push(match.index);
    }
  }

  return indexes.length
    ? Math.min(...indexes)
    : -1;
}

/* -------------------------------------------------------------------------- */
/*                        High-risk symptom patterns                          */
/* -------------------------------------------------------------------------- */

const CHEST_PAIN = [
  /\bchest pain\b/i,
  /\bchest pressure\b/i,
  /\bchest tightness\b/i,
  /\bpressure in (?:the )?chest\b/i,
  /\bheavy feeling in (?:the )?chest\b/i,

  /বুকে ব্যথা/i,
  /বুকে চাপ/i,
  /বুকে চাপ লাগ/i,
  /বুক চেপে/i,
  /বুক ভার/i,
];

const SEVERE_BREATHING = [
  /\bsevere shortness of breath\b/i,
  /\bsevere breathlessness\b/i,
  /\bcan't breathe\b/i,
  /\bcannot breathe\b/i,
  /\bunable to breathe\b/i,
  /\bstruggling to breathe\b/i,
  /\bgasping\b/i,
  /\bair hunger\b/i,

  /তীব্র শ্বাসকষ্ট/i,
  /শ্বাস নিতে পারছি না/i,
  /শ্বাস নিতে কষ্ট হচ্ছে খুব/i,
  /দম বন্ধ/i,
  /হাঁপিয়ে যাচ্ছি/i,
  /হাঁপিয়ে যাচ্ছি/i,
];

const BLUE_LIPS = [
  /\bblue lips\b/i,
  /\bbluish lips\b/i,
  /\bblue face\b/i,
  /\bcyanosis\b/i,

  /ঠোঁট নীল/i,
  /মুখ নীল/i,
  /শরীর নীল/i,
];

const SEVERE_BLEEDING = [
  /\bbleeding heavily\b/i,
  /\bheavy bleeding\b/i,
  /\buncontrolled bleeding\b/i,
  /\bblood won't stop\b/i,
  /\bblood will not stop\b/i,
  /\bvomiting blood\b/i,
  /\bcoughing up blood\b/i,
  /\bcoughing blood\b/i,

  /অনেক রক্তপাত/i,
  /অতিরিক্ত রক্তপাত/i,
  /রক্তপাত বন্ধ হচ্ছে না/i,
  /রক্ত বন্ধ হচ্ছে না/i,
  /রক্ত বমি/i,
  /বমির সঙ্গে রক্ত/i,
  /কাশির সঙ্গে রক্ত/i,
];

const SEVERE_CONFUSION = [
  /\bunconscious\b/i,
  /\bpassed out\b/i,
  /\bnot responding\b/i,
  /\bunresponsive\b/i,
  /\bseverely confused\b/i,
  /\bnew confusion\b/i,
  /\bcan't be woken\b/i,
  /\bcannot be woken\b/i,

  /অজ্ঞান/i,
  /সাড়া দিচ্ছে না/i,
  /সাড়া দিচ্ছে না/i,
  /জ্ঞান হারিয়/i,
  /জ্ঞান হারিয়/i,
  /অচেতন/i,
  /তীব্র বিভ্রান্ত/i,
];

const SEIZURE = [
  /\bseizure\b/i,
  /\bconvulsion\b/i,
  /\bconvulsions\b/i,
  /\bfitting\b/i,

  /খিঁচুনি/i,
  /খিচুনি/i,
  /খিঁচুনি হচ্ছে/i,
];

const STROKE_SIGNS = [
  /\bface droop\b/i,
  /\bone side weakness\b/i,
  /\bone-sided weakness\b/i,
  /\bweakness on one side\b/i,
  /\barm weakness\b/i,
  /\bspeech suddenly slurred\b/i,
  /\bslurred speech\b/i,
  /\bcan't speak\b/i,
  /\bcannot speak\b/i,
  /\bsudden loss of speech\b/i,

  /মুখ বেঁকে/i,
  /এক পাশ দুর্বল/i,
  /একদিকে দুর্বল/i,
  /হাত দুর্বল/i,
  /কথা জড়িয়ে/i,
  /কথা বলতে পারছি না/i,
];

const SEVERE_HEADACHE = [
  /\bsudden worst headache\b/i,
  /\bworst headache of my life\b/i,
  /\bthunderclap headache\b/i,
  /\bsudden severe headache\b/i,

  /হঠাৎ প্রচণ্ড মাথাব্যথা/i,
  /জীবনের সবচেয়ে তীব্র মাথাব্যথা/i,
  /জীবনের সবচেয়ে তীব্র মাথাব্যথা/i,
  /হঠাৎ খুব তীব্র মাথাব্যথা/i,
];

const SERIOUS_ALLERGIC_REACTION = [
  /\banaphylaxis\b/i,
  /\bsevere allergic reaction\b/i,
  /\bthroat swelling\b/i,
  /\btongue swelling\b/i,
  /\bface swelling with breathing difficulty\b/i,

  /তীব্র অ্যালার্জি/i,
  /গলা ফুলে/i,
  /জিহ্বা ফুলে/i,
  /মুখ ফুলে.*শ্বাসকষ্ট/i,
];

const SERIOUS_INJURY = [
  /\bmajor trauma\b/i,
  /\bsevere injury\b/i,
  /\bmajor accident\b/i,
  /\bserious accident\b/i,
  /\bhead injury with loss of consciousness\b/i,

  /গুরুতর আঘাত/i,
  /বড় দুর্ঘটনা/i,
  /বড় দুর্ঘটনা/i,
  /গুরুতর দুর্ঘটনা/i,
  /মাথায় আঘাত.*অজ্ঞান/i,
  /মাথায় আঘাত.*অজ্ঞান/i,
];

const SUICIDE_OR_IMMEDIATE_SELF_HARM = [
  /\bi want to kill myself\b/i,
  /\bi am going to kill myself\b/i,
  /\bkill myself now\b/i,
  /\bsuicide attempt\b/i,
  /\bjust attempted suicide\b/i,
  /\bimmediate self[- ]harm\b/i,

  /আমি নিজেকে মেরে ফেলতে চাই/i,
  /আমি আত্মহত্যা করতে চাই/i,
  /এখনই নিজেকে মেরে ফেল/i,
  /আত্মহত্যার চেষ্টা করেছি/i,
  /নিজেকে আঘাত করার চেষ্টা করেছি/i,
];

/* -------------------------------------------------------------------------- */
/*                           Urgent patterns                                  */
/* -------------------------------------------------------------------------- */

const MODERATE_BREATHING = [
  /\bshortness of breath\b/i,
  /\bbreathless\b/i,
  /\bbreathlessness\b/i,
  /\bdifficulty breathing\b/i,
  /\btrouble breathing\b/i,

  /শ্বাসকষ্ট/i,
  /শ্বাস নিতে কষ্ট/i,
  /দম নিতে কষ্ট/i,
];

const PALPITATIONS_WITH_DANGER = [
  /\bpalpitations\b/i,
  /\bracing heart\b/i,
  /\bheart racing\b/i,

  /হৃদস্পন্দন বেড়ে/i,
  /হৃদস্পন্দন বেড়ে/i,
  /বুক ধড়ফড়/i,
  /বুক ধড়ফড়/i,
];

const PERSISTENT_VOMITING = [
  /\bcan't keep fluids down\b/i,
  /\bcannot keep fluids down\b/i,
  /\bcontinuous vomiting\b/i,
  /\bpersistent vomiting\b/i,

  /কিছুই রাখতে পারছি না/i,
  /পানি রাখতে পারছি না/i,
  /বারবার বমি/i,
  /অবিরাম বমি/i,
];

const SIGNIFICANT_DEHYDRATION = [
  /\bseverely dehydrated\b/i,
  /\bvery little urine\b/i,
  /\bnot urinating\b/i,
  /\bfainting from dehydration\b/i,

  /তীব্র পানিশূন্যতা/i,
  /প্রস্রাব খুব কম/i,
  /প্রস্রাব হচ্ছে না/i,
  /পানিশূন্য হয়ে/i,
  /পানিশূন্য হয়ে/i,
];

const SEVERE_PAIN = [
  /\bsevere pain\b/i,
  /\bexcruciating pain\b/i,
  /\bunbearable pain\b/i,
  /\b10\/10 pain\b/i,

  /তীব্র ব্যথা/i,
  /অসহ্য ব্যথা/i,
  /প্রচণ্ড ব্যথা/i,
  /১০\/১০ ব্যথা/i,
];

const HIGH_FEVER_WITH_DANGER = [
  /\bvery high fever\b/i,
  /\bhigh fever with confusion\b/i,
  /\bhigh fever with stiff neck\b/i,

  /খুব বেশি জ্বর/i,
  /উচ্চ জ্বর.*বিভ্রান্ত/i,
  /উচ্চ জ্বর.*ঘাড় শক্ত/i,
  /উচ্চ জ্বর.*ঘাড় শক্ত/i,
];

/* -------------------------------------------------------------------------- */
/*                           Rule definitions                                 */
/* -------------------------------------------------------------------------- */

type Rule = {
  id: string;
  severity: RedFlagSeverity;
  patterns: RegExp[];
  en: string;
  bn: string;
};

const CRITICAL_RULES: Rule[] = [
  {
    id: "critical-chest-pain",
    severity: "critical",
    patterns: CHEST_PAIN,
    en: "Chest pain or pressure was reported.",
    bn: "বুকে ব্যথা বা চাপের কথা বলা হয়েছে।",
  },

  {
    id: "critical-severe-breathing",
    severity: "critical",
    patterns: SEVERE_BREATHING,
    en: "Severe difficulty breathing was reported.",
    bn: "তীব্র শ্বাসকষ্টের কথা বলা হয়েছে।",
  },

  {
    id: "critical-blue-lips",
    severity: "critical",
    patterns: BLUE_LIPS,
    en: "Blue or bluish lips/face were reported.",
    bn: "ঠোঁট বা মুখ নীল হয়ে যাওয়ার কথা বলা হয়েছে।",
  },

  {
    id: "critical-bleeding",
    severity: "critical",
    patterns: SEVERE_BLEEDING,
    en: "Heavy or uncontrolled bleeding was reported.",
    bn: "অতিরিক্ত বা নিয়ন্ত্রণহীন রক্তপাতের কথা বলা হয়েছে।",
  },

  {
    id: "critical-unconscious",
    severity: "critical",
    patterns: SEVERE_CONFUSION,
    en: "Loss of consciousness, unresponsiveness or severe new confusion was reported.",
    bn: "অজ্ঞান হয়ে যাওয়া, সাড়া না দেওয়া বা তীব্র নতুন বিভ্রান্তির কথা বলা হয়েছে।",
  },

  {
    id: "critical-seizure",
    severity: "critical",
    patterns: SEIZURE,
    en: "A seizure or convulsion was reported.",
    bn: "খিঁচুনির কথা বলা হয়েছে।",
  },

  {
    id: "critical-stroke",
    severity: "critical",
    patterns: STROKE_SIGNS,
    en: "Possible sudden stroke-like warning signs were reported.",
    bn: "হঠাৎ স্ট্রোকের মতো সতর্ক-সংকেতের কথা বলা হয়েছে।",
  },

  {
    id: "critical-headache",
    severity: "critical",
    patterns: SEVERE_HEADACHE,
    en: "A sudden, extremely severe headache was reported.",
    bn: "হঠাৎ অত্যন্ত তীব্র মাথাব্যথার কথা বলা হয়েছে।",
  },

  {
    id: "critical-allergy",
    severity: "critical",
    patterns: SERIOUS_ALLERGIC_REACTION,
    en: "A possible severe allergic reaction with airway involvement was reported.",
    bn: "শ্বাসনালী জড়িত সম্ভাব্য তীব্র অ্যালার্জিক প্রতিক্রিয়ার কথা বলা হয়েছে।",
  },

  {
    id: "critical-trauma",
    severity: "critical",
    patterns: SERIOUS_INJURY,
    en: "A serious injury or major accident was reported.",
    bn: "গুরুতর আঘাত বা বড় দুর্ঘটনার কথা বলা হয়েছে।",
  },

  {
    id: "critical-self-harm",
    severity: "critical",
    patterns: SUICIDE_OR_IMMEDIATE_SELF_HARM,
    en: "An immediate self-harm or suicide risk was reported.",
    bn: "তাৎক্ষণিক আত্মহানি বা আত্মহত্যার ঝুঁকির কথা বলা হয়েছে।",
  },
];

const URGENT_RULES: Rule[] = [
  {
    id: "urgent-breathing",
    severity: "urgent",
    patterns: MODERATE_BREATHING,
    en: "Shortness of breath or breathing difficulty was reported.",
    bn: "শ্বাসকষ্ট বা শ্বাস নিতে অসুবিধার কথা বলা হয়েছে।",
  },

  {
    id: "urgent-palpitations",
    severity: "urgent",
    patterns: PALPITATIONS_WITH_DANGER,
    en: "Significant palpitations were reported.",
    bn: "উল্লেখযোগ্য বুক ধড়ফড় বা হৃদস্পন্দন বেড়ে যাওয়ার কথা বলা হয়েছে।",
  },

  {
    id: "urgent-vomiting",
    severity: "urgent",
    patterns: PERSISTENT_VOMITING,
    en: "Persistent vomiting or inability to keep fluids down was reported.",
    bn: "বারবার বমি বা পানি/তরল রাখতে না পারার কথা বলা হয়েছে।",
  },

  {
    id: "urgent-dehydration",
    severity: "urgent",
    patterns: SIGNIFICANT_DEHYDRATION,
    en: "Possible significant dehydration was reported.",
    bn: "উল্লেখযোগ্য পানিশূন্যতার সম্ভাব্য লক্ষণের কথা বলা হয়েছে।",
  },

  {
    id: "urgent-severe-pain",
    severity: "urgent",
    patterns: SEVERE_PAIN,
    en: "Severe or unbearable pain was reported.",
    bn: "তীব্র বা অসহ্য ব্যথার কথা বলা হয়েছে।",
  },

  {
    id: "urgent-fever-danger",
    severity: "urgent",
    patterns: HIGH_FEVER_WITH_DANGER,
    en: "High fever with an additional concerning feature was reported.",
    bn: "উচ্চ জ্বরের সঙ্গে একটি উদ্বেগজনক অতিরিক্ত লক্ষণের কথা বলা হয়েছে।",
  },
];

/* -------------------------------------------------------------------------- */
/*                          Rule evaluation                                   */
/* -------------------------------------------------------------------------- */

function evaluateRule(
  rule: Rule,
  clauses: string[],
) {
  return containsPositiveFinding(
    clauses,
    rule.patterns,
  );
}

/* -------------------------------------------------------------------------- */
/*                       Age-related safety rules                              */
/* -------------------------------------------------------------------------- */

function parseAge(
  age?: string,
) {
  if (!age) {
    return null;
  }

  const match =
    age.match(/\d+/);

  if (!match) {
    return null;
  }

  const value =
    Number(match[0]);

  return Number.isFinite(value)
    ? value
    : null;
}

/**
 * Age alone never creates a red flag.
 *
 * It is used only to make an existing concerning presentation more cautious.
 */
function applyAgeContext(
  hits: RedFlagHit[],
  input: DetectRedFlagsInput,
) {
  const age = parseAge(
    input.age,
  );

  if (
    age === null ||
    hits.length === 0
  ) {
    return hits;
  }

  /*
   * Do not invent a red flag solely because someone is older or younger.
   * Existing rule hits remain unchanged.
   */
  return hits;
}

/* -------------------------------------------------------------------------- */
/*                            Main detector                                   */
/* -------------------------------------------------------------------------- */

export function detectRedFlags(
  input: DetectRedFlagsInput,
): RedFlagResult {
  const language =
    input.language === "bn"
      ? "bn"
      : "en";

  /*
   * IMPORTANT:
   *
   * We intentionally do NOT concatenate question text.
   *
   * The question:
   *   "Are you having chest pain?"
   *
   * must never itself create a chest-pain hit.
   *
   * Only the patient's actual symptom statement and answer are examined.
   */
  const patientStatements = [
    input.symptoms,
    ...(input.answers ?? []).map(
      (answer) => answer.answer,
    ),
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.trim().length > 0,
    )
    .join("\n");

  const clauses =
    splitClauses(
      patientStatements,
    );

  /*
   * Empty / unusable input cannot produce a red flag.
   */
  if (clauses.length === 0) {
    return {
      hits: [],
      level: null,
    };
  }

  const hits: RedFlagHit[] = [];

  /*
   * Critical rules are evaluated first.
   */
  for (const rule of CRITICAL_RULES) {
    if (
      evaluateRule(
        rule,
        clauses,
      )
    ) {
      hits.push({
        id: rule.id,
        severity: rule.severity,
        message: message(
          language,
          rule.en,
          rule.bn,
        ),
      });
    }
  }

  /*
   * Then urgent rules.
   */
  for (const rule of URGENT_RULES) {
    if (
      evaluateRule(
        rule,
        clauses,
      )
    ) {
      hits.push({
        id: rule.id,
        severity: rule.severity,
        message: message(
          language,
          rule.en,
          rule.bn,
        ),
      });
    }
  }

  const contextualHits =
    applyAgeContext(
      hits,
      input,
    );

  /*
   * Deduplicate by rule ID.
   */
  const uniqueHits =
    Array.from(
      new Map(
        contextualHits.map(
          (hit) => [
            hit.id,
            hit,
          ],
        ),
      ).values(),
    );

  const level =
    uniqueHits.some(
      (hit) =>
        hit.severity ===
        "critical",
    )
      ? "critical"
      : uniqueHits.some(
            (hit) =>
              hit.severity ===
              "urgent",
          )
        ? "urgent"
        : null;

  return {
    hits: uniqueHits,
    level,
  };
}

/* -------------------------------------------------------------------------- */
/*                     Urgency notice helper                                  */
/* -------------------------------------------------------------------------- */

export function redFlagUrgencyNotice(
  level:
    | "urgent"
    | "critical"
    | null,
  language: "en" | "bn" = "en",
) {
  if (
    level === "critical"
  ) {
    return language === "bn"
      ? "এখানে সম্ভাব্য জীবনসংশয়ী সতর্ক-সংকেত পাওয়া গেছে। অনলাইনে আরও মূল্যায়নের অপেক্ষা না করে এখনই ১১২ বা ১০৮-এ কল করুন অথবা নিকটতম আপৎকালীন বিভাগে যান।"
      : "A potentially life-threatening warning sign was detected. Do not wait for further online assessment; call 112 or 108 now or go to the nearest emergency department.";
  }

  if (
    level === "urgent"
  ) {
    return language === "bn"
      ? "এখানে এমন একটি সতর্কতা পাওয়া গেছে যার জন্য দ্রুত চিকিৎসা মূল্যায়ন প্রয়োজন হতে পারে। অবস্থা খারাপ হলে বা নতুন গুরুতর লক্ষণ দেখা দিলে জরুরি সাহায্য নিন।"
      : "A warning sign was detected that may require prompt medical assessment. Seek emergency help if the condition worsens or new severe symptoms appear.";
  }

  return language === "bn"
    ? "কোনও নিয়মভিত্তিক জরুরি সতর্কতা শনাক্ত হয়নি।"
    : "No rule-based emergency warning sign was detected.";
}

/* -------------------------------------------------------------------------- */
/*                          Public utility                                    */
/* -------------------------------------------------------------------------- */

/**
 * Small helper for testing the detector without exposing internal regexes.
 *
 * Examples:
 *
 * detectRedFlags({
 *   symptoms: "I have chest pain",
 *   language: "en",
 * })
 *
 * => critical
 *
 * detectRedFlags({
 *   symptoms: "No chest pain",
 *   language: "en",
 * })
 *
 * => null
 */
export function redFlagLevel(
  input: DetectRedFlagsInput,
) {
  return detectRedFlags(
    input,
  ).level;
}