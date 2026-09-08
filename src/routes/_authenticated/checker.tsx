import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Download,
  HeartPulse,
  Loader2,
  MessageCircleQuestion,
  Save,
  Stethoscope,
} from "lucide-react";

import {
  assessSymptoms,
  clarifyAnswers,
  getFollowUpQuestions,
  immediateEmergencyAssessment,
  type Assessment,
  type Condition,
  type FollowUpQuestion,
} from "@/lib/symptoms.functions";
import { LangContext, useLang, type Lang } from "@/lib/i18n";
import { topRisk } from "@/lib/history";
import { getProfile, saveCheck } from "@/lib/history.functions";
import { openReport } from "@/lib/report";
import { EmergencyHelp } from "@/components/EmergencyHelp";
import { ProfileMenu } from "@/components/ProfileMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";


export const Route = createFileRoute("/_authenticated/checker")({
  head: () => ({
    meta: [
      { title: "Symptom Check — SymptomScope Patient Dashboard" },
      {
        name: "description",
        content:
          "Describe your symptoms, answer a few doctor-style follow-up questions, and get a calibrated, plain-language risk assessment with self-care guidance in English or Bengali.",
      },
      { property: "og:title", content: "Symptom Check — SymptomScope Patient Dashboard" },
      {
        property: "og:description",
        content:
          "Adaptive follow-up questions, calibrated risk levels, explainable results, symptom history and a doctor-ready PDF report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const EXAMPLES: Record<Lang, string[]> = {
  en: [
    "Dry cough and a mild sore throat for 3 days",
    "Throbbing headache on one side, nausea, light sensitivity",
    "Burning when urinating and lower back ache",
  ],
  bn: [
    "তিন দিন ধরে শুকনো কাশি ও হালকা গলা ব্যথা",
    "মাথার এক পাশে দমদম ব্যথা, বমি বমি ভাব, আলোয় অস্বস্তি",
    "প্রস্রাবে জ্বালা ও কমরে ব্যথা",
  ],
};

function riskClasses(level: Condition["riskLevel"]) {
  if (level === "high") return { text: "text-risk-high", bg: "bg-risk-high" };
  if (level === "moderate") return { text: "text-risk-moderate", bg: "bg-risk-moderate" };
  return { text: "text-risk-low", bg: "bg-risk-low" };
}

function Index() {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <AppBody />
    </LangContext.Provider>
  );
}

type Stage = "intake" | "questions" | "result";

function AppBody() {
  const { lang, setLang, t } = useLang();

  const [symptoms, setSymptoms] = useState("");
  const [duration, setDuration] = useState("");

  const [stage, setStage] = useState<Stage>("intake");
  const [questions, setQuestions] = useState<FollowUpQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");

  const [override, setOverride] = useState<Assessment | null>(null);
  const [clarified, setClarified] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const saveFn = useServerFn(saveCheck);
  const profileFn = useServerFn(getProfile);

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => profileFn({}) });

  const saveMutation = useMutation({
    mutationFn: (vars: Parameters<typeof saveFn>[0]["data"]) => saveFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checks"] }),
  });

  const askFn = useServerFn(getFollowUpQuestions);
  const assessFn = useServerFn(assessSymptoms);
  const clarifyFn = useServerFn(clarifyAnswers);

  const age = profileQuery.data?.age ?? "";
  const sex = profileQuery.data?.sex ?? "";

  const baseInput = () => ({
    symptoms: symptoms.trim(),
    age: age.trim() || undefined,
    sex: sex.trim() || undefined,
    duration: duration.trim() || undefined,
    language: lang,
  });



  /**
   * Safety first: the deterministic warning-sign check runs before any
   * questions or prediction. A critical hit jumps straight to the emergency
   * result (112 / 108 + nearby hospitals).
   */
  function startCheck() {
    const emergency = immediateEmergencyAssessment(baseInput());
    if (emergency) {
      setOverride(emergency);
      setStage("result");
      return;
    }
    questionsMutation.mutate();
  }

  const questionsMutation = useMutation({
    mutationFn: () => askFn({ data: baseInput() }),
    onSuccess: (qs) => {
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(""));
      setStep(0);
      setDraft("");
      setStage("questions");
    },
  });

  const assessMutation = useMutation({
    mutationFn: (finalAnswers: string[]) =>
      assessFn({
        data: {
          ...baseInput(),
          answers: questions
            .map((q, i) => ({ question: q.question, answer: finalAnswers[i]?.trim() ?? "" }))
            .filter((a) => a.answer.length > 0),
        },
      }),
    onSuccess: () => setStage("result"),
  });

  const clarifyMutation = useMutation({
    mutationFn: (finalAnswers: string[]) =>
      clarifyFn({
        data: {
          ...baseInput(),
          answers: questions
            .map((q, i) => ({ question: q.question, answer: finalAnswers[i]?.trim() ?? "" }))
            .filter((a) => a.answer.length > 0),
        },
      }),
  });

  const result: Assessment | undefined = override ?? assessMutation.data;
  const isEmergency = result
    ? result.urgency === "emergency" ||
      result.urgency === "urgent" ||
      result.conditions.some((c) => c.riskLevel === "high")
    : false;

  // Emergency results are always recorded in the patient's history.
  useEffect(() => {
    if (!result || !isEmergency || savedId !== null) return;
    const top = topRisk(result);
    saveMutation.mutate({
      symptoms: symptoms.trim(),
      severity: top.likelihood,
      urgency: result.urgency,
      topCondition: top.name,
      summary: result.summary,
    });
    setSavedId("saved");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, isEmergency, savedId]);

  const answeredPairs = useMemo(
    () =>
      questions
        .map((q, i) => ({ question: q.question, answer: answers[i]?.trim() ?? "" }))
        .filter((a) => a.answer.length > 0),
    [questions, answers],
  );


  function submitAnswer(value: string) {
    const next = [...answers];
    next[step] = value;
    setAnswers(next);
    setDraft("");
    if (step + 1 < questions.length) {
      setStep(step + 1);
    } else {
      assessMutation.mutate(next);
    }
  }

  function reset() {
    setStage("intake");
    setQuestions([]);
    setAnswers([]);
    setStep(0);
    setDraft("");
    setSavedId(null);
    assessMutation.reset();
    questionsMutation.reset();
  }

  const error = (questionsMutation.error ?? assessMutation.error) as Error | null;

  return (
    <main className="min-h-screen bg-background">
      <ProfileMenu />
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 pr-14">

          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Stethoscope className="size-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t.brand}</p>
              <h1 className="font-display text-3xl leading-tight sm:text-4xl">{t.tagline}</h1>
            </div>
          </div>
          <div
            className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-secondary p-1"
            role="group"
            aria-label={t.langLabel}
          >
            {(["en", "bn"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {l === "en" ? "English" : "বাংলা"}
              </button>
            ))}
          </div>
        </header>

        <div className="space-y-6">

            {stage === "intake" && (
              <Card className="border-border/70 shadow-soft">
                <CardHeader>
                  <CardTitle className="font-display text-2xl font-normal">
                    {t.yourSymptoms}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="symptoms">{t.whatExperiencing}</Label>
                    <Textarea
                      id="symptoms"
                      rows={5}
                      placeholder={t.symptomsPlaceholder}
                      value={symptoms}
                      onChange={(e) => setSymptoms(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {EXAMPLES[lang].map((ex) => (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => setSymptoms(ex)}
                          className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration">{t.duration}</Label>
                    <Input
                      id="duration"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                    />
                  </div>



                  <Button
                    size="lg"
                    className="w-full"
                    disabled={symptoms.trim().length < 3 || questionsMutation.isPending}
                    onClick={() => questionsMutation.mutate()}
                  >
                    {questionsMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> {t.preparing}
                      </>
                    ) : (
                      <>
                        <MessageCircleQuestion className="mr-2 size-4" /> {t.continue}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {stage === "questions" && (
              <Card className="border-border/70 shadow-soft">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-2xl font-normal">
                    {t.askingQuestions}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t.questionsIntro}</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {t.questionOf(step + 1, questions.length)}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${((step + 1) / questions.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  <p className="font-display text-xl leading-snug">
                    {questions[step]?.question}
                  </p>
                  {questions[step]?.why ? (
                    <p className="text-sm text-muted-foreground">{questions[step]?.why}</p>
                  ) : null}

                  {(questions[step]?.options ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(questions[step]?.options ?? []).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={assessMutation.isPending}
                          onClick={() => submitAnswer(opt)}
                          className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  <Textarea
                    rows={3}
                    placeholder={t.answerPlaceholder}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={draft.trim().length === 0 || assessMutation.isPending}
                      onClick={() => submitAnswer(draft.trim())}
                    >
                      {assessMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" /> {t.analyzing}
                        </>
                      ) : step + 1 < questions.length ? (
                        t.next
                      ) : (
                        <>
                          <Activity className="mr-2 size-4" /> {t.analyze}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={assessMutation.isPending}
                      onClick={() => submitAnswer("")}
                    >
                      {t.skip}
                    </Button>
                    <Button variant="ghost" onClick={reset}>
                      {t.startOver}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error.message}
              </p>
            )}

            {stage === "result" && result && (
              <section className="space-y-6">
                <Card className="border-border/70 shadow-soft">
                  <CardContent className="space-y-3 pt-6">
                    <Badge
                      variant={isEmergency ? "destructive" : "secondary"}
                      className="uppercase tracking-wide"
                    >
                      {t.urgency[result.urgency]}
                    </Badge>
                    <p className="font-display text-xl leading-snug">{result.summary}</p>
                    <p className="text-sm text-muted-foreground">{result.urgencyReason}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openReport({
                            t,
                            lang,
                            assessment: result,
                            symptoms: symptoms.trim(),
                            answers: answeredPairs,
                            meta: { age, sex, duration, name: profileQuery.data?.name ?? "" },
                          })
                        }
                      >
                        <Download className="mr-2 size-4" /> {t.download}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={savedId !== null}
                        onClick={() => {
                          const top = topRisk(result);
                          saveMutation.mutate({
                            symptoms: symptoms.trim(),
                            severity: top.likelihood,
                            urgency: result.urgency,
                            topCondition: top.name,
                            summary: result.summary,
                          });
                          setSavedId("saved");
                        }}
                      >
                        <Save className="mr-2 size-4" />
                        {savedId ? t.saved : t.saveToHistory}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={reset}>
                        {t.startOver}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {isEmergency && <EmergencyHelp />}

                <div className="space-y-4">
                  <h2 className="font-display text-2xl">{t.possibleConditions}</h2>
                  {result.conditions.map((c) => (
                    <ConditionCard key={c.name} condition={c} />
                  ))}
                </div>

                {result.redFlags.length > 0 && (
                  <Card className="border-destructive/30 bg-destructive/5 shadow-soft">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base text-destructive">
                        <AlertTriangle className="size-4" /> {t.redFlags}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                        {result.redFlags.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-border/70">
                  <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
                    {result.generalAdvice}
                  </CardContent>
                </Card>
              </section>
            )}
        </div>


        <p className="mt-10 rounded-xl bg-secondary px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
          {t.disclaimer}
        </p>
      </div>
    </main>
  );
}

function ConditionCard({ condition: c }: { condition: Condition }) {
  const { t } = useLang();
  const cls = riskClasses(c.riskLevel);
  const riskWord =
    c.riskLevel === "high" ? t.highRisk : c.riskLevel === "moderate" ? t.moderateRisk : t.lowRisk;

  return (
    <Card className="border-border/70 shadow-soft">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-xl">{c.name}</h3>
          <span className={`text-sm font-medium ${cls.text}`}>
            {riskWord} {t.riskWord} · {Math.round(c.likelihood)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${cls.bg}`}
            style={{ width: `${Math.min(100, Math.max(0, c.likelihood))}%` }}
          />
        </div>

        <p className="text-sm leading-relaxed text-foreground/90">{c.explanation}</p>

        <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {t.whyThisRiskLevel}
          </p>
          <p className="mt-1 text-sm leading-relaxed">{c.riskRationale}</p>
        </div>

        {c.matchingSymptoms.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {t.matchingSymptoms}
            </p>
            <div className="flex flex-wrap gap-2">
              {c.matchingSymptoms.map((s) => (
                <Badge key={s} variant="outline">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {c.contributingFactors.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">
              {t.whyPrediction}
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 px-1 pt-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {t.contributingFactors}
              </p>
              {[...c.contributingFactors]
                .sort((a, b) => b.weight - a.weight)
                .map((f) => (
                  <div key={f.factor} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>{f.factor}</span>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(f.weight)}% · {f.effect}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          f.effect.toLowerCase().startsWith("decrease")
                            ? "bg-risk-low"
                            : "bg-primary"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, f.weight))}%` }}
                      />
                    </div>
                  </div>
                ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          <strong className="font-medium">{t.nextStep}:</strong> {c.nextSteps}
        </p>

        {c.riskLevel !== "high" && (c.selfCare.length > 0 || c.reliefCategories.length > 0) && (
          <div className="space-y-3 rounded-xl border border-border/70 px-3 py-3">
            {c.selfCare.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <HeartPulse className="size-3.5" /> {t.selfCareTitle}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                  {c.selfCare.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {c.reliefCategories.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  {t.otcTitle}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                  {c.reliefCategories.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs font-medium text-muted-foreground">{t.pharmacistNote}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
