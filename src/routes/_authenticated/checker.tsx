import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
  calculateHealthTrendScore,
  clarifyAnswers,
  getFollowUpQuestions,
  immediateEmergencyAssessment,
  type Assessment,
  type Condition,
  type FollowUpQuestion,
} from "@/lib/symptoms.functions";

import { LangContext, useLang, type Lang } from "@/lib/i18n";
import { topRisk } from "@/lib/history";
import { extractVitals } from "@/lib/vitals";
import { getProfile, saveCheck } from "@/lib/history.functions";
import { openReport } from "@/lib/report";
import { EmergencyHelp } from "@/components/EmergencyHelp";
import { ProfileMenu } from "@/components/ProfileMenu";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      {
        title: "Symptom Check — SymptomScope Patient Dashboard",
      },
      {
        name: "description",
        content:
          "Describe your symptoms, answer a few doctor-style follow-up questions, and get a plain-language symptom assessment with self-care guidance in English or Bengali.",
      },
      {
        property: "og:title",
        content:
          "Symptom Check — SymptomScope Patient Dashboard",
      },
      {
        property: "og:description",
        content:
          "Adaptive follow-up questions, explainable symptom assessment, symptom history and a doctor-ready PDF report.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
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
    "প্রস্রাবে জ্বালা ও কোমরে ব্যথা",
  ],
};

function riskClasses(level: Condition["riskLevel"]) {
  if (level === "high") {
    return {
      text: "text-risk-high",
      bg: "bg-risk-high",
    };
  }

  if (level === "moderate") {
    return {
      text: "text-risk-moderate",
      bg: "bg-risk-moderate",
    };
  }

  return {
    text: "text-risk-low",
    bg: "bg-risk-low",
  };
}

/**
 * Detect worsening only from patient-reported content.
 *
 * Question text is intentionally excluded.
 *
 * This is only used for the non-clinical health-condition trend
 * indicator. It is NOT used as a diagnosis or disease probability.
 */
function reportedWorsening(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  const worseningPatterns = [
    /\bgetting worse\b/i,
    /\bworse\b/i,
    /\bworst\b/i,
    /\bmore severe\b/i,
    /\bincreasing\b/i,
    /\bincreased\b/i,
    /\bprogressively\b/i,
    /\bdeteriorat/i,
    /\bdeclining\b/i,
    /\bdecline\b/i,

    /খারাপ হচ্ছে/,
    /খারাপ হয়েছে/,
    /বেশি খারাপ/,
    /ক্রমশ খারাপ/,
    /বাড়ছে/,
    /বেড়েছে/,
    /তীব্র হচ্ছে/,
    /তীব্র হয়েছে/,
    /অবনতি/,
  ];

  return worseningPatterns.some((pattern) =>
    pattern.test(normalized),
  );
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

  const [stage, setStage] =
    useState<Stage>("intake");

  const [questions, setQuestions] =
    useState<FollowUpQuestion[]>([]);

  const [answers, setAnswers] =
    useState<string[]>([]);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");

  const [override, setOverride] =
    useState<Assessment | null>(null);

  const [clarified, setClarified] =
    useState(false);

  /**
   * null = not saved yet
   *
   * actual UUID = successfully saved
   *
   * Never use a fake value such as "saved".
   */
  const [savedId, setSavedId] =
    useState<string | null>(null);

  const queryClient = useQueryClient();

  const saveFn =
    useServerFn(saveCheck);

  const profileFn =
    useServerFn(getProfile);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn({}),
  });

  const askFn =
    useServerFn(getFollowUpQuestions);

  const assessFn =
    useServerFn(assessSymptoms);

  const clarifyFn =
    useServerFn(clarifyAnswers);

  const age =
    profileQuery.data?.age ?? "";

  const sex =
    profileQuery.data?.sex ?? "";

  /**
   * Self-check input remains exactly the existing
   * self-check contract.
   *
   * Do NOT put patientProfile here.
   */
  const baseInput = () => ({
    symptoms: symptoms.trim(),
    age: age.trim() || undefined,
    sex: sex.trim() || undefined,
    duration:
      duration.trim() || undefined,
    language: lang,
  });

  /**
   * Only patient-reported content is passed to:
   *
   * - vital extraction
   * - worsening detection
   * - health-condition trend calculation
   *
   * Questions themselves are deliberately excluded.
   */
  function buildPatientReportedText() {
    return [
      symptoms.trim(),
      duration.trim(),
      ...answers
        .map((answer) => answer.trim())
        .filter(Boolean),
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Calculate the separate non-clinical health-condition
   * trend score.
   *
   * IMPORTANT:
   *
   * This score is NOT:
   * - disease probability
   * - diagnostic confidence
   * - Symptom Match Strength
   * - clinical risk percentage
   *
   * Higher score = better reported condition.
   * Lower score = worse reported condition.
   */
  function buildHealthTrendScore(
    assessment: Assessment,
  ): number {
    const patientReportedText =
      buildPatientReportedText();

    const worsening =
      reportedWorsening(
        patientReportedText,
      );

    return calculateHealthTrendScore({
      urgency: assessment.urgency,
      redFlagCount:
        assessment.redFlags.length,
      worsening,
    });
  }

  /**
   * Structured triage record stored with each saved check.
   *
   * `severity` remains the existing database-compatible
   * Symptom Match Strength value.
   *
   * `healthTrendScore` is a completely separate field.
   */
  function buildRecord(
    assessment: Assessment,
  ) {
    const top =
      topRisk(assessment);

    const pairs = questions
      .map((q, i) => ({
        question: q.question,
        answer:
          answers[i]?.trim() ?? "",
      }))
      .filter(
        (item) =>
          item.answer.length > 0,
      );

    const vitals =
      extractVitals(
        buildPatientReportedText(),
      ) as Record<string, number>;

    /**
     * Separate non-clinical trend score.
     *
     * This must never use condition.likelihood.
     */
    const healthTrendScore =
      buildHealthTrendScore(
        assessment,
      );

    return {
      symptoms:
        symptoms.trim(),

      /**
       * Existing database compatibility.
       *
       * This represents the strongest relative
       * Symptom Match Strength.
       *
       * It is NOT a probability.
       */
      severity:
        top.likelihood,

      /**
       * Separate health-condition trend indicator.
       *
       * Higher = better reported condition.
       * Lower = worse reported condition.
       *
       * NOT a clinical score.
       */
      healthTrendScore,

      urgency:
        assessment.urgency,

      topCondition:
        top.condition?.name ?? "",

      summary:
        assessment.summary,

      answers: pairs,

      redFlag:
        assessment.redFlags.length > 0,

      redFlags:
        assessment.redFlags,

      categories:
        assessment.conditions.map(
          (condition) =>
            condition.name,
        ),

      supportingFactors:
        assessment.conditions[0]
          ?.contributingFactors.map(
            (factor) => factor.factor,
          ) ?? [],

      vitals,

      uncertainty:
        `${assessment.confidence}${
          assessment.confidenceNote
            ? ` — ${assessment.confidenceNote}`
            : ""
        }`,

      nextStep:
        assessment.nextStep ?? "",
    };
  }

  /**
   * Emergency assessment happens before follow-up questions.
   *
   * This function is responsible only for actual
   * patient-reported warning signs.
   */
  function startCheck() {
    const input =
      baseInput();

    const emergency =
      immediateEmergencyAssessment(
        input,
      );

    if (emergency) {
      setOverride(emergency);
      setStage("result");
      return;
    }

    questionsMutation.mutate();
  }

  const questionsMutation =
    useMutation({
      mutationFn: () =>
        askFn({
          data: baseInput(),
        }),

      onSuccess: (qs) => {
        setQuestions(qs);

        setAnswers(
          new Array(qs.length).fill(
            "",
          ),
        );

        setStep(0);
        setDraft("");
        setStage("questions");
        setOverride(null);
        setSavedId(null);
        setClarified(false);
      },
    });

  const assessMutation =
    useMutation({
      mutationFn: (
        finalAnswers: string[],
      ) =>
        assessFn({
          data: {
            ...baseInput(),

            answers: questions
              .map((q, i) => ({
                question:
                  q.question,

                answer:
                  finalAnswers[
                    i
                  ]?.trim() ?? "",
              }))
              .filter(
                (item) =>
                  item.answer
                    .length > 0,
              ),
          },
        }),

      onSuccess: () => {
        setStage("result");
      },
    });

  const clarifyMutation =
    useMutation({
      mutationFn: (
        finalAnswers: string[],
      ) =>
        clarifyFn({
          data: {
            ...baseInput(),

            answers: questions
              .map((q, i) => ({
                question:
                  q.question,

                answer:
                  finalAnswers[
                    i
                  ]?.trim() ?? "",
              }))
              .filter(
                (item) =>
                  item.answer
                    .length > 0,
              ),
          },
        }),
    });

  const saveMutation =
    useMutation({
      mutationFn: (
        vars: ReturnType<
          typeof buildRecord
        >,
      ) =>
        saveFn({
          data: vars,
        }),

      onSuccess: (saved) => {
        /**
         * saveCheck should return
         * the inserted row/id.
         *
         * Never claim "Saved" before
         * actual mutation success.
         */
        const returnedId =
          typeof saved === "string"
            ? saved
            : saved?.id ?? null;

        if (returnedId) {
          setSavedId(
            returnedId,
          );
        }

        /**
         * Self history only.
         *
         * Patient history uses its
         * own patient-specific query key.
         */
        queryClient.invalidateQueries(
          {
            queryKey: [
              "checks",
            ],
          },
        );
      },
    });

  const result:
    | Assessment
    | undefined =
    override ??
    assessMutation.data;

  /**
   * Emergency and urgent are different states.
   *
   * High-risk condition is NOT automatically
   * classified as an emergency.
   */
  const isEmergency =
    result?.urgency ===
    "emergency";

  const isUrgent =
    result?.urgency ===
    "urgent";

  /**
   * Emergency results are automatically saved.
   *
   * Health trend score is generated as a separate
   * field during buildRecord().
   *
   * savedId is set ONLY after mutation success.
   */
  useEffect(() => {
    if (
      !result ||
      !isEmergency ||
      savedId !== null ||
      saveMutation.isPending
    ) {
      return;
    }

    saveMutation.mutate(
      buildRecord(result),
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    result,
    isEmergency,
    savedId,
    saveMutation.isPending,
  ]);

  const answeredPairs =
    useMemo(
      () =>
        questions
          .map((q, i) => ({
            question:
              q.question,

            answer:
              answers[i]?.trim() ??
              "",
          }))
          .filter(
            (item) =>
              item.answer
                .length > 0,
          ),
      [questions, answers],
    );

  function submitAnswer(
    value: string,
  ) {
    const next = [
      ...answers,
    ];

    next[step] = value;

    setAnswers(next);
    setDraft("");

    const pairs =
      questions
        .map((q, i) => ({
          question:
            q.question,

          answer:
            next[i]?.trim() ??
            "",
        }))
        .filter(
          (item) =>
            item.answer
              .length > 0,
        );

    /**
     * Emergency warning-sign detection gets
     * ONLY actual patient answers plus the
     * existing symptom input.
     *
     * Question text is not treated as symptoms.
     */
    const emergency =
      immediateEmergencyAssessment(
        {
          ...baseInput(),
          answers: pairs,
        },
      );

    if (emergency) {
      setOverride(emergency);
      setStage("result");
      return;
    }

    if (
      step + 1 <
      questions.length
    ) {
      setStep(step + 1);
      return;
    }

    /**
     * One clarification pass before
     * final assessment.
     */
    if (!clarified) {
      clarifyMutation.mutate(
        next,
        {
          onSuccess: (
            extra,
          ) => {
            setClarified(true);

            if (extra) {
              setQuestions([
                ...questions,
                extra,
              ]);

              setAnswers([
                ...next,
                "",
              ]);

              setStep(
                questions.length,
              );
            } else {
              assessMutation.mutate(
                next,
              );
            }
          },

          onError: () => {
            setClarified(true);

            assessMutation.mutate(
              next,
            );
          },
        },
      );

      return;
    }

    assessMutation.mutate(
      next,
    );
  }

  function reset() {
    setStage("intake");

    setQuestions([]);

    setAnswers([]);

    setStep(0);

    setDraft("");

    setSavedId(null);

    setOverride(null);

    setClarified(false);

    questionsMutation.reset();

    assessMutation.reset();

    clarifyMutation.reset();

    saveMutation.reset();
  }

  const busy =
    questionsMutation.isPending ||
    assessMutation.isPending ||
    clarifyMutation.isPending;

  const error =
    (questionsMutation.error ??
      assessMutation.error ??
      clarifyMutation.error ??
      saveMutation.error) as
      | Error
      | null;

  /**
   * Current result's separate health-condition
   * trend score.
   *
   * This is calculated only from the actual
   * patient-reported information.
   */
  const currentHealthTrendScore =
    result
      ? buildHealthTrendScore(
          result,
        )
      : null;

  return (
    <main
      className="min-h-screen bg-background"
      aria-busy={busy}
    >
      <ProfileMenu />

      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 pr-14">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Stethoscope className="size-5" />
            </span>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {t.brand}
              </p>

              <h1 className="font-display text-3xl leading-tight sm:text-4xl">
                {t.tagline}
              </h1>
            </div>
          </div>

          <div
            className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-secondary p-1"
            role="group"
            aria-label={t.langLabel}
          >
            {(
              ["en", "bn"] as Lang[]
            ).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() =>
                  setLang(l)
                }
                aria-pressed={
                  lang === l
                }
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {l === "en"
                  ? "English"
                  : "বাংলা"}
              </button>
            ))}
          </div>
        </header>

        <div className="space-y-6">
          {/* =========================
              INTAKE
             ========================= */}
          {stage ===
            "intake" && (
            <Card className="border-border/70 shadow-soft">
              <CardHeader>
                <CardTitle className="font-display text-2xl font-normal">
                  {t.yourSymptoms}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="symptoms">
                    {t.whatExperiencing}
                  </Label>

                  <Textarea
                    id="symptoms"
                    rows={5}
                    placeholder={
                      t.symptomsPlaceholder
                    }
                    value={symptoms}
                    onChange={(e) =>
                      setSymptoms(
                        e.target
                          .value,
                      )
                    }
                    aria-describedby="symptom-examples"
                  />

                  <div
                    id="symptom-examples"
                    className="flex flex-wrap gap-2 pt-1"
                  >
                    {EXAMPLES[
                      lang
                    ].map(
                      (
                        example,
                      ) => (
                        <button
                          key={
                            example
                          }
                          type="button"
                          onClick={() =>
                            setSymptoms(
                              example,
                            )
                          }
                          className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {
                            example
                          }
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">
                    {t.duration}
                  </Label>

                  <Input
                    id="duration"
                    value={duration}
                    onChange={(e) =>
                      setDuration(
                        e.target
                          .value,
                      )
                    }
                    placeholder={
                      lang ===
                      "bn"
                        ? "যেমন: ৩ দিন"
                        : "e.g. 3 days"
                    }
                  />
                </div>

                <Button
                  size="lg"
                  className="w-full"
                  disabled={
                    symptoms
                      .trim()
                      .length <
                      3 ||
                    questionsMutation.isPending
                  }
                  onClick={
                    startCheck
                  }
                >
                  {questionsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />

                      {
                        t.preparing
                      }
                    </>
                  ) : (
                    <>
                      <MessageCircleQuestion className="mr-2 size-4" />

                      {
                        t.continue
                      }
                    </>
                  )}
                </Button>

                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  {lang ===
                  "bn"
                    ? "এই মূল্যায়নটি তথ্য ও triage সহায়তা দেওয়ার জন্য। এটি নিশ্চিত রোগ নির্ণয় নয়।"
                    : "This assessment provides symptom and triage support. It is not a definitive diagnosis."}
                </p>
              </CardContent>
            </Card>
          )}

          {/* =========================
              FOLLOW-UP QUESTIONS
             ========================= */}
          {stage ===
            "questions" && (
            <Card className="border-border/70 shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-2xl font-normal">
                  {
                    t.askingQuestions
                  }
                </CardTitle>

                <p className="text-sm text-muted-foreground">
                  {
                    t.questionsIntro
                  }
                </p>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t.questionOf(
                      step + 1,
                      questions.length,
                    )}
                  </span>

                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${
                          questions.length
                            ? ((step +
                                1) /
                                questions.length) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div
                  aria-live="polite"
                  className="space-y-2"
                >
                  <p className="font-display text-xl leading-snug">
                    {
                      questions[
                        step
                      ]?.question
                    }
                  </p>

                  {questions[
                    step
                  ]?.why ? (
                    <p className="text-sm text-muted-foreground">
                      {
                        questions[
                          step
                        ]?.why
                      }
                    </p>
                  ) : null}
                </div>

                {(
                  questions[
                    step
                  ]?.options ??
                  []
                ).length >
                  0 && (
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Answer options"
                  >
                    {(
                      questions[
                        step
                      ]?.options ??
                      []
                    ).map(
                      (
                        option,
                      ) => (
                        <button
                          key={
                            option
                          }
                          type="button"
                          disabled={
                            busy
                          }
                          onClick={() =>
                            submitAnswer(
                              option,
                            )
                          }
                          className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {
                            option
                          }
                        </button>
                      ),
                    )}
                  </div>
                )}

                <Textarea
                  rows={3}
                  placeholder={
                    t.answerPlaceholder
                  }
                  value={draft}
                  onChange={(e) =>
                    setDraft(
                      e.target
                        .value,
                    )
                  }
                  disabled={busy}
                  aria-label="Your answer"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      draft
                        .trim()
                        .length ===
                        0 ||
                      busy
                    }
                    onClick={() =>
                      submitAnswer(
                        draft.trim(),
                      )
                    }
                  >
                    {busy ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />

                        {clarifyMutation.isPending
                          ? t.checkingAnswers
                          : t.analyzing}
                      </>
                    ) : step +
                        1 <
                      questions.length ? (
                      t.next
                    ) : (
                      <>
                        <Activity className="mr-2 size-4" />

                        {
                          t.analyze
                        }
                      </>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      submitAnswer(
                        "",
                      )
                    }
                  >
                    {t.skip}
                  </Button>

                  <Button
                    variant="ghost"
                    disabled={
                      busy
                    }
                    onClick={
                      reset
                    }
                  >
                    {
                      t.startOver
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* =========================
              ERROR
             ========================= */}
          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex gap-3 pt-5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />

                <div className="space-y-1">
                  <p className="font-medium text-destructive">
                    {lang ===
                    "bn"
                      ? "মূল্যায়ন সম্পূর্ণ করা যায়নি"
                      : "The assessment could not be completed"}
                  </p>

                  <p className="text-sm text-destructive/90">
                    {
                      error.message
                    }
                  </p>

                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      if (
                        stage ===
                        "questions"
                      ) {
                        questionsMutation.reset();

                        assessMutation.reset();

                        clarifyMutation.reset();
                      }
                    }}
                  >
                    {lang ===
                    "bn"
                      ? "আবার চেষ্টা করুন"
                      : "Try again"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* =========================
              RESULT
             ========================= */}
          {stage ===
            "result" &&
            result && (
              <section
                className="space-y-6"
                aria-live="polite"
              >
                {/* Primary result */}
                <Card
                  className={`border-border/70 shadow-soft ${
                    isEmergency
                      ? "border-destructive/50"
                      : isUrgent
                        ? "border-risk-high/40"
                        : ""
                  }`}
                >
                  <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Badge
                        variant={
                          isEmergency
                            ? "destructive"
                            : isUrgent
                              ? "destructive"
                              : "secondary"
                        }
                        className="uppercase tracking-wide"
                      >
                        {
                          t.urgency[
                            result
                              .urgency
                          ]
                        }
                      </Badge>

                      <span className="text-xs text-muted-foreground">
                        {lang ===
                        "bn"
                          ? "লক্ষণভিত্তিক মূল্যায়ন"
                          : "Symptom-based assessment"}
                      </span>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                        {isEmergency ? (
                          <AlertTriangle className="size-5 text-destructive" />
                        ) : (
                          <HeartPulse className="size-5 text-primary" />
                        )}
                      </span>

                      <div className="min-w-0">
                        <p className="font-display text-xl leading-snug">
                          {
                            result.summary
                          }
                        </p>

                        <p className="mt-2 text-sm text-muted-foreground">
                          {
                            result.urgencyReason
                          }
                        </p>
                      </div>
                    </div>

                    {/* Confidence */}
                    <div className="rounded-lg bg-secondary/70 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        <span className="uppercase tracking-[0.14em]">
                          {
                            t.confidenceLabel
                          }
                          :
                        </span>{" "}
                        {
                          t.confidence[
                            result
                              .confidence
                          ]
                        }

                        {result.confidenceNote
                          ? ` — ${result.confidenceNote}`
                          : ""}
                      </p>
                    </div>

                    {/* Missing information */}
                    {result
                      .missingInfo
                      .length >
                      0 && (
                      <div className="rounded-lg bg-secondary px-3 py-3 text-xs text-secondary-foreground">
                        <p className="mb-1 font-medium">
                          {
                            t.missingInfoTitle
                          }
                        </p>

                        <ul className="list-disc space-y-0.5 pl-4">
                          {result.missingInfo.map(
                            (
                              missing,
                            ) => (
                              <li
                                key={
                                  missing
                                }
                              >
                                {
                                  missing
                                }
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openReport({
                            t,
                            lang,
                            assessment:
                              result,
                            symptoms:
                              symptoms.trim(),
                            answers:
                              answeredPairs,
                            meta: {
                              age,
                              sex,
                              duration,
                              name:
                                profileQuery
                                  .data
                                  ?.name ??
                                "",
                            },
                          })
                        }
                      >
                        <Download className="mr-2 size-4" />

                        {
                          t.download
                        }
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          savedId !==
                            null ||
                          saveMutation.isPending
                        }
                        onClick={() => {
                          if (
                            !result ||
                            savedId !==
                              null ||
                            saveMutation.isPending
                          ) {
                            return;
                          }

                          saveMutation.mutate(
                            buildRecord(
                              result,
                            ),
                          );
                        }}
                      >
                        {saveMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />

                            {lang ===
                            "bn"
                              ? "সংরক্ষণ হচ্ছে…"
                              : "Saving…"}
                          </>
                        ) : savedId ? (
                          <>
                            <Save className="mr-2 size-4" />

                            {lang ===
                            "bn"
                              ? "সংরক্ষিত"
                              : "Saved"}
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 size-4" />

                            {lang ===
                            "bn"
                              ? "ইতিহাসে সংরক্ষণ"
                              : "Save to history"}
                          </>
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={
                          reset
                        }
                      >
                        {
                          t.startOver
                        }
                      </Button>
                    </div>

                    {saveMutation.isError && (
                      <p className="text-xs text-destructive">
                        {lang ===
                        "bn"
                          ? "ইতিহাসে সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"
                          : "Could not save this assessment to history. Please try again."}
                      </p>
                    )}

                    {savedId && (
                      <p className="text-xs text-muted-foreground">
                        {lang ===
                        "bn"
                          ? "এই assessment সফলভাবে history-তে সংরক্ষিত হয়েছে।"
                          : "This assessment was successfully saved to your history."}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* =========================
                    HEALTH CONDITION TREND
                   ========================= */}
                {currentHealthTrendScore !==
                  null && (
                  <Card className="border-border/70 shadow-soft">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 font-display text-xl font-normal">
                        <HeartPulse className="size-5 text-primary" />

                        {lang ===
                        "bn"
                          ? "বর্তমান Health Condition Trend"
                          : "Current Health Condition Trend"}
                      </CardTitle>

                      <p className="text-sm text-muted-foreground">
                        {lang ===
                        "bn"
                          ? "এই ০–১০০ score আপনার এই check-এ reported condition-এর একটি non-clinical trend indicator। বেশি score তুলনামূলকভাবে ভালো reported condition এবং কম score তুলনামূলকভাবে খারাপ reported condition বোঝায়। এটি diagnosis বা risk percentage নয়।"
                          : "This 0–100 score is a non-clinical trend indicator based on what was reported in this check. A higher score indicates a better reported condition and a lower score indicates a worse reported condition. It is not a diagnosis or risk percentage."}
                      </p>
                    </CardHeader>

                    <CardContent>
                      <div className="flex items-center gap-4">
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${currentHealthTrendScore}%`,
                            }}
                          />
                        </div>

                        <span className="min-w-12 text-right text-lg font-semibold text-primary">
                          {
                            currentHealthTrendScore
                          }
                        </span>
                      </div>

                      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span>
                          {lang ===
                          "bn"
                            ? "খারাপ reported condition"
                            : "Worse reported condition"}
                        </span>

                        <span>
                          {lang ===
                          "bn"
                            ? "ভালো reported condition"
                            : "Better reported condition"}
                        </span>
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {lang ===
                        "bn"
                          ? "পরবর্তী check-এ এই score বাড়লে graph উপরে উঠবে এবং কমলে graph নিচে নামবে। এটি validated clinical health score নয়।"
                          : "In later checks, a higher score will move the trend graph upward and a lower score will move it downward. This is not a validated clinical health score."}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Emergency */}
                {isEmergency && (
                  <EmergencyHelp />
                )}

                {/* Urgent but not emergency */}
                {isUrgent &&
                  !isEmergency && (
                    <Card className="border-risk-high/30 bg-risk-high/5">
                      <CardContent className="flex gap-3 pt-5">
                        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-risk-high" />

                        <div>
                          <p className="font-medium">
                            {lang ===
                            "bn"
                              ? "দ্রুত চিকিৎসা পরামর্শ নেওয়া উপযুক্ত"
                              : "Prompt medical attention may be appropriate"}
                          </p>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {lang ===
                            "bn"
                              ? "এটি emergency হিসেবে চিহ্নিত নয়, তবে উপসর্গের কারণে দ্রুত একজন healthcare professional-এর পরামর্শ নেওয়া ভালো।"
                              : "This is not classified as an emergency, but the symptoms may warrant prompt review by a healthcare professional."}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                {/* =========================
                    SYMPTOM MATCH STRENGTH
                   ========================= */}
                {result.conditions
                  .length >
                  0 && (
                  <Card className="border-border/70 shadow-soft">
                    <CardHeader>
                      <CardTitle className="font-display text-xl font-normal">
                        {lang ===
                        "bn"
                          ? "সম্ভাব্য মিল"
                          : "Symptom Match Strength"}
                      </CardTitle>

                      <p className="text-sm text-muted-foreground">
                        {lang ===
                        "bn"
                          ? "এগুলো আপনার উপসর্গের সঙ্গে কতটা মিল রয়েছে তার একটি আপেক্ষিক score। এটি রোগ হওয়ার probability নয়।"
                          : "These scores describe relative symptom-match strength. They are not calibrated probabilities of having a disease."}
                      </p>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {result.conditions.map(
                        (
                          condition,
                          index,
                        ) => {
                          const classes =
                            riskClasses(
                              condition.riskLevel,
                            );

                          const score =
                            Math.max(
                              0,
                              Math.min(
                                100,
                                Math.round(
                                  condition.likelihood,
                                ),
                              ),
                            );

                          return (
                            <Collapsible
                              key={`${condition.name}-${index}`}
                              defaultOpen={
                                index ===
                                0
                              }
                            >
                              <div className="rounded-xl border border-border/70 p-4">
                                <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 text-left">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium">
                                        {
                                          condition.name
                                        }
                                      </p>

                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] uppercase"
                                      >
                                        {
                                          condition.riskLevel
                                        }
                                      </Badge>
                                    </div>

                                    <div className="mt-3 flex items-center gap-3">
                                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                        <div
                                          className={`h-full rounded-full ${classes.bg}`}
                                          style={{
                                            width: `${score}%`,
                                          }}
                                        />
                                      </div>

                                      <span
                                        className={`text-sm font-semibold ${classes.text}`}
                                      >
                                        {
                                          score
                                        }
                                      </span>
                                    </div>

                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {lang ===
                                      "bn"
                                        ? "ম্যাচ strength"
                                        : "match strength"}
                                    </p>
                                  </div>

                                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform" />
                                </CollapsibleTrigger>

                                <CollapsibleContent className="pt-4">
                                  <div className="space-y-4 text-sm">
                                    {condition
                                      .contributingFactors
                                      ?.length >
                                      0 && (
                                      <div>
                                        <p className="mb-1 font-medium">
                                          {lang ===
                                          "bn"
                                            ? "যে বিষয়গুলো মিলছে"
                                            : "Supporting factors"}
                                        </p>

                                        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                          {condition.contributingFactors.map(
                                            (
                                              factor,
                                            ) => (
                                              <li
                                                key={
                                                  factor.factor
                                                }
                                              >
                                                {
                                                  factor.factor
                                                }

                                                {factor.effect
                                                  ? ` — ${factor.effect}`
                                                  : ""}
                                              </li>
                                            ),
                                          )}
                                        </ul>
                                      </div>
                                    )}

                                    {condition.contributingFactors.some(
                                      (
                                        factor,
                                      ) =>
                                        factor.weight <
                                        0,
                                    ) && (
                                      <div>
                                        <p className="mb-1 font-medium">
                                          {lang ===
                                          "bn"
                                            ? "যে বিষয়গুলো এই মিলকে কমায়"
                                            : "Factors reducing the match"}
                                        </p>

                                        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                          {condition.contributingFactors
                                            .filter(
                                              (
                                                factor,
                                              ) =>
                                                factor.weight <
                                                0,
                                            )
                                            .map(
                                              (
                                                factor,
                                              ) => (
                                                <li
                                                  key={
                                                    factor.factor
                                                  }
                                                >
                                                  {
                                                    factor.factor
                                                  }

                                                  {factor.effect
                                                    ? ` — ${factor.effect}`
                                                    : ""}
                                                </li>
                                              ),
                                            )}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        },
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Next step */}
                {result.nextStep && (
                  <Card className="border-border/70 shadow-soft">
                    <CardHeader>
                      <CardTitle className="font-display text-xl font-normal">
                        {lang ===
                        "bn"
                          ? "পরবর্তী পদক্ষেপ"
                          : "Next step"}
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {
                          result.nextStep
                        }
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Self-care */}
                {result.selfCare
                  ?.length >
                  0 && (
                  <Card className="border-border/70 shadow-soft">
                    <CardHeader>
                      <CardTitle className="font-display text-xl font-normal">
                        {lang ===
                        "bn"
                          ? "নিজের যত্ন"
                          : "Self-care"}
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                        {result.selfCare.map(
                          (
                            item,
                          ) => (
                            <li
                              key={
                                item
                              }
                            >
                              {
                                item
                              }
                            </li>
                          ),
                        )}
                      </ul>

                      <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
                        {lang ===
                        "bn"
                          ? "নির্ধারিত ওষুধ নিজে থেকে বন্ধ, শুরু, কমানো বা বাড়ানো উচিত নয়। ওষুধ সংক্রান্ত পরিবর্তনের আগে চিকিৎসকের পরামর্শ নিন।"
                          : "Do not stop, start, increase, or decrease a prescribed medicine on your own. Discuss medication changes with a clinician."}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Red flags */}
                {result.redFlags
                  .length >
                  0 && (
                  <Card className="border-destructive/30 bg-destructive/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 font-display text-xl font-normal text-destructive">
                        <AlertTriangle className="size-5" />

                        {lang ===
                        "bn"
                          ? "সতর্কতার লক্ষণ"
                          : "Warning signs"}
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
                        {result.redFlags.map(
                          (
                            flag,
                          ) => (
                            <li
                              key={
                                flag
                              }
                            >
                              {
                                flag
                              }
                            </li>
                          ),
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Disclaimer */}
                <Card className="border-border/50 bg-muted/30">
                  <CardContent className="pt-5">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {lang ===
                      "bn"
                        ? "গুরুত্বপূর্ণ: SymptomScope কোনো নিশ্চিত রোগ নির্ণয় করে না। ফলাফল উপসর্গের তথ্যের ভিত্তিতে একটি decision-support ও triage assessment। Health Condition Trend একটি non-clinical trend indicator; এটি কোনো validated medical score বা risk percentage নয়। গুরুতর, দ্রুত খারাপ হওয়া বা উদ্বেগজনক উপসর্গ থাকলে healthcare professional-এর পরামর্শ নিন।"
                        : "Important: SymptomScope does not provide a definitive diagnosis. Results are decision-support and triage assessments based on the information provided. The Health Condition Trend is a non-clinical trend indicator, not a validated medical score or risk percentage. Seek professional medical care for severe, rapidly worsening, or concerning symptoms."}
                    </p>
                  </CardContent>
                </Card>
              </section>
            )}
        </div>
      </div>
    </main>
  );
}