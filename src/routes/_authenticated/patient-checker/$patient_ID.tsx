
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  MessageCircleQuestion,
  Save,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import {
  assessSymptoms,
  clarifyAnswers,
  getFollowUpQuestions,
  immediateEmergencyAssessment,
  type Assessment,
  type FollowUpQuestion,
} from "@/lib/symptoms.functions";

import {
  getPatient,
} from "@/lib/patient.functions";

import {
  listPatientChecks,
  saveCheck,
} from "@/lib/history.functions";

import { topRisk } from "@/lib/history";
import { extractVitals } from "@/lib/vitals";
import { useLang } from "@/lib/i18n";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute(
  "/_authenticated/patient-checker/$patientId",
)({
  ssr: false,

  beforeLoad: async ({ params }) => {
    if (!params.patientId) {
      throw redirect({
        to: "/patients",
      });
    }

    return {
      patientId: params.patientId,
    };
  },

  component: PatientCheckerPage,
});

type Stage = "intake" | "questions" | "result";

function PatientCheckerPage() {
  const { patientId } = Route.useParams();
  const { lang } = useLang();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>("intake");

  const [symptoms, setSymptoms] = useState("");
  const [duration, setDuration] = useState("");

  const [questions, setQuestions] = useState<FollowUpQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [step, setStep] = useState(0);

  const [draft, setDraft] = useState("");

  const [assessment, setAssessment] =
    useState<Assessment | null>(null);

  const [savedId, setSavedId] =
    useState<string | null>(null);

  const [saveError, setSaveError] =
    useState<string | null>(null);

  /**
   * Patient profile
   */
  const patientQuery = useQuery({
    queryKey: ["patient", patientId],

    queryFn: () =>
      getPatient({
        data: {
          id: patientId,
        },
      }),
  });

  /**
   * THIS GRAPH IS ONLY FOR THIS PATIENT.
   *
   * It never calls listChecks().
   */
  const historyQuery = useQuery({
    queryKey: ["patient-checks", patientId],

    queryFn: () =>
      listPatientChecks({
        data: {
          patientId,
        },
      }),
  });

  const patient = patientQuery.data;

  /**
   * Build context from THIS patient only.
   *
   * Self profile is never fetched here.
   */
  const patientContext = useMemo(() => {
    if (!patient) {
      return undefined;
    }

    return {
      name: patient.name,
      age: patient.age ?? "",
      sex: patient.sex ?? "",
      allergies: patient.allergies ?? "",
      existingConditions:
        patient.existing_conditions ?? "",
      currentMedications:
        patient.current_medications ?? "",
      previousMajorIllnesses:
        patient.previous_major_illnesses ?? "",
      smokingStatus:
        patient.smoking_status ?? "",
      familyHistory:
        patient.family_history ?? "",
      pregnancyStatus:
        patient.pregnancy_status ?? "",
    };
  }, [patient]);

  function baseInput() {
    return {
      symptoms: symptoms.trim(),
      age: patient?.age?.trim() || undefined,
      sex: patient?.sex?.trim() || undefined,
      duration: duration.trim() || undefined,
      language: lang,

      /**
       * Patient-specific context.
       *
       * This is used by the assessment layer to make
       * the questions/result relevant to this patient.
       */
      patientProfile: patientContext,
    };
  }

  async function runImmediateAssessment(
    extraAnswers: { question: string; answer: string }[] = [],
  ) {
    return immediateEmergencyAssessment({
      ...baseInput(),
      answers: extraAnswers,
    });
  }

  const questionsMutation = useMutation({
    mutationFn: async () => {
      return getFollowUpQuestions({
        data: baseInput(),
      });
    },

    onSuccess: (data) => {
      if (!data || data.length === 0) {
        assessMutation.mutate({
          answers: [],
        });
        return;
      }

      setQuestions(data);
      setAnswers(new Array(data.length).fill(""));
      setStep(0);
      setDraft("");
      setStage("questions");
    },
  });

  const assessMutation = useMutation({
    mutationFn: async ({
      answers: answerPairs,
    }: {
      answers: {
        question: string;
        answer: string;
      }[];
    }) => {
      return assessSymptoms({
        data: {
          ...baseInput(),
          answers: answerPairs,
        },
      });
    },

    onSuccess: (result) => {
      setAssessment(result);
      setStage("result");
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!assessment || !patient) {
        throw new Error(
          "Assessment or patient profile is missing.",
        );
      }

      const { likelihood, condition } =
        topRisk(assessment);

      const answerPairs = questions.map(
        (question, index) => ({
          question: question.question,
          answer: answers[index] ?? "",
        }),
      );

      const vitals = extractVitals(
        [
          symptoms,
          duration,
          ...answerPairs.map((item) => item.answer),
        ].join("\n"),
      );

      return saveCheck({
        data: {
          symptoms: symptoms.trim(),

          severity: likelihood,

          urgency: assessment.urgency,

          topCondition:
            condition?.name ?? "No specific match",

          summary: assessment.summary,

          answers: answerPairs,

          redFlag:
            assessment.redFlags.length > 0,

          redFlags: assessment.redFlags,

          categories:
            condition?.matchingSymptoms ?? [],

          supportingFactors:
            condition?.contributingFactors ?? [],

          vitals,

          uncertainty:
            assessment.uncertainty.join("\n"),

          nextStep:
            assessment.nextStep,

          /**
           * THIS IS THE CRITICAL PART.
           */
          subjectType: "patient",

          patientId: patient.id,
        },
      });
    },

    onSuccess: (result) => {
      setSavedId(result.id);
      setSaveError(null);

      queryClient.invalidateQueries({
        queryKey: ["patient-checks", patientId],
      });
    },

    onError: (error) => {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save this check.",
      );
    },
  });

  function startCheck() {
    if (!symptoms.trim()) {
      return;
    }

    setSaveError(null);

    const emergency =
      immediateEmergencyAssessment({
        ...baseInput(),
        answers: [],
      });

    if (emergency) {
      setAssessment(emergency);
      setStage("result");
      return;
    }

    questionsMutation.mutate();
  }

  async function answerCurrentQuestion(
    answer: string,
  ) {
    const nextAnswers = [...answers];
    nextAnswers[step] = answer;

    setAnswers(nextAnswers);

    const pairs = questions
      .slice(0, step + 1)
      .map((question, index) => ({
        question: question.question,
        answer: nextAnswers[index] ?? "",
      }));

    const emergency =
      await runImmediateAssessment(pairs);

    if (emergency) {
      setAssessment(emergency);
      setStage("result");
      return;
    }

    if (step < questions.length - 1) {
      setStep(step + 1);
      setDraft("");
      return;
    }

    assessMutation.mutate({
      answers: questions.map(
        (question, index) => ({
          question: question.question,
          answer: nextAnswers[index] ?? "",
        }),
      ),
    });
  }

  if (patientQuery.isLoading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        </div>
      </main>
    );
  }

  if (patientQuery.error || !patient) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>
                Patient profile not found
              </CardTitle>

              <CardDescription>
                This patient may have been deleted or
                may not belong to your account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Button asChild>
                <Link to="/patients">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Patients
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  /**
   * RESULT
   */
  if (stage === "result" && assessment) {
    return (
      <PatientResult
        patient={patient}
        patientId={patientId}
        assessment={assessment}
        symptoms={symptoms}
        savedId={savedId}
        saveError={saveError}
        saving={saveMutation.isPending}
        onSave={() => saveMutation.mutate()}
        onRestart={() => {
          setStage("intake");
          setSymptoms("");
          setDuration("");
          setQuestions([]);
          setAnswers([]);
          setStep(0);
          setDraft("");
          setAssessment(null);
          setSavedId(null);
          setSaveError(null);
        }}
      />
    );
  }

  /**
   * QUESTIONS
   */
  if (stage === "questions") {
    const currentQuestion = questions[step];

    return (
      <main className="min-h-screen px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <header className="mb-6">
            <Link
              to="/patients"
              className="inline-flex items-center text-sm opacity-70 hover:opacity-100"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Patients
            </Link>
          </header>

          <PatientHeader
            name={patient.name}
            age={patient.age}
            sex={patient.sex}
          />

          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircleQuestion className="h-5 w-5" />

                <CardTitle>
                  Follow-up question
                </CardTitle>
              </div>

              <CardDescription>
                Question {step + 1} of {questions.length}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold leading-relaxed">
                  {currentQuestion.question}
                </h2>

                {currentQuestion.why && (
                  <p className="mt-3 text-sm opacity-70">
                    {currentQuestion.why}
                  </p>
                )}
              </div>

              {currentQuestion.options?.length ? (
                <div className="grid gap-3">
                  {currentQuestion.options.map(
                    (option) => (
                      <Button
                        key={option}
                        type="button"
                        variant={
                          answers[step] === option
                            ? "default"
                            : "outline"
                        }
                        className="min-h-12 justify-start whitespace-normal text-left"
                        onClick={() =>
                          answerCurrentQuestion(
                            option,
                          )
                        }
                      >
                        {option}
                      </Button>
                    ),
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    value={draft}
                    onChange={(event) =>
                      setDraft(event.target.value)
                    }
                    placeholder="Type your answer..."
                    rows={4}
                  />

                  <Button
                    type="button"
                    disabled={!draft.trim()}
                    onClick={() =>
                      answerCurrentQuestion(
                        draft.trim(),
                      )
                    }
                  >
                    Continue
                  </Button>
                </div>
              )}

              {assessMutation.isPending && (
                <div className="flex items-center gap-2 text-sm opacity-70">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Assessing...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  /**
   * INTAKE
   */
  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <Link
            to="/patients"
            className="inline-flex items-center text-sm opacity-70 hover:opacity-100"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Patients
          </Link>
        </header>

        <PatientHeader
          name={patient.name}
          age={patient.age}
          sex={patient.sex}
        />

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>
              Check symptoms for {patient.name}
            </CardTitle>

            <CardDescription>
              This symptom check, assessment and history
              are stored separately from your own
              symptom history.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />

                <div>
                  <p className="font-medium">
                    Patient-specific assessment
                  </p>

                  <p className="mt-1 text-sm opacity-70">
                    The assessment uses this patient's
                    profile information and previous
                    checks only.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-symptoms">
                What symptoms does {patient.name} have?
              </Label>

              <Textarea
                id="patient-symptoms"
                value={symptoms}
                onChange={(event) =>
                  setSymptoms(event.target.value)
                }
                placeholder="Describe the symptoms..."
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-duration">
                How long have the symptoms been present?
              </Label>

              <Input
                id="patient-duration"
                value={duration}
                onChange={(event) =>
                  setDuration(event.target.value)
                }
                placeholder="For example: 2 days"
              />
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={
                !symptoms.trim() ||
                questionsMutation.isPending
              }
              onClick={startCheck}
            >
              {questionsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing questions...
                </>
              ) : (
                <>
                  Check Symptoms
                  <ChevronDown className="ml-2 h-4 w-4 rotate-[-90deg]" />
                </>
              )}
            </Button>

            {questionsMutation.error && (
              <p className="text-sm text-destructive">
                {questionsMutation.error instanceof Error
                  ? questionsMutation.error.message
                  : "Unable to start the symptom check."}
              </p>
            )}
          </CardContent>
        </Card>

        <PatientHistoryPreview
          patientId={patientId}
          history={historyQuery.data ?? []}
          loading={historyQuery.isLoading}
        />
      </div>
    </main>
  );
}

function PatientHeader({
  name,
  age,
  sex,
}: {
  name: string;
  age?: string | null;
  sex?: string | null;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <UserRound className="h-7 w-7" />
      </div>

      <div>
        <p className="text-sm opacity-60">
          Symptom check for
        </p>

        <h1 className="text-2xl font-bold">
          {name}
        </h1>

        <p className="text-sm opacity-70">
          {[age, sex].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}

function PatientHistoryPreview({
  patientId,
  history,
  loading,
}: {
  patientId: string;
  history: Array<{
    id: string;
    date: string;
    symptoms: string;
    severity: number;
    urgency: string;
    topCondition: string;
    summary: string;
  }>;
  loading: boolean;
}) {
  const latest = [...history].reverse().slice(0, 3);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>
          {history.length > 0
            ? "This patient's symptom history"
            : "Patient history"}
        </CardTitle>

        <CardDescription>
          Only {history.length} check
          {history.length === 1 ? "" : "s"} saved
          for this patient.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm opacity-70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading patient history...
          </div>
        ) : history.length === 0 ? (
          <div className="py-6 text-sm opacity-70">
            No previous symptom checks for this patient.
          </div>
        ) : (
          <div className="space-y-3">
            {latest.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border p-4"
              >
                <div className="flex items-center gap-2 text-xs opacity-60">
                  <Clock3 className="h-3.5 w-3.5" />

                  {new Date(
                    item.date,
                  ).toLocaleDateString()}
                </div>

                <p className="mt-2 font-medium">
                  {item.symptoms}
                </p>

                <p className="mt-1 text-sm opacity-70">
                  Match strength: {item.severity}%
                </p>
              </div>
            ))}
          </div>
        )}

        <Button
          asChild
          variant="outline"
          className="mt-5 w-full"
        >
          <Link
            to="/patient-history/$patientId"
            params={{
              patientId,
            }}
          >
            View Full Patient History
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function PatientResult({
  patient,
  patientId,
  assessment,
  symptoms,
  savedId,
  saveError,
  saving,
  onSave,
  onRestart,
}: {
  patient: {
    id: string;
    name: string;
    age?: string | null;
    sex?: string | null;
  };

  patientId: string;

  assessment: Assessment;

  symptoms: string;

  savedId: string | null;

  saveError: string | null;

  saving: boolean;

  onSave: () => void;

  onRestart: () => void;
}) {
  const { likelihood, condition } =
    topRisk(assessment);

  const isEmergency =
    assessment.urgency === "emergency";

  const isUrgent =
    assessment.urgency === "urgent";

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/patients"
          className="inline-flex items-center text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Patients
        </Link>

        <div className="mt-6">
          <PatientHeader
            name={patient.name}
            age={patient.age}
            sex={patient.sex}
          />
        </div>

        <Card
          className={`mt-6 ${
            isEmergency
              ? "border-destructive"
              : ""
          }`}
        >
          <CardHeader>
            <CardTitle>
              Assessment for {patient.name}
            </CardTitle>

            <CardDescription>
              This result belongs only to this patient.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {(isEmergency || isUrgent) && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
                <div className="flex gap-3">
                  <ShieldAlert className="h-5 w-5 shrink-0" />

                  <div>
                    <p className="font-semibold">
                      {isEmergency
                        ? "Emergency attention may be needed"
                        : "Prompt medical attention may be needed"}
                    </p>

                    <p className="mt-1 text-sm opacity-80">
                      {assessment.urgencyReason}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm opacity-60">
                Symptom match strength
              </p>

              <p className="mt-1 text-4xl font-bold">
                {likelihood}%
              </p>

              <p className="mt-1 text-sm opacity-60">
                This is a symptom-match indicator, not a
                medically validated probability or
                diagnosis.
              </p>
            </div>

            <div>
              <p className="text-sm opacity-60">
                Summary
              </p>

              <p className="mt-2 leading-relaxed">
                {assessment.summary}
              </p>
            </div>

            {condition && (
              <div className="rounded-xl border p-4">
                <p className="text-sm opacity-60">
                  Possible match
                </p>

                <h2 className="mt-1 text-lg font-semibold">
                  {condition.name}
                </h2>

                {condition.explanation && (
                  <p className="mt-2 text-sm leading-relaxed opacity-80">
                    {condition.explanation}
                  </p>
                )}
              </div>
            )}

            {assessment.nextStep && (
              <div>
                <p className="text-sm opacity-60">
                  Recommended next step
                </p>

                <p className="mt-2 leading-relaxed">
                  {assessment.nextStep}
                </p>
              </div>
            )}

            {assessment.generalAdvice.length > 0 && (
              <div>
                <p className="text-sm opacity-60">
                  General advice
                </p>

                <ul className="mt-2 space-y-2">
                  {assessment.generalAdvice.map(
                    (advice) => (
                      <li
                        key={advice}
                        className="rounded-lg border p-3 text-sm"
                      >
                        {advice}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

            {assessment.redFlags.length > 0 && (
              <div className="rounded-xl border border-destructive/40 p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />

                  <p className="font-semibold">
                    Warning signs
                  </p>
                </div>

                <ul className="mt-3 space-y-2 text-sm">
                  {assessment.redFlags.map(
                    (flag) => (
                      <li key={flag}>
                        • {flag}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

            <div className="rounded-xl border p-4">
              <p className="text-xs opacity-60">
                Patient
              </p>

              <p className="mt-1 font-medium">
                {patient.name}
              </p>

              <p className="text-sm opacity-70">
                This assessment is stored separately from
                your own symptom history.
              </p>
            </div>

            {savedId ? (
              <div className="flex items-center gap-2 rounded-xl border p-4">
                <CheckCircle2 className="h-5 w-5" />

                <div>
                  <p className="font-medium">
                    Check saved
                  </p>

                  <p className="text-sm opacity-70">
                    Saved to {patient.name}'s history.
                  </p>
                </div>
              </div>
            ) : (
              <Button
                className="w-full"
                size="lg"
                disabled={saving}
                onClick={onSave}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save to {patient.name}'s History
                  </>
                )}
              </Button>
            )}

            {saveError && (
              <p className="text-sm text-destructive">
                {saveError}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onRestart}
              >
                Check Again
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                asChild
              >
                <Link
                  to="/patient-history/$patientId"
                  params={{
                    patientId,
                  }}
                >
                  View History
                </Link>
              </Button>
            </div>

            <p className="text-center text-xs leading-relaxed opacity-60">
              SymptomScope provides informational
              symptom assessment and does not replace a
              qualified healthcare professional.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}