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
  assessPatientSymptoms,
  clarifyPatientAnswers,
  getPatientFollowUpQuestions,
  immediateEmergencyAssessment,
  type Assessment,
  type FollowUpQuestion,
} from "@/lib/symptoms.functions";

import { getPatient } from "@/lib/patient.functions";

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

type AnswerPair = {
  question: string;
  answer: string;
};

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
   * ---------------------------------------------------------
   * PATIENT PROFILE
   * ---------------------------------------------------------
   *
   * This flow loads ONLY the selected patient.
   *
   * It never loads the logged-in user's own profile.
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
   * ---------------------------------------------------------
   * PATIENT-ONLY HISTORY
   * ---------------------------------------------------------
   *
   * This graph/history source is completely separate from:
   *
   * ["checks"]
   *
   * used by the logged-in user's own symptom checker.
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
   * Patient profile is contextual information.
   *
   * It is NOT treated as current symptoms.
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

  /**
   * ---------------------------------------------------------
   * BASE INPUT
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   *
   * patientProfile is NOT passed to the generic
   * ContextInput used by the self checker.
   *
   * Patient assessment functions receive patientId and
   * retrieve the patient profile securely on the server.
   */
  function baseInput() {
    return {
      patientId,
      symptoms: symptoms.trim(),
      duration: duration.trim() || undefined,
      language: lang,
    };
  }

  /**
   * Emergency screening deliberately uses only
   * patient-reported symptom/answer content.
   *
   * The patient's profile is not converted into symptoms.
   */
  async function runImmediateAssessment(
    extraAnswers: AnswerPair[] = [],
  ) {
    return immediateEmergencyAssessment({
      symptoms: symptoms.trim(),
      age: patient?.age?.trim() || undefined,
      sex: patient?.sex?.trim() || undefined,
      duration: duration.trim() || undefined,
      language: lang,
      answers: extraAnswers,
    });
  }

  /**
   * ---------------------------------------------------------
   * FOLLOW-UP QUESTIONS
   * ---------------------------------------------------------
   */
  const questionsMutation = useMutation({
    mutationFn: async () => {
      return getPatientFollowUpQuestions({
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

  /**
   * ---------------------------------------------------------
   * PATIENT ASSESSMENT
   * ---------------------------------------------------------
   */
  const assessMutation = useMutation({
    mutationFn: async ({
      answers: answerPairs,
    }: {
      answers: AnswerPair[];
    }) => {
      return assessPatientSymptoms({
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

  /**
   * ---------------------------------------------------------
   * PATIENT CHECK SAVE
   * ---------------------------------------------------------
   */
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!assessment || !patient) {
        throw new Error(
          "Assessment or patient profile is missing.",
        );
      }

      const { likelihood, condition } =
        topRisk(assessment);

      const answerPairs: AnswerPair[] = questions.map(
        (question, index) => ({
          question: question.question,
          answer: answers[index] ?? "",
        }),
      );

      /**
       * Only patient-reported content is sent to vital
       * extraction.
       *
       * Question text is deliberately excluded so that
       * numbers inside questions cannot become false vitals.
       */
      const vitals = extractVitals(
        [
          symptoms,
          duration,
          ...answerPairs.map(
            (item) => item.answer,
          ),
        ].join("\n"),
      );

      return saveCheck({
        data: {
          symptoms: symptoms.trim(),

          /**
           * This is MATCH STRENGTH, not diagnostic
           * probability/risk percentage.
           */
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
           * CRITICAL:
           *
           * This record belongs to the patient only.
           */
          subjectType: "patient",

          patientId: patient.id,
        },
      });
    },

    onSuccess: (result) => {
      /**
       * Only mark as saved after the actual database
       * mutation succeeds and return the real record ID.
       */
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

  /**
   * ---------------------------------------------------------
   * START PATIENT CHECK
   * ---------------------------------------------------------
   */
  async function startCheck() {
    if (!symptoms.trim() || questionsMutation.isPending) {
      return;
    }

    setSaveError(null);
    setSavedId(null);
    setAssessment(null);

    /**
     * Emergency screening MUST be awaited.
     *
     * Previously the Promise itself was checked, which
     * could incorrectly behave as if every check were
     * an emergency.
     */
    const emergency =
      await runImmediateAssessment([]);

    if (emergency) {
      setAssessment(emergency);
      setStage("result");
      return;
    }

    questionsMutation.mutate();
  }

  /**
   * ---------------------------------------------------------
   * ANSWER CURRENT QUESTION
   * ---------------------------------------------------------
   */
  async function answerCurrentQuestion(
    answer: string,
  ) {
    const cleanAnswer = answer.trim();

    if (!cleanAnswer) {
      return;
    }

    const nextAnswers = [...answers];
    nextAnswers[step] = cleanAnswer;

    setAnswers(nextAnswers);

    const pairs: AnswerPair[] = questions
      .slice(0, step + 1)
      .map((question, index) => ({
        question: question.question,
        answer: nextAnswers[index] ?? "",
      }));

    /**
     * Check emergency signals using the patient's actual
     * answers, not merely the follow-up question text.
     */
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

  /**
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */
  if (patientQuery.isLoading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div
            className="flex items-center justify-center py-24"
            aria-live="polite"
          >
            <Loader2
              className="h-7 w-7 animate-spin"
              aria-hidden="true"
            />
            <span className="sr-only">
              Loading patient profile
            </span>
          </div>
        </div>
      </main>
    );
  }

  /**
   * ---------------------------------------------------------
   * PATIENT NOT FOUND / ACCESS ERROR
   * ---------------------------------------------------------
   */
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
   * ---------------------------------------------------------
   * RESULT
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * QUESTIONS
   * ---------------------------------------------------------
   */
  if (stage === "questions") {
    const currentQuestion = questions[step];

    if (!currentQuestion) {
      return null;
    }

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
                <MessageCircleQuestion
                  className="h-5 w-5"
                  aria-hidden="true"
                />

                <CardTitle>
                  Follow-up question
                </CardTitle>
              </div>

              <CardDescription>
               