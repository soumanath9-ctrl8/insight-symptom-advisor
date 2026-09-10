/**
 * Deterministic vital-sign extraction.
 *
 * Vitals are read ONLY from what the patient actually typed (symptom text or
 * follow-up answers). Nothing is ever inferred or defaulted — a value that is
 * not stated stays undefined, and the assessment must treat it as UNKNOWN.
 */

import { VITAL_RANGES } from "./medical-knowledge";

export type Vitals = {
  tempC?: number;
  spo2?: number;
  heartRate?: number;
  respRate?: number;
  systolic?: number;
  diastolic?: number;
  glucoseMgDl?: number;
};

function num(match: RegExpMatchArray | null, index = 1): number | undefined {
  if (!match) return undefined;
  const value = Number(match[index]);
  return Number.isFinite(value) ? value : undefined;
}

export function extractVitals(text: string): Vitals {
  const t = text.toLowerCase().replace(/,/g, " ");
  const vitals: Vitals = {};

  // Temperature, in C or F (Bengali: তাপমাত্রা / জ্বর)
  const f = t.match(/(\d{2,3}(?:\.\d)?)\s*(?:°\s*)?f\b/);
  const c = t.match(/(\d{2,3}(?:\.\d)?)\s*(?:°\s*)?c\b/);
  if (c) vitals.tempC = num(c);
  else if (f) {
    const v = num(f);
    if (v !== undefined) vitals.tempC = Math.round(((v - 32) * 5) / 9 * 10) / 10;
  } else {
    const bare = t.match(/(?:temp(?:erature)?|fever|তাপমাত্রা)\D{0,12}(\d{2,3}(?:\.\d)?)/);
    const v = num(bare);
    if (v !== undefined) {
      if (v >= 90) vitals.tempC = Math.round(((v - 32) * 5) / 9 * 10) / 10;
      else if (v >= 34 && v <= 43) vitals.tempC = v;
    }
  }

  const spo2 = t.match(/(?:spo2|sp02|oxygen(?: saturation| level)?|oxygen|অক্সিজেন)\D{0,12}(\d{2,3})\s*%?/);
  const spo2Value = num(spo2);
  if (spo2Value !== undefined && spo2Value >= 50 && spo2Value <= 100) vitals.spo2 = spo2Value;

  const hr = t.match(/(?:pulse|heart rate|hr|bpm|হার্ট রেট|নাড়ি)\D{0,12}(\d{2,3})/);
  const hrValue = num(hr);
  if (hrValue !== undefined && hrValue >= 25 && hrValue <= 250) vitals.heartRate = hrValue;

  const rr = t.match(/(?:respiratory rate|resp rate|breaths? per minute|rr|শ্বাসের হার)\D{0,12}(\d{1,2})/);
  const rrValue = num(rr);
  if (rrValue !== undefined && rrValue >= 5 && rrValue <= 70) vitals.respRate = rrValue;

  const bp = t.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (bp) {
    const sys = num(bp, 1);
    const dia = num(bp, 2);
    if (sys !== undefined && dia !== undefined && sys >= 50 && sys <= 260 && dia >= 30 && dia <= 180) {
      vitals.systolic = sys;
      vitals.diastolic = dia;
    }
  }

  const glucose = t.match(/(?:sugar|glucose|গ্লুকোজ|সুগার)\D{0,14}(\d{2,3})/);
  const g = num(glucose);
  if (g !== undefined && g >= 20 && g <= 800) vitals.glucoseMgDl = g;

  return vitals;
}

export type VitalFlag = { severity: "critical" | "urgent"; message: { en: string; bn: string } };

/** Deterministic thresholds. Missing values never produce a flag. */
export function flagVitals(v: Vitals): VitalFlag[] {
  const flags: VitalFlag[] = [];
  const R = VITAL_RANGES;

  if (v.spo2 !== undefined) {
    if (v.spo2 < R.spo2.critical)
      flags.push({
        severity: "critical",
        message: {
          en: `Reported oxygen level of ${v.spo2}% is dangerously low.`,
          bn: `জানানো অক্সিজেনের মাত্রা ${v.spo2}% — বিপজ্জনকভাবে কম।`,
        },
      });
    else if (v.spo2 < R.spo2.concerning)
      flags.push({
        severity: "urgent",
        message: {
          en: `Reported oxygen level of ${v.spo2}% is below the usual range and needs same-day review.`,
          bn: `জানানো অক্সিজেনের মাত্রা ${v.spo2}% স্বাভাবিকের নিচে — আজই চিকিৎসকের মূল্যায়ন দরকার।`,
        },
      });
  }

  if (v.tempC !== undefined) {
    if (v.tempC >= R.tempC.critical)
      flags.push({
        severity: "critical",
        message: {
          en: `Reported temperature of ${v.tempC}°C is very high.`,
          bn: `জানানো তাপমাত্রা ${v.tempC}°C — খুবই বেশি।`,
        },
      });
    else if (v.tempC < R.tempC.low)
      flags.push({
        severity: "critical",
        message: {
          en: `Reported temperature of ${v.tempC}°C is abnormally low.`,
          bn: `জানানো তাপমাত্রা ${v.tempC}°C — অস্বাভাবিকভাবে কম।`,
        },
      });
  }

  if (v.respRate !== undefined && v.respRate >= R.respRate.critical)
    flags.push({
      severity: "critical",
      message: {
        en: `Reported breathing rate of ${v.respRate} per minute is very fast.`,
        bn: `জানানো শ্বাসের হার প্রতি মিনিটে ${v.respRate} — খুব দ্রুত।`,
      },
    });
  else if (v.respRate !== undefined && v.respRate >= R.respRate.high)
    flags.push({
      severity: "urgent",
      message: {
        en: `Reported breathing rate of ${v.respRate} per minute is faster than usual.`,
        bn: `জানানো শ্বাসের হার প্রতি মিনিটে ${v.respRate} — স্বাভাবিকের চেয়ে দ্রুত।`,
      },
    });

  if (v.heartRate !== undefined) {
    if (v.heartRate >= R.heartRate.critical || v.heartRate < R.heartRate.low)
      flags.push({
        severity: "critical",
        message: {
          en: `Reported pulse of ${v.heartRate} beats per minute is outside the safe range.`,
          bn: `জানানো নাড়ির গতি প্রতি মিনিটে ${v.heartRate} — নিরাপদ সীমার বাইরে।`,
        },
      });
    else if (v.heartRate > R.heartRate.high)
      flags.push({
        severity: "urgent",
        message: {
          en: `Reported pulse of ${v.heartRate} beats per minute is faster than usual.`,
          bn: `জানানো নাড়ির গতি প্রতি মিনিটে ${v.heartRate} — স্বাভাবিকের চেয়ে দ্রুত।`,
        },
      });
  }

  if (v.systolic !== undefined) {
    if (v.systolic < R.systolic.criticalLow || v.systolic >= R.systolic.criticalHigh)
      flags.push({
        severity: "critical",
        message: {
          en: `Reported blood pressure of ${v.systolic}/${v.diastolic ?? "?"} is in a dangerous range.`,
          bn: `জানানো রক্তচাপ ${v.systolic}/${v.diastolic ?? "?"} — বিপজ্জনক মাত্রায়।`,
        },
      });
    else if (
      v.systolic < R.systolic.low ||
      v.systolic > R.systolic.high ||
      (v.diastolic !== undefined && v.diastolic > R.diastolic.high)
    )
      flags.push({
        severity: "urgent",
        message: {
          en: `Reported blood pressure of ${v.systolic}/${v.diastolic ?? "?"} is outside the usual range.`,
          bn: `জানানো রক্তচাপ ${v.systolic}/${v.diastolic ?? "?"} — স্বাভাবিক সীমার বাইরে।`,
        },
      });
  }

  if (v.glucoseMgDl !== undefined) {
    if (v.glucoseMgDl < R.glucoseMgDl.criticalLow || v.glucoseMgDl >= R.glucoseMgDl.critical)
      flags.push({
        severity: "critical",
        message: {
          en: `Reported blood sugar of ${v.glucoseMgDl} mg/dL is in a dangerous range.`,
          bn: `জানানো রক্তে শর্করা ${v.glucoseMgDl} mg/dL — বিপজ্জনক মাত্রায়।`,
        },
      });
    else if (v.glucoseMgDl < R.glucoseMgDl.low || v.glucoseMgDl > R.glucoseMgDl.high)
      flags.push({
        severity: "urgent",
        message: {
          en: `Reported blood sugar of ${v.glucoseMgDl} mg/dL is outside the usual range.`,
          bn: `জানানো রক্তে শর্করা ${v.glucoseMgDl} mg/dL — স্বাভাবিক সীমার বাইরে।`,
        },
      });
  }

  return flags;
}

export function describeVitals(v: Vitals, lang: "en" | "bn" = "en"): string {
  const parts: string[] = [];
  if (v.tempC !== undefined) parts.push(`temperature ${v.tempC}°C`);
  if (v.spo2 !== undefined) parts.push(`oxygen saturation ${v.spo2}%`);
  if (v.heartRate !== undefined) parts.push(`pulse ${v.heartRate}/min`);
  if (v.respRate !== undefined) parts.push(`breathing rate ${v.respRate}/min`);
  if (v.systolic !== undefined) parts.push(`blood pressure ${v.systolic}/${v.diastolic ?? "?"}`);
  if (v.glucoseMgDl !== undefined) parts.push(`blood sugar ${v.glucoseMgDl} mg/dL`);
  if (!parts.length) return "";
  return (lang === "bn" ? "রোগীর জানানো পরিমাপ: " : "Patient-reported measurements: ") + parts.join(", ");
}
