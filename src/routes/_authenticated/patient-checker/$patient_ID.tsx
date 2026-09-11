import {
  createFileRoute,
  Link,
  redirect,
} from "@tanstack/react-router";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useServerFn } from "@tanstack/react-start";

import { useMemo, useState } from "react";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HeartPulse,
  Info,
  Loader2,
  MessageCircleQuestion,
  Save,
  ShieldAlert,
  Stethoscope,
  UserRound,
} from "lucide-react";

import {
  assessPatientSymptoms,
  getPatientFollowUpQuestions,
  immediateEmergencyAssessment,
  type Assessment,
  type FollowUpQuestion,
} from "@/lib/symptoms.functions";

import { getPatient } from "@/lib/profile.functions";

import { saveCheck } from "@/lib/history.functions";

import { extractVitals } from "@/lib/vitals";

import { useLang } from "@/lib/i18n";

import { ProfileMenu } from "@/components/ProfileMenu";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Textarea } from "@/components/ui/textarea";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Progress } from "@/components/ui/progress";

import { Separator } from "@/components/ui/separator";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

/* -------------------------------------------------------------------------- */
/*                                  ROUTE                                     */
/* -------------------------------------------------------------------------- */

export const Route = createFileRoute(
  "/_authenticated/patient-checker/$patient_ID",
)({
  ssr: false,

  beforeLoad: async ({ params }) => {
    if (!params.patient_ID) {
      throw redirect({
        to: "/patients",
      });
    }

    return {
      patientId: params.patient_ID,
    };
  },

  component: PatientSymptomCheckerPage,
});

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */

type Stage =
  | "intake"
  | "questions"
  | "result";

type Answer = {
  question: string;
  answer: string;
};

/* -------------------------------------------------------------------------- */
/*                                HELPERS                                     */
/* -------------------------------------------------------------------------- */

function clampMatchStrength(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value),
    ),
  );
}

function topCondition(
  assessment: Assessment | null,
) {
  if (
    !assessment?.conditions?.length
  ) {
    return null;
  }

  return (
    [...assessment.conditions].sort(
      (a, b) =>
        clampMatchStrength(
          b.likelihood,
        ) -
        clampMatchStrength(
          a.likelihood,
        ),
    )[0] ?? null
  );
}

function formatUrgency(
  urgency: Assessment["urgency"],
) {
  switch (urgency) {
    case "emergency":
      return "Emergency";

    case "urgent":
      return "Urgent";

    case "see-a-doctor":
      return "See a doctor";

    default:
      return "Self-care";
  }
}

function urgencyClass(
  urgency: Assessment["urgency"],
) {
  switch (urgency) {
    case "emergency":
      return "border-destructive/50 bg-destructive/10 text-destructive";

    case "urgent":
      return "border-orange-500/30 bg-orange-500/10 text-orange-300";

    case "see-a-doctor":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";

    default:
      return "border-primary/30 bg-primary/10 text-primary";
  }
}

function riskClass(
  risk: string,
) {
  const value =
    risk.toLowerCase();

  if (
    value.includes("high") ||
    value.includes("উচ্চ")
  ) {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }

  if (
    value.includes("moderate") ||
    value.includes("medium") ||
    value.includes("মধ্যম")
  ) {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  }

  return "border-primary/30 bg-primary/10 text-primary";
}

/* -------------------------------------------------------------------------- */
/*                         PATIENT SYMPTOM CHECKER                            */
/* -------------------------------------------------------------------------- */

