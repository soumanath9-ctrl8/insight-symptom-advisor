import type { Assessment } from "./symptoms.functions";
import type { Strings, Lang } from "./i18n";

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}

export function openReport(opts: {
  t: Strings;
  lang: Lang;
  assessment: Assessment;
  symptoms: string;
  answers: { question: string; answer: string }[];
  meta: { age?: string; sex?: string; duration?: string; severity?: number };
}) {
  const { t, lang, assessment: a, symptoms, answers, meta } = opts;
  const metaLine = [
    meta.age ? `${t.age}: ${meta.age}` : "",
    meta.sex ? `${t.sex}: ${meta.sex}` : "",
    meta.duration ? `${t.duration}: ${meta.duration}` : "",
    meta.severity ? `${t.severity.split("(")[0]?.trim()}: ${meta.severity}/10` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(t.reportTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600&family=Noto+Sans+Bengali:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { --ink:#183a3a; --muted:#5c7373; --line:#d8e5e1; --teal:#1f6f6b; }
  * { box-sizing:border-box; }
  body { font-family:"Work Sans","Noto Sans Bengali",system-ui,sans-serif; color:var(--ink); margin:0; padding:36px 40px; }
  h1 { font-size:22px; margin:0 0 4px; color:var(--teal); }
  h2 { font-size:15px; margin:24px 0 8px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  .meta { font-size:12px; color:var(--muted); }
  .box { border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin:10px 0; page-break-inside:avoid; }
  .name { font-weight:600; font-size:16px; display:flex; justify-content:space-between; gap:12px; }
  .risk { font-size:12px; color:var(--muted); white-space:nowrap; }
  p { font-size:13px; line-height:1.55; margin:6px 0; }
  ul { margin:6px 0 0 18px; padding:0; font-size:13px; line-height:1.55; }
  .label { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-top:8px; }
  .foot { margin-top:26px; font-size:11px; color:var(--muted); border-top:1px solid var(--line); padding-top:10px; }
  @media print { body { padding:18px 22px; } }
</style></head><body>
<h1>${esc(t.reportTitle)}</h1>
<div class="meta">${esc(t.reportDate)}: ${new Date().toLocaleString()}${metaLine ? " · " + esc(metaLine) : ""}</div>

<h2>${esc(t.reportSymptoms)}</h2>
<p>${esc(symptoms)}</p>
${
  answers.length
    ? `<h2>${esc(t.reportAnswers)}</h2><ul>${answers
        .map((x) => `<li><strong>${esc(x.question)}</strong> — ${esc(x.answer)}</li>`)
        .join("")}</ul>`
    : ""
}

<h2>${esc(t.urgency[a.urgency])}</h2>
<p>${esc(a.summary)}</p>
<p class="meta">${esc(a.urgencyReason)}</p>

<h2>${esc(t.possibleConditions)}</h2>
${a.conditions
  .map(
    (c) => `<div class="box">
  <div class="name"><span>${esc(c.name)}</span><span class="risk">${esc(
    c.riskLevel === "high" ? t.highRisk : c.riskLevel === "moderate" ? t.moderateRisk : t.lowRisk,
  )} ${esc(t.riskWord)} · ${Math.round(c.likelihood)}%</span></div>
  <p>${esc(c.explanation)}</p>
  <div class="label">${esc(t.whyThisRiskLevel)}</div><p>${esc(c.riskRationale)}</p>
  ${
    c.contributingFactors.length
      ? `<div class="label">${esc(t.contributingFactors)}</div><ul>${c.contributingFactors
          .map((f) => `<li>${esc(f.factor)} — ${Math.round(f.weight)}% (${esc(f.effect)})</li>`)
          .join("")}</ul>`
      : ""
  }
  <div class="label">${esc(t.nextStep)}</div><p>${esc(c.nextSteps)}</p>
  ${
    c.selfCare.length
      ? `<div class="label">${esc(t.selfCareTitle)}</div><ul>${c.selfCare
          .map((s) => `<li>${esc(s)}</li>`)
          .join("")}</ul>`
      : ""
  }
  ${
    c.reliefCategories.length
      ? `<div class="label">${esc(t.otcTitle)}</div><ul>${c.reliefCategories
          .map((s) => `<li>${esc(s)}</li>`)
          .join("")}</ul><p class="meta">${esc(t.pharmacistNote)}</p>`
      : ""
  }
</div>`,
  )
  .join("")}

${
  a.redFlags.length
    ? `<h2>${esc(t.redFlags)}</h2><ul>${a.redFlags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
    : ""
}
<h2>${esc(t.generalAdvice)}</h2><p>${esc(a.generalAdvice)}</p>
<div class="foot">${esc(t.disclaimer)}</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