function PatientSymptomCheckerPage() {
  const {
    patient_ID: patientId,
  } = Route.useParams();

  const queryClient =
    useQueryClient();

  /* ---------------------------------------------------------------------- */
  /*                              LANGUAGE                                  */
  /* ---------------------------------------------------------------------- */

  const langState = useLang() as {
    lang?: "en" | "bn";
    language?: "en" | "bn";
  };

  const language =
    langState.lang ??
    langState.language ??
    "en";

  /* ---------------------------------------------------------------------- */
  /*                         SERVER FUNCTIONS                                */
  /* ---------------------------------------------------------------------- */

  const getPatientFn =
    useServerFn(getPatient);

  const questionsFn =
    useServerFn(
      getPatientFollowUpQuestions,
    );

  const immediateAssessmentFn =
    useServerFn(
      immediateEmergencyAssessment,
    );

  const assessmentFn =
    useServerFn(
      assessPatientSymptoms,
    );

  const saveCheckFn =
    useServerFn(saveCheck);

  /* ---------------------------------------------------------------------- */
  /*                              PATIENT QUERY                              */
  /* ---------------------------------------------------------------------- */

  const patientQuery =
    useQuery({
      queryKey: [
        "patient",
        patientId,
      ],

      queryFn: () =>
        getPatientFn({
          data: {
            id: patientId,
          },
        }),
    });

  const patient =
    patientQuery.data;

  /* ---------------------------------------------------------------------- */
  /*                                  STATE                                  */
  /* ---------------------------------------------------------------------- */

  const [stage, setStage] =
    useState<Stage>(
      "intake",
    );

  const [symptoms, setSymptoms] =
    useState("");

  const [duration, setDuration] =
    useState("");

  const [questions, setQuestions] =
    useState<
      FollowUpQuestion[]
    >([]);

  const [answers, setAnswers] =
    useState<Answer[]>([]);

  const [
    currentAnswer,
    setCurrentAnswer,
  ] = useState("");

  const [step, setStep] =
    useState(0);

  const [
    assessment,
    setAssessment,
  ] =
    useState<Assessment | null>(
      null,
    );

  const [savedId, setSavedId] =
    useState<string | null>(
      null,
    );

  const [saveError, setSaveError] =
    useState<string | null>(
      null,
    );

  const [formError, setFormError] =
    useState<string | null>(
      null,
    );

  /* ---------------------------------------------------------------------- */
  /*                         BASE PATIENT INPUT                              */
  /* ---------------------------------------------------------------------- */

  const baseInput =
    useMemo(
      () => ({
        patientId,
        symptoms:
          symptoms.trim(),
        duration:
          duration.trim() ||
          undefined,
        language,
      }),
      [
        patientId,
        symptoms,
        duration,
        language,
      ],
    );

  /* ---------------------------------------------------------------------- */
  /*                         CURRENT QUESTION                                */
  /* ---------------------------------------------------------------------- */

  const currentQuestion =
    questions[step] ?? null;

  const questionProgress =
    questions.length > 0
      ? Math.round(
          ((step + 1) /
            questions.length) *
            100,
        )
      : 0;

  /* ---------------------------------------------------------------------- */
  /*                         IMMEDIATE SAFETY                                */
  /* ---------------------------------------------------------------------- */

  /*
   * IMPORTANT:
   *
   * immediateEmergencyAssessment() is the generic
   * immediate safety screen.
   *
   * It must NOT receive patientId because patientId
   * is not part of the generic ContextInput schema.
   *
   * Patient-specific background is handled by the
   * patient assessment functions on the server.
   */

  const immediateMutation =
    useMutation({
      mutationFn: (input: {
        symptoms: string;
        duration?: string;
        language: "en" | "bn";
        answers?: Answer[];
      }) =>
        immediateAssessmentFn({
          data: input,
        }),
    });

  /* ---------------------------------------------------------------------- */
  /*                         FOLLOW-UP QUESTIONS                             */
  /* ---------------------------------------------------------------------- */

  const questionsMutation =
    useMutation({
      mutationFn: () =>
        questionsFn({
          data: baseInput,
        }),
    });

  /* ---------------------------------------------------------------------- */
  /*                              ASSESSMENT                                 */
  /* ---------------------------------------------------------------------- */

  const assessmentMutation =
    useMutation({
      mutationFn: (
        input: {
          answers: Answer[];
        },
      ) =>
        assessmentFn({
          data: {
            ...baseInput,
            answers:
              input.answers,
          },
        }),

      onSuccess: (
        result,
      ) => {
        setAssessment(
          result,
        );

        setStage(
          "result",
        );

        setFormError(
          null,
        );
      },
    });

  /* ---------------------------------------------------------------------- */
  /*                                  SAVE                                   */
  /* ---------------------------------------------------------------------- */

  const saveMutation =
    useMutation({
      mutationFn: (
        result: Assessment,
      ) => {
        const top =
          topCondition(
            result,
          );

        const answerPairs =
          answers.map(
            (item) => ({
              question:
                item.question,
              answer:
                item.answer,
            }),
          );

        /*
         * IMPORTANT:
         *
         * Only patient-reported information is passed
         * to extractVitals().
         *
         * Question text is deliberately excluded.
         */
        const patientReportedText =
          [
            symptoms,
            duration,
            ...answerPairs.map(
              (item) =>
                item.answer,
            ),
          ]
            .filter(Boolean)
            .join("\n");

        const vitals =
          extractVitals(
            patientReportedText,
          );

        /*
         * IMPORTANT:
         *
         * The current history SaveCheck schema expects
         * severity in the 1–10 range.
         *
         * Therefore we DO NOT put the 0–100 symptom
         * match strength into severity here.
         *
         * Match strength remains part of the assessment
         * and is displayed as a percentage.
         *
         * Use a safe default of 1 for the history field.
         */
        return saveCheckFn({
          data: {
            symptoms:
              symptoms.trim(),

            duration:
              duration.trim() ||
              null,

            severity: 1,

            urgency:
              result.urgency,

            topCondition:
              top?.name ??
              "No specific condition identified",

            summary:
              result.summary,

            assessment:
              result,

            answers:
              answerPairs,

            vitals,

            subjectType:
              "patient",

            patientId,
          },
        });
      },

      onSuccess: (
        saved,
      ) => {
        /*
         * Always use the actual database ID.
         */
        setSavedId(
          saved?.id ??
            null,
        );

        setSaveError(
          null,
        );

        queryClient.invalidateQueries(
          {
            queryKey: [
              "patient-checks",
              patientId,
            ],
          },
        );
      },

      onError: (
        error,
      ) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Could not save this symptom check.",
        );
      },
    });

  /* ---------------------------------------------------------------------- */
  /*                            START CHECK                                  */
  /* ---------------------------------------------------------------------- */

  async function startCheck() {
    setFormError(
      null,
    );

    const cleanSymptoms =
      symptoms.trim();

    if (
      cleanSymptoms.length <
      3
    ) {
      setFormError(
        "Please describe at least one symptom before continuing.",
      );

      return;
    }

    if (!patient) {
      setFormError(
        "Patient profile could not be loaded.",
      );

      return;
    }

    /*
     * First perform immediate safety screening.
     *
     * No question text is included.
     */
    try {
      const emergencyResult =
        await immediateMutation.mutateAsync(
          {
            symptoms:
              cleanSymptoms,

            duration:
              duration.trim() ||
              undefined,

            language,
          },
        );

      /*
       * ONLY "emergency" is emergency.
       *
       * "urgent" remains a separate urgency level.
       */
      if (
        emergencyResult?.urgency ===
        "emergency"
      ) {
        setAssessment(
          emergencyResult,
        );

        setStage(
          "result",
        );

        return;
      }
    } catch {
      /*
       * The immediate safety screen must not prevent
       * the patient-specific assessment from running
       * if the separate safety request fails.
       */
    }

    /* ------------------------------------------------------------------ */
    /*                       ADAPTIVE QUESTIONS                            */
    /* ------------------------------------------------------------------ */

    try {
      const result =
        await questionsMutation.mutateAsync();

      const nextQuestions =
        result?.questions ??
        [];

      if (
        nextQuestions.length ===
        0
      ) {
        await assessmentMutation.mutateAsync(
          {
            answers: [],
          },
        );

        return;
      }

      setQuestions(
        nextQuestions.slice(
          0,
          6,
        ),
      );

      setAnswers([]);

      setCurrentAnswer(
        "",
      );

      setStep(0);

      setStage(
        "questions",
      );
    } catch (
      error,
    ) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not prepare the follow-up questions. Please try again.",
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /*                         SUBMIT QUESTION                                 */
  /* ---------------------------------------------------------------------- */

  async function submitAnswer() {
    if (
      !currentQuestion
    ) {
      return;
    }

    const cleanAnswer =
      currentAnswer.trim();

    if (
      !cleanAnswer
    ) {
      setFormError(
        "Please answer the question before continuing.",
      );

      return;
    }

    setFormError(
      null,
    );

    const nextAnswers =
      [
        ...answers,
        {
          question:
            currentQuestion.question,
          answer:
            cleanAnswer,
        },
      ];

    /*
     * Immediate safety screen.
     *
     * Only the symptom text + patient's actual answer
     * are sent.
     */
    try {
      const safetyResult =
        await immediateMutation.mutateAsync(
          {
            symptoms:
              symptoms.trim(),

            duration:
              duration.trim() ||
              undefined,

            language,

            answers:
              nextAnswers,
          },
        );

      if (
        safetyResult?.urgency ===
        "emergency"
      ) {
        setAnswers(
          nextAnswers,
        );

        setAssessment(
          safetyResult,
        );

        setStage(
          "result",
        );

        return;
      }
    } catch {
      /*
       * Continue to the normal patient assessment
       * if the separate safety request fails.
       */
    }

    /* ------------------------------------------------------------------ */
    /*                       MORE QUESTIONS                               */
    /* ------------------------------------------------------------------ */

    if (
      step <
      questions.length - 1
    ) {
      setAnswers(
        nextAnswers,
      );

      setStep(
        (value) =>
          value + 1,
      );

      setCurrentAnswer(
        "",
      );

      return;
    }

    /* ------------------------------------------------------------------ */
    /*                       FINAL ASSESSMENT                              */
    /* ------------------------------------------------------------------ */

    setAnswers(
      nextAnswers,
    );

    try {
      await assessmentMutation.mutateAsync(
        {
          answers:
            nextAnswers,
        },
      );
    } catch (
      error,
    ) {
      setFormError(
        error instanceof Error
          ? error.message
          : "The symptom assessment could not be completed. Please try again.",
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /*                              SAVE RESULT                                */
  /* ---------------------------------------------------------------------- */

  function saveResult() {
    if (
      !assessment ||
      saveMutation.isPending ||
      savedId
    ) {
      return;
    }

    saveMutation.mutate(
      assessment,
    );
  }

  /* ---------------------------------------------------------------------- */
  /*                                  RESET                                  */
  /* ---------------------------------------------------------------------- */

  function resetCheck() {
    setStage(
      "intake",
    );

    setSymptoms("");

    setDuration("");

    setQuestions([]);

    setAnswers([]);

    setCurrentAnswer(
      "",
    );

    setStep(0);

    setAssessment(
      null,
    );

    setSavedId(
      null,
    );

    setSaveError(
      null,
    );

    setFormError(
      null,
    );
  }

  /* ---------------------------------------------------------------------- */
  /*                           LOADING PATIENT                               */
  /* ---------------------------------------------------------------------- */

  if (
    patientQuery.isLoading
  ) {
    return (
      <main className="min-h-screen bg-background">
        <ProfileMenu />

        <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center px-5">
          <div
            className="flex items-center gap-3 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Loader2 className="size-5 animate-spin" />

            Loading patient profile…
          </div>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*                         PATIENT NOT FOUND                               */
  /* ---------------------------------------------------------------------- */

  if (
    patientQuery.isError ||
    !patient
  ) {
    return (
      <main className="min-h-screen bg-background">
        <ProfileMenu />

        <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
          <Button
            asChild
            variant="ghost"
            size="sm"
          >
            <Link to="/patients">
              <ArrowLeft className="mr-2 size-4" />

              Back to Patients
            </Link>
          </Button>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>
                Patient profile not found
              </CardTitle>

              <CardDescription>
                This patient may have
                been deleted or may
                not belong to your
                account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Button asChild>
                <Link to="/patients">
                  Go to Patients
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*                                  MAIN                                   */
  /* ---------------------------------------------------------------------- */

  return (
    <main className="min-h-screen bg-background">
      <ProfileMenu />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:py-12">

        {/* ---------------------------------------------------------------- */}
        {/* BACK                                                              */}
        {/* ---------------------------------------------------------------- */}

        <div>
          <Button
            asChild
            variant="ghost"
            size="sm"
          >
            <Link
              to="/patient-history/$patient_ID"
              params={{
                patient_ID:
                  patientId,
              }}
            >
              <ArrowLeft className="mr-2 size-4" />

              Back to{" "}
              {patient.name}'s History
            </Link>
          </Button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* PATIENT HEADER                                                    */}
        {/* ---------------------------------------------------------------- */}

        <section className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="size-6" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">
              Patient Symptom Checker
            </p>

            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {patient.name}
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              {[
                patient.age,
                patient.sex,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SEPARATION NOTICE                                                 */}
        {/* ---------------------------------------------------------------- */}

        <div className="rounded-xl border bg-muted/40 px-4 py-3">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />

            <p className="text-sm leading-6 text-muted-foreground">
              This symptom check is
              being performed
              specifically for{" "}
              <span className="font-medium text-foreground">
                {patient.name}
              </span>
              . Their profile and
              symptom history are
              kept separate from
              your own self-check
              history.
            </p>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* PROGRESS                                                          */}
        {/* ---------------------------------------------------------------- */}

        {stage ===
          "questions" && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium">
                  Follow-up questions
                </span>

                <span className="text-muted-foreground">
                  {step + 1} /{" "}
                  {questions.length}
                </span>
              </div>

              <Progress
                value={
                  questionProgress
                }
                className="mt-3"
              />
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* GLOBAL ERROR                                                      */}
        {/* ---------------------------------------------------------------- */}

        {formError && (
          <Alert
            variant="destructive"
            role="alert"
          >
            <AlertTriangle className="size-4" />

            <AlertTitle>
              Something went wrong
            </AlertTitle>

            <AlertDescription>
              {formError}
            </AlertDescription>
          </Alert>
        )}

        {/* ================================================================= */}
        {/*                            INTAKE                                  */}
        {/* ================================================================= */}

        {stage ===
          "intake" && (
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <HeartPulse className="size-5" />
                </div>

                <div>
                  <CardTitle>
                    Check{" "}
                    {patient.name}'s
                    symptoms
                  </CardTitle>

                  <CardDescription>
                    Describe the
                    current problem
                    as clearly as
                    possible.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">

              {/* ---------------------------------------------------------- */}
              {/* PATIENT INFORMATION                                         */}
              {/* ---------------------------------------------------------- */}

              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <UserRound className="size-4 text-primary" />

                  <h2 className="text-sm font-semibold">
                    Patient information
                  </h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">

                  <ProfileValue
                    label="Name"
                    value={
                      patient.name
                    }
                  />

                  <ProfileValue
                    label="Age"
                    value={
                      patient.age ||
                      "Not provided"
                    }
                  />

                  <ProfileValue
                    label="Sex"
                    value={
                      patient.sex ||
                      "Not provided"
                    }
                  />

                  <ProfileValue
                    label="Existing condition"
                    value={
                      patient.existingConditions ||
                      "Not provided"
                    }
                  />

                  <ProfileValue
                    label="Allergies"
                    value={
                      patient.allergies ||
                      "Not provided"
                    }
                  />

                  <ProfileValue
                    label="Smoking status"
                    value={
                      patient.smokingStatus ||
                      "Not provided"
                    }
                  />

                </div>
              </div>

              <Separator />

              {/* ---------------------------------------------------------- */}
              {/* SYMPTOMS                                                     */}
              {/* ---------------------------------------------------------- */}

              <div className="space-y-2">
                <Label htmlFor="patient-symptoms">
                  What symptoms is{" "}
                  {patient.name}{" "}
                  experiencing?
                </Label>

                <Textarea
                  id="patient-symptoms"
                  value={
                    symptoms
                  }
                  onChange={(
                    event,
                  ) =>
                    setSymptoms(
                      event.target
                        .value,
                    )
                  }
                  placeholder="For example: fever, sore throat, cough, headache…"
                  className="min-h-32 resize-y"
                  maxLength={2000}
                  disabled={
                    immediateMutation.isPending ||
                    questionsMutation.isPending ||
                    assessmentMutation.isPending
                  }
                />

                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Include the
                    main symptoms,
                    where they
                    occur, and
                    anything that
                    feels unusual.
                  </span>

                  <span className="shrink-0">
                    {
                      symptoms.length
                    }
                    /2000
                  </span>
                </div>
              </div>

              {/* ---------------------------------------------------------- */}
              {/* DURATION                                                     */}
              {/* ---------------------------------------------------------- */}

              <div className="space-y-2">
                <Label htmlFor="patient-duration">
                  How long has
                  this been
                  happening?
                </Label>

                <Input
                  id="patient-duration"
                  value={
                    duration
                  }
                  onChange={(
                    event,
                  ) =>
                    setDuration(
                      event.target
                        .value,
                    )
                  }
                  placeholder="For example: 2 days, since yesterday, 3 weeks…"
                  maxLength={60}
                  disabled={
                    immediateMutation.isPending ||
                    questionsMutation.isPending ||
                    assessmentMutation.isPending
                  }
                />

                <p className="text-xs text-muted-foreground">
                  A duration helps
                  the assessment
                  understand how
                  the symptoms have
                  developed.
                </p>
              </div>

              {/* ---------------------------------------------------------- */}
              {/* BACKGROUND NOTICE                                            */}
              {/* ---------------------------------------------------------- */}

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />

                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Patient profile
                      is used as
                      background
                      context
                    </p>

                    <p className="text-xs leading-5 text-muted-foreground">
                      Existing
                      conditions,
                      medicines,
                      allergies,
                      previous
                      illnesses,
                      smoking
                      history and
                      family history
                      help
                      contextualize
                      the assessment.
                      They are not
                      automatically
                      treated as
                      current
                      symptoms.
                    </p>
                  </div>
                </div>
              </div>

              {/* ---------------------------------------------------------- */}
              {/* START                                                        */}
              {/* ---------------------------------------------------------- */}

              <Button
                className="w-full"
                size="lg"
                onClick={
                  startCheck
                }
                disabled={
                  immediateMutation.isPending ||
                  questionsMutation.isPending ||
                  assessmentMutation.isPending
                }
              >
                {immediateMutation.isPending ||
                questionsMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />

                    Preparing
                    symptom
                    check…
                  </>
                ) : (
                  <>
                    <HeartPulse className="mr-2 size-4" />

                    Start Symptom
                    Check
                  </>
                )}
              </Button>

              <p className="text-center text-xs leading-5 text-muted-foreground">
                This tool provides
                symptom assessment
                and care guidance.
                It does not provide
                a definitive medical
                diagnosis.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ================================================================= */}
        {/*                           QUESTIONS                                */}
        {/* ================================================================= */}

        {stage ===
          "questions" &&
          currentQuestion && (
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MessageCircleQuestion className="size-5" />
                  </div>

                  <div>
                    <CardTitle>
                      A few more
                      questions
                    </CardTitle>

                    <CardDescription>
                      These
                      questions are
                      selected for{" "}
                      {
                        patient.name
                      }
                      's current
                      symptoms.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">

                {/* -------------------------------------------------------- */}
                {/* QUESTION                                                   */}
                {/* -------------------------------------------------------- */}

                <div className="rounded-xl border bg-muted/30 p-5">
                  <p className="text-lg font-medium leading-7">
                    {
                      currentQuestion.question
                    }
                  </p>

                  {currentQuestion.why && (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {
                        currentQuestion.why
                      }
                    </p>
                  )}
                </div>

                {/* -------------------------------------------------------- */}
                {/* OPTIONS                                                    */}
                {/* -------------------------------------------------------- */}

                {currentQuestion.options &&
                currentQuestion
                  .options
                  .length >
                  0 ? (
                  <div
                    className="grid gap-3"
                    role="radiogroup"
                    aria-label="Answer options"
                  >
                    {currentQuestion.options.map(
                      (
                        option,
                      ) => {
                        const selected =
                          currentAnswer ===
                          option;

                        return (
                          <button
                            key={
                              option
                            }
                            type="button"
                            onClick={() =>
                              setCurrentAnswer(
                                option,
                              )
                            }
                            className={[
                              "w-full rounded-xl border px-4 py-4 text-left text-sm transition",
                              "hover:border-primary/50 hover:bg-primary/5",
                              selected
                                ? "border-primary bg-primary/10 text-foreground shadow-sm"
                                : "bg-card",
                            ].join(
                              " ",
                            )}
                            role="radio"
                            aria-checked={
                              selected
                            }
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={[
                                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                                  selected
                                    ? "border-primary"
                                    : "border-muted-foreground/40",
                                ].join(
                                  " ",
                                )}
                              >
                                {selected && (
                                  <div className="size-2.5 rounded-full bg-primary" />
                                )}
                              </div>

                              <span>
                                {
                                  option
                                }
                              </span>
                            </div>
                          </button>
                        );
                      },
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="patient-answer">
                      Patient's answer
                    </Label>

                    <Textarea
                      id="patient-answer"
                      value={
                        currentAnswer
                      }
                      onChange={(
                        event,
                      ) =>
                        setCurrentAnswer(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Type the patient's answer…"
                      className="min-h-28 resize-y"
                      maxLength={4000}
                    />
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* NAVIGATION                                                 */}
                {/* -------------------------------------------------------- */}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (
                        step ===
                        0
                      ) {
                        setStage(
                          "intake",
                        );

                        return;
                      }

                      setStep(
                        (
                          value,
                        ) =>
                          value -
                          1,
                      );

                      setAnswers(
                        (
                          current,
                        ) =>
                          current.slice(
                            0,
                            -1,
                          ),
                      );

                      setCurrentAnswer(
                        "",
                      );
                    }}
                  >
                    <ChevronLeft className="mr-2 size-4" />

                    Back
                  </Button>

                  <Button
                    onClick={
                      submitAnswer
                    }
                    disabled={
                      immediateMutation.isPending ||
                      assessmentMutation.isPending
                    }
                  >
                    {immediateMutation.isPending ||
                    assessmentMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />

                        Checking…
                      </>
                    ) : step <
                      questions.length -
                        1 ? (
                      <>
                        Next
                        question

                        <ChevronRight className="ml-2 size-4" />
                      </>
                    ) : (
                      <>
                        <Stethoscope className="mr-2 size-4" />

                        View
                        Assessment
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  Only the
                  patient's actual
                  answer is used as
                  patient-reported
                  information. The
                  question itself is
                  not treated as a
                  symptom.
                </p>
              </CardContent>
            </Card>
          )}

        {/* ================================================================= */}
        {/*                              RESULT                                */}
        {/* ================================================================= */}

        {stage ===
          "result" &&
          assessment && (
            <PatientAssessmentResult
              patientId={
                patientId
              }
              patientName={
                patient.name
              }
              assessment={
                assessment
              }
              savedId={
                savedId
              }
              saveError={
                saveError
              }
              savePending={
                saveMutation.isPending
              }
              onSave={
                saveResult
              }
              onNewCheck={
                resetCheck
              }
            />
          )}

      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                         PATIENT PROFILE VALUE                              */
/* -------------------------------------------------------------------------- */

function ProfileValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-background/50 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-0.5 text-sm font-medium">
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         RESULT COMPONENT                                   */
/* -------------------------------------------------------------------------- */

function PatientAssessmentResult({
  patientId,
  patientName,
  assessment,
  savedId,
  saveError,
  savePending,
  onSave,
  onNewCheck,
}: {
  patientId: string;
  patientName: string;
  assessment: Assessment;
  savedId: string | null;
  saveError: string | null;
  savePending: boolean;
  onSave: () => void;
  onNewCheck: () => void;
}) {
  const top =
    topCondition(
      assessment,
    );

  const isEmergency =
    assessment.urgency ===
    "emergency";

  const isUrgent =
    assessment.urgency ===
    "urgent";

  return (
    <div className="space-y-6">

      {/* ------------------------------------------------------------------ */}
      {/* RESULT HEADER                                                       */}
      {/* ------------------------------------------------------------------ */}

      <Card
        className={
          isEmergency
            ? "border-destructive/50 bg-destructive/5"
            : "overflow-hidden"
        }
      >
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={[
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  isEmergency
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
                ].join(
                  " ",
                )}
              >
                {isEmergency ? (
                  <ShieldAlert className="size-6" />
                ) : (
                  <CheckCircle2 className="size-6" />
                )}
              </div>

              <div>
                <p className="text-sm text-muted-foreground">
                  Symptom assessment
                  for
                </p>

                <CardTitle className="mt-1">
                  {
                    patientName
                  }
                </CardTitle>

                <CardDescription className="mt-1">
                  Review the
                  information below
                  and use the care
                  guidance as
                  decision support.
                </CardDescription>
              </div>
            </div>

            <Badge
              className={[
                "w-fit border",
                urgencyClass(
                  assessment.urgency,
                ),
              ].join(
                " ",
              )}
              variant="outline"
            >
              {formatUrgency(
                assessment.urgency,
              )}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">

          {/* -------------------------------------------------------------- */}
          {/* EMERGENCY                                                       */}
          {/* -------------------------------------------------------------- */}

          {isEmergency && (
            <Alert
              variant="destructive"
              className="border-destructive/40"
            >
              <ShieldAlert className="size-4" />

              <AlertTitle>
                Emergency care may
                be needed
              </AlertTitle>

              <AlertDescription className="leading-6">
                The safety screening
                found information
                that warrants
                emergency attention.
                Please seek emergency
                medical care now
                rather than relying on
                this assessment.
              </AlertDescription>
            </Alert>
          )}

          {/* -------------------------------------------------------------- */}
          {/* URGENT                                                         */}
          {/* -------------------------------------------------------------- */}

          {!isEmergency &&
            isUrgent && (
              <Alert className="border-orange-500/30 bg-orange-500/5">
                <AlertTriangle className="size-4 text-orange-300" />

                <AlertTitle>
                  Prompt medical
                  attention
                </AlertTitle>

                <AlertDescription className="leading-6">
                  The available
                  information suggests
                  that prompt medical
                  evaluation may be
                  appropriate. This is
                  different from an
                  emergency
                  classification.
                </AlertDescription>
              </Alert>
            )}

          {/* -------------------------------------------------------------- */}
          {/* SUMMARY                                                         */}
          {/* -------------------------------------------------------------- */}

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />

              <h2 className="text-sm font-semibold">
                Assessment summary
              </h2>
            </div>

            <p className="mt-3 text-sm leading-7 text-foreground">
              {
                assessment.summary
              }
            </p>

            {assessment.urgencyReason && (
              <div className="mt-4 rounded-lg border bg-background/60 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Why this urgency
                  level was selected
                </p>

                <p className="mt-1 text-sm leading-6">
                  {
                    assessment.urgencyReason
                  }
                </p>
              </div>
            )}
          </div>

          {/* -------------------------------------------------------------- */}
          {/* TOP CONDITION                                                   */}
          {/* -------------------------------------------------------------- */}

          {top && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">
                      Most closely
                      matching
                      possibility
                    </CardTitle>

                    <CardDescription className="mt-1">
                      This is a symptom
                      match, not a
                      confirmed
                      diagnosis.
                    </CardDescription>
                  </div>

                  <Badge
                    variant="secondary"
                    className="shrink-0"
                  >
                    {
                      clampMatchStrength(
                        top.likelihood,
                      )
                    }
                    % match
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <h3 className="text-base font-semibold">
                  {top.name}
                </h3>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {
                    top.explanation
                  }
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={[
                      "border",
                      riskClass(
                        top.riskLevel,
                      ),
                    ].join(
                      " ",
                    )}
                  >
                    Risk level:{" "}
                    {
                      top.riskLevel
                    }
                  </Badge>

                  {top.matchingSymptoms
                    ?.slice(
                      0,
                      4,
                    )
                    .map(
                      (
                        symptom,
                      ) => (
                        <Badge
                          key={
                            symptom
                          }
                          variant="secondary"
                        >
                          {
                            symptom
                          }
                        </Badge>
                      ),
                    )}
                </div>

                {top.riskRationale && (
                  <div className="mt-4 rounded-lg bg-background/60 px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Risk context
                    </p>

                    <p className="mt-1 text-sm leading-6">
                      {
                        top.riskRationale
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* -------------------------------------------------------------- */}
          {/* OTHER POSSIBILITIES                                             */}
          {/* -------------------------------------------------------------- */}

          {assessment.conditions.length >
            1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Other possible
                  explanations
                </CardTitle>

                <CardDescription>
                  These are ranked by
                  symptom match
                  strength and are not
                  confirmed diagnoses.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {assessment.conditions
                  .slice(
                    1,
                    5,
                  )
                  .map(
                    (
                      condition,
                    ) => (
                      <div
                        key={
                          condition.name
                        }
                        className="rounded-xl border p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-medium">
                              {
                                condition.name
                              }
                            </h3>

                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {
                                condition.explanation
                              }
                            </p>
                          </div>

                          <Badge
                            variant="secondary"
                            className="shrink-0"
                          >
                            {
                              clampMatchStrength(
                                condition.likelihood,
                              )
                            }
                            %
                          </Badge>
                        </div>
                      </div>
                    ),
                  )}
              </CardContent>
            </Card>
          )}

          {/* -------------------------------------------------------------- */}
          {/* RED FLAGS                                                       */}
          {/* -------------------------------------------------------------- */}

          {assessment.redFlags &&
            assessment.redFlags.length >
              0 && (
              <Card className="border-destructive/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="size-5 text-destructive" />

                    Safety findings
                  </CardTitle>

                  <CardDescription>
                    These findings should
                    be taken seriously
                    when deciding what
                    care is appropriate.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-2">
                    {assessment.redFlags.map(
                      (
                        flag,
                      ) => (
                        <li
                          key={
                            flag
                          }
                          className="flex items-start gap-2 text-sm leading-6"
                        >
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-destructive" />

                          <span>
                            {
                              flag
                            }
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

          {/* -------------------------------------------------------------- */}
          {/* GENERAL ADVICE                                                  */}
          {/* -------------------------------------------------------------- */}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Stethoscope className="size-5 text-primary" />

                General advice
              </CardTitle>
            </CardHeader>

            <CardContent>
              <p className="text-sm leading-7">
                {
                  assessment.generalAdvice
                }
              </p>
            </CardContent>
          </Card>

          {/* -------------------------------------------------------------- */}
          {/* SELF CARE / NEXT STEPS                                          */}
          {/* -------------------------------------------------------------- */}

          {top && (
            <div className="grid gap-4 md:grid-cols-2">

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    What may help
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  {top.selfCare &&
                  top.selfCare.length >
                    0 ? (
                    <ul className="space-y-2">
                      {top.selfCare.map(
                        (
                          item,
                        ) => (
                          <li
                            key={
                              item
                            }
                            className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"
                          >
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />

                            <span>
                              {
                                item
                              }
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm leading-6 text-muted-foreground">
                      Follow the
                      general advice
                      above and
                      monitor the
                      symptoms.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Recommended
                    next step
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {
                      top.nextSteps
                    }
                  </p>
                </CardContent>
              </Card>

            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* CONFIDENCE                                                      */}
          {/* -------------------------------------------------------------- */}

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />

                <div>
                  <p className="text-sm font-medium">
                    Assessment
                    confidence:{" "}
                    {
                      assessment.confidence
                    }
                  </p>

                  {assessment.confidenceNote && (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {
                        assessment.confidenceNote
                      }
                    </p>
                  )}

                  {assessment.missingInfo &&
                    assessment.missingInfo.length >
                      0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          Information that
                          may improve
                          the assessment
                        </p>

                        <ul className="mt-2 space-y-1">
                          {assessment.missingInfo
                            .slice(
                              0,
                              5,
                            )
                            .map(
                              (
                                item,
                              ) => (
                                <li
                                  key={
                                    item
                                  }
                                  className="text-xs text-muted-foreground"
                                >
                                  •{" "}
                                  {
                                    item
                                  }
                                </li>
                              ),
                            )}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* -------------------------------------------------------------- */}
          {/* MATCH STRENGTH NOTICE                                           */}
          {/* -------------------------------------------------------------- */}

          <div className="rounded-xl border bg-muted/40 px-4 py-3">
            <p className="text-xs leading-5 text-muted-foreground">
              The percentage shown
              above is{" "}
              <span className="font-medium text-foreground">
                symptom match
                strength
              </span>
              . It is not a calibrated
              medical probability and
              should not be interpreted
              as a diagnosis.
            </p>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* SAVE ERROR                                                      */}
          {/* -------------------------------------------------------------- */}

          {saveError && (
            <Alert
              variant="destructive"
              role="alert"
            >
              <AlertTriangle className="size-4" />

              <AlertTitle>
                Could not save this
                check
              </AlertTitle>

              <AlertDescription>
                {saveError}
              </AlertDescription>
            </Alert>
          )}

          {/* -------------------------------------------------------------- */}
          {/* SAVE SUCCESS                                                    */}
          {/* -------------------------------------------------------------- */}

          {savedId && (
            <Alert className="border-primary/30 bg-primary/5">
              <CheckCircle2 className="size-4 text-primary" />

              <AlertTitle>
                Symptom check saved
              </AlertTitle>

              <AlertDescription>
                This check has been
                saved only to{" "}
                {patientName}'s
                separate patient
                history.
              </AlertDescription>
            </Alert>
          )}

          {/* -------------------------------------------------------------- */}
          {/* ACTIONS                                                         */}
          {/* -------------------------------------------------------------- */}

          <div className="grid gap-3 sm:grid-cols-3">

            <Button
              onClick={
                onSave
              }
              disabled={
                savePending ||
                Boolean(savedId)
              }
            >
              {savePending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />

                  Saving…
                </>
              ) : savedId ? (
                <>
                  <CheckCircle2 className="mr-2 size-4" />

                  Saved
                </>
              ) : (
                <>
                  <Save className="mr-2 size-4" />

                  Save Check
                </>
              )}
            </Button>

            <Button
              asChild
              variant="outline"
            >
              <Link
                to="/patient-history/$patient_ID"
                params={{
                  patient_ID:
                    patientId,
                }}
              >
                <Activity className="mr-2 size-4" />

                View History
              </Link>
            </Button>

            <Button
              variant="outline"
              onClick={
                onNewCheck
              }
            >
              <HeartPulse className="mr-2 size-4" />

              New Check
            </Button>

          </div>

          {/* -------------------------------------------------------------- */}
          {/* MEDICAL SAFETY                                                   */}
          {/* -------------------------------------------------------------- */}

          <div className="rounded-xl border border-border bg-muted/30 px-4 py-4">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

              <p className="text-xs leading-5 text-muted-foreground">
                This assessment is
                decision support based
                on the information
                provided. It does not
                replace a qualified
                healthcare professional.
                Do not stop or change
                prescribed medication
                based only on this
                result.
              </p>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}