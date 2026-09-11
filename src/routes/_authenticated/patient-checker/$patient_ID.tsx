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

import {
  useMemo,
  useState,
} from "react";

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

import {
  getPatient,
} from "@/lib/profile.functions";

import {
  saveCheck,
} from "@/lib/history.functions";

import {
  extractVitals,
} from "@/lib/vitals";

import {
  useLang,
} from "@/lib/i18n";

import {
  ProfileMenu,
} from "@/components/ProfileMenu";

import {
  Button,
} from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Textarea,
} from "@/components/ui/textarea";

import {
  Input,
} from "@/components/ui/input";

import {
  Label,
} from "@/components/ui/label";

import {
  Progress,
} from "@/components/ui/progress";

import {
  Separator,
} from "@/components/ui/separator";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

/* -------------------------------------------------------------------------- */
/*                                  Route                                     */
/* -------------------------------------------------------------------------- */

export const Route =
  createFileRoute(
    "/_authenticated/patient-checker/$patient_ID",
  )({
    ssr: false,

    beforeLoad: async ({
      params,
    }) => {
      const patientId =
        params.patient_ID?.trim();

      if (!patientId) {
        throw redirect({
          to: "/patients",
        });
      }

      return {
        patientId,
      };
    },

    component:
      PatientCheckerRoute,
  });

/* -------------------------------------------------------------------------- */
/*                              Main Route                                    */
/* -------------------------------------------------------------------------- */

function PatientCheckerRoute() {
  const {
    patientId,
  } =
    Route.useRouteContext();

  return (
    <PatientChecker
      patientId={
        patientId
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                              Main Component                                */
/* -------------------------------------------------------------------------- */

function PatientChecker({
  patientId,
}: {
  patientId: string;
}) {
  const { lang } =
    useLang();

  const queryClient =
    useQueryClient();

  /* ------------------------------------------------------------------------ */
  /*                                Server Fns                                */
  /* ------------------------------------------------------------------------ */

  const getPatientFn =
    useServerFn(
      getPatient,
    );

  const emergencyFn =
    useServerFn(
      immediateEmergencyAssessment,
    );

  const questionsFn =
    useServerFn(
      getPatientFollowUpQuestions,
    );

  const assessmentFn =
    useServerFn(
      assessPatientSymptoms,
    );

  const saveFn =
    useServerFn(
      saveCheck,
    );

  /* ------------------------------------------------------------------------ */
  /*                              Patient Query                               */
  /* ------------------------------------------------------------------------ */

  const patientQuery =
    useQuery({
      queryKey: [
        "patient-profile",
        patientId,
      ],

      queryFn: () =>
        getPatientFn({
          data: {
            id: patientId,
          },
        }),

      enabled:
        Boolean(
          patientId,
        ),
    });

  const patient =
    patientQuery.data;

  /* ------------------------------------------------------------------------ */
  /*                                  State                                   */
  /* ------------------------------------------------------------------------ */

  const [
    stage,
    setStage,
  ] =
    useState<
      "intake" |
      "questions" |
      "result"
    >("intake");

  const [
    symptoms,
    setSymptoms,
  ] =
    useState("");

  const [
    duration,
    setDuration,
  ] =
    useState("");

  const [
    questions,
    setQuestions,
  ] =
    useState<
      FollowUpQuestion[]
    >([]);

  const [
    answers,
    setAnswers,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const [
    currentAnswer,
    setCurrentAnswer,
  ] =
    useState("");

  const [
    step,
    setStep,
  ] =
    useState(0);

  const [
    assessment,
    setAssessment,
  ] =
    useState<
      Assessment | null
    >(null);

  const [
    savedId,
    setSavedId,
  ] =
    useState<
      string | null
    >(null);

  const [
    saveError,
    setSaveError,
  ] =
    useState<
      string | null
    >(null);

  const [
    formError,
    setFormError,
  ] =
    useState<
      string | null
    >(null);

  /* ------------------------------------------------------------------------ */
  /*                         Patient Display Name                             */
  /* ------------------------------------------------------------------------ */

  const patientName =
    patient?.name?.trim() ||
    "Patient";

  /* ------------------------------------------------------------------------ */
  /*                         Base Patient Input                               */
  /* ------------------------------------------------------------------------ */

  const baseInput =
    useMemo(
      () => ({
        patientId,

        symptoms:
          symptoms.trim(),

        duration:
          duration.trim() ||
          undefined,

        language:
          lang === "bn"
            ? "bn"
            : "en",
      }),
      [
        patientId,
        symptoms,
        duration,
        lang,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /*                         Answer Pairs                                     */
  /* ------------------------------------------------------------------------ */

  const answerPairs =
    useMemo(
      () =>
        questions
          .map(
            (
              question,
            ) => ({
              question:
                question.question,

              answer:
                (
                  answers[
                    question.id
                  ] ??
                  ""
                ).trim(),
            }),
          )
          .filter(
            (
              item,
            ) =>
              Boolean(
                item.answer,
              ),
          ),
      [
        questions,
        answers,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /*                     Patient-Reported Text Only                           */
  /* ------------------------------------------------------------------------ */

  /*
   * IMPORTANT:
   *
   * Question text is deliberately NOT included here.
   *
   * Otherwise a question such as:
   * "Do you have chest pain?"
   *
   * could incorrectly be interpreted as the patient reporting
   * chest pain.
   */
  const patientReportedText =
    useMemo(
      () =>
        [
          symptoms.trim(),

          duration.trim(),

          ...answerPairs.map(
            (
              item,
            ) =>
              item.answer,
          ),
        ]
          .filter(
            Boolean,
          )
          .join("\n"),
      [
        symptoms,
        duration,
        answerPairs,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /*                         Top Match Strength                               */
  /* ------------------------------------------------------------------------ */

  const topCondition =
    useMemo(() => {
      if (
        !assessment?.conditions?.length
      ) {
        return null;
      }

      return [
        ...assessment.conditions,
      ].sort(
        (
          a,
          b,
        ) =>
          b.likelihood -
          a.likelihood,
      )[0] ?? null;
    }, [
      assessment,
    ]);

  /*
   * likelihood here is NOT treated as a calibrated probability.
   *
   * It is stored/displayed only as the application's
   * symptom-match strength, normalized to 0–100.
   */
  const matchStrength =
    useMemo(
      () =>
        normalizeMatchStrength(
          topCondition?.likelihood ??
            0,
        ),
      [
        topCondition,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /*                        Emergency Assessment                             */
  /* ------------------------------------------------------------------------ */

  const immediateMutation =
    useMutation({
      mutationFn:
        (
          input: {
            symptoms: string;
            duration?: string;
            language:
              | "en"
              | "bn";
            answers?: {
              question: string;
              answer: string;
            }[];
          },
        ) =>
          emergencyFn({
            data: input,
          }),
    });

  /* ------------------------------------------------------------------------ */
  /*                       Follow-Up Questions                               */
  /* ------------------------------------------------------------------------ */

  const questionsMutation =
    useMutation({
      mutationFn:
        () =>
          questionsFn({
            data: {
              ...baseInput,
            },
          }),
    });

  /* ------------------------------------------------------------------------ */
  /*                         Assessment Mutation                              */
  /* ------------------------------------------------------------------------ */

  const assessmentMutation =
    useMutation({
      mutationFn:
        (
          currentAnswers: {
            question: string;
            answer: string;
          }[],
        ) =>
          assessmentFn({
            data: {
              ...baseInput,

              answers:
                currentAnswers,
            },
          }),

      onSuccess:
        (
          result,
        ) => {
          setAssessment(
            result,
          );

          setStage(
            "result",
          );
        },
    });

  /* ------------------------------------------------------------------------ */
  /*                              Save Mutation                               */
  /* ------------------------------------------------------------------------ */

  const saveMutation =
    useMutation({
      mutationFn:
        (
          result: Assessment,
        ) => {
          /*
           * Determine the top condition from the assessment itself.
           *
           * This replaces the old:
           *
           * severity: 1
           *
           * temporary value.
           */
          const top =
            result.conditions?.length
              ? [
                  ...result.conditions,
                ].sort(
                  (
                    a,
                    b,
                  ) =>
                    b.likelihood -
                    a.likelihood,
                )[0] ?? null
              : null;

          const savedMatchStrength =
            normalizeMatchStrength(
              top?.likelihood ??
                0,
            );

          /*
           * Extract vitals ONLY from patient-reported information.
           *
           * No follow-up question text is included.
           */
          const vitals =
            extractVitals(
              patientReportedText,
            );

          return saveFn({
            data: {
              symptoms:
                symptoms.trim(),

              duration:
                duration.trim() ||
                undefined,

              severity:
                savedMatchStrength,

              urgency:
                result.urgency,

              topCondition:
                top?.name ??
                "",

              summary:
                result.summary ??
                "",

              redFlag:
                Boolean(
                  result.redFlag,
                ),

              redFlags:
                result.redFlags ??
                [],

              categories:
                result.categories ??
                [],

              supportingFactors:
                result.supportingFactors ??
                [],

              uncertainty:
                result.uncertainty ??
                "",

              nextStep:
                result.nextStep ??
                "",

              subjectType:
                "patient",

              patientId,

              vitals,
            },
          });
        },

      onSuccess:
        async (
          saved,
        ) => {
          /*
           * IMPORTANT:
           * Save state is set from the actual server response ID.
           *
           * Never use:
           * setSavedId("saved")
           */
          setSavedId(
            saved.id,
          );

          setSaveError(
            null,
          );

          /*
           * Patient history has its own cache key.
           */
          await queryClient.invalidateQueries(
            {
              queryKey: [
                "patient-checks",
                patientId,
              ],
            },
          );
        },

      onError:
        () => {
          setSaveError(
            "Could not save this symptom check. Please try again.",
          );
        },
    });

  /* ------------------------------------------------------------------------ */
  /*                         Validation                                      */
  /* ------------------------------------------------------------------------ */

  const validateIntake =
    () => {
      if (
        !symptoms.trim()
      ) {
        setFormError(
          "Please describe the patient's symptoms.",
        );

        return false;
      }

      setFormError(
        null,
      );

      return true;
    };

  /* ------------------------------------------------------------------------ */
  /*                         Start Patient Check                              */
  /* ------------------------------------------------------------------------ */

  const startCheck =
    async () => {
      if (
        !validateIntake()
      ) {
        return;
      }

      /*
       * Generic immediate safety assessment.
       *
       * Do NOT pass patientId here because the generic emergency
       * function does not accept patientId.
       */
      const safety =
        await immediateMutation.mutateAsync(
          {
            symptoms:
              symptoms.trim(),

            duration:
              duration.trim() ||
              undefined,

            language:
              lang === "bn"
                ? "bn"
                : "en",
          },
        );

      /*
       * Emergency and urgent are intentionally different.
       *
       * Only emergency immediately ends the normal flow.
       */
      if (
        safety?.urgency ===
        "emergency"
      ) {
        setAssessment(
          safety,
        );

        setStage(
          "result",
        );

        return;
      }

      /*
       * Get questions using the patient-specific server function.
       * That function verifies patient ownership and loads the
       * patient's profile server-side.
       */
      const result =
        await questionsMutation.mutateAsync();

      const nextQuestions =
        result?.questions ??
        [];

      if (
        nextQuestions.length ===
        0
      ) {
        const finalAssessment =
          await assessmentMutation.mutateAsync(
            [],
          );

        /*
         * assessmentMutation handles result state.
         */
        void finalAssessment;

        return;
      }

      setQuestions(
        nextQuestions,
      );

      setAnswers(
        {},
      );

      setCurrentAnswer(
        "",
      );

      setStep(
        0,
      );

      setStage(
        "questions",
      );
    };

  /* ------------------------------------------------------------------------ */
  /*                         Submit Question                                  */
  /* ------------------------------------------------------------------------ */

  const submitAnswer =
    async () => {
      const currentQuestion =
        questions[
          step
        ];

      if (
        !currentQuestion
      ) {
        return;
      }

      const answer =
        currentAnswer.trim();

      if (!answer) {
        return;
      }

      const updatedAnswers =
        {
          ...answers,

          [currentQuestion.id]:
            answer,
        };

      setAnswers(
        updatedAnswers,
      );

      const updatedPairs =
        questions
          .map(
            (
              question,
            ) => ({
              question:
                question.question,

              answer:
                (
                  updatedAnswers[
                    question.id
                  ] ??
                  ""
                ).trim(),
            }),
          )
          .filter(
            (
              item,
            ) =>
              Boolean(
                item.answer,
              ),
          );

      /*
       * Immediate safety check uses ONLY patient-reported answers.
       *
       * The question text is sent as structure to the safety function,
       * but the emergency/red-flag logic must evaluate the patient's
       * answer rather than treating the question itself as a symptom.
       */
      const safety =
        await immediateMutation.mutateAsync(
          {
            symptoms:
              symptoms.trim(),

            duration:
              duration.trim() ||
              undefined,

            language:
              lang === "bn"
                ? "bn"
                : "en",

            answers:
              updatedPairs,
          },
        );

      if (
        safety?.urgency ===
        "emergency"
      ) {
        setAssessment(
          safety,
        );

        setStage(
          "result",
        );

        return;
      }

      if (
        step <
        questions.length -
          1
      ) {
        setStep(
          (
            currentStep,
          ) =>
            currentStep +
            1,
        );

        setCurrentAnswer(
          "",
        );

        return;
      }

      await assessmentMutation.mutateAsync(
        updatedPairs,
      );
    };

  /* ------------------------------------------------------------------------ */
  /*                         Previous Question                                */
  /* ------------------------------------------------------------------------ */

  const previousQuestion =
    () => {
      if (
        step <= 0
      ) {
        return;
      }

      const previous =
        questions[
          step - 1
        ];

      setStep(
        (
          currentStep,
        ) =>
          currentStep -
          1,
      );

      setCurrentAnswer(
        previous
          ? answers[
              previous.id
            ] ??
              ""
          : "",
      );
    };

  /* ------------------------------------------------------------------------ */
  /*                             Save Result                                  */
  /* ------------------------------------------------------------------------ */

  const saveResult =
    () => {
      if (
        !assessment ||
        saveMutation.isPending ||
        savedId
      ) {
        return;
      }

      setSaveError(
        null,
      );

      saveMutation.mutate(
        assessment,
      );
    };

  /* ------------------------------------------------------------------------ */
  /*                                Reset                                     */
  /* ------------------------------------------------------------------------ */

  const reset =
    () => {
      setStage(
        "intake",
      );

      setSymptoms(
        "",
      );

      setDuration(
        "",
      );

      setQuestions(
        [],
      );

      setAnswers(
        {},
      );

      setCurrentAnswer(
        "",
      );

      setStep(
        0,
      );

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

      immediateMutation.reset();
      questionsMutation.reset();
      assessmentMutation.reset();
      saveMutation.reset();
    };

  /* ------------------------------------------------------------------------ */
  /*                              Loading                                     */
  /* ------------------------------------------------------------------------ */

  if (
    patientQuery.isLoading
  ) {
    return (
      <main className="min-h-screen bg-background">
        <ProfileMenu />

        <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center justify-center px-5 py-8">
          <div
            className="flex items-center gap-3 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Loader2 className="size-5 animate-spin" />

            Loading patient
            profile…
          </div>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*                              Patient Error                               */
  /* ------------------------------------------------------------------------ */

  if (
    patientQuery.isError ||
    !patient
  ) {
    return (
      <main className="min-h-screen bg-background">
        <ProfileMenu />

        <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center justify-center px-5 py-8">
          <Card className="w-full max-w-lg">
            <CardContent className="flex flex-col items-center justify-center px-6 py-10 text-center">

              <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-7" />
              </div>

              <h1 className="mt-5 text-xl font-semibold">
                Patient profile unavailable
              </h1>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This patient profile could
                not be loaded. It may have
                been removed or you may not
                have access to it.
              </p>

              <Button
                asChild
                className="mt-6"
              >
                <Link
                  to="/patients"
                >
                  <ArrowLeft className="mr-2 size-4" />
                  Back to Patients
                </Link>
              </Button>

            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*                              Main UI                                     */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-background">
      <ProfileMenu />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:py-12">

        {/* ---------------------------------------------------------------- */}
        {/* Top Navigation                                                     */}
        {/* ---------------------------------------------------------------- */}

        <div className="flex flex-wrap items-center justify-between gap-3">

          <Button
            asChild
            variant="ghost"
            size="sm"
          >
            <Link
              to="/patients"
            >
              <ArrowLeft className="mr-2 size-4" />
              Patients
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
          >
            <Link
              to="/patient-history/$patient_ID"
              params={{
                patient_ID:
                  patientId,
              }}
            >
              <BarChartIcon />
              View History
            </Link>
          </Button>

        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Patient Context Header                                            */}
        {/* ---------------------------------------------------------------- */}

        <Card className="overflow-hidden">

          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-4">

              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="size-6" />
              </div>

              <div className="min-w-0">

                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Symptom check for
                </p>

                <h1 className="mt-1 truncate font-display text-2xl">
                  {patientName}
                </h1>

                <p className="mt-1 text-sm text-muted-foreground">
                  Patient profile information
                  will be considered as context
                  for this assessment.
                </p>

              </div>

            </div>

            <Badge
              variant="secondary"
              className="w-fit shrink-0"
            >
              Patient Check
            </Badge>

          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Intake                                                            */}
        {/* ---------------------------------------------------------------- */}

        {stage ===
        "intake" ? (
          <Card>

            <CardHeader>

              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="size-5 text-primary" />
                What symptoms does{" "}
                {patientName}
                have?
              </CardTitle>

              <CardDescription>
                Describe the symptoms in your
                own words. The patient's saved
                profile will be used as
                background context.
              </CardDescription>

            </CardHeader>

            <CardContent className="space-y-6">

              <div className="space-y-2">

                <Label htmlFor="patient-symptoms">
                  Symptoms
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
                  placeholder="For example: fever, sore throat and tiredness…"
                  className="min-h-32 resize-y"
                  disabled={
                    immediateMutation.isPending ||
                    questionsMutation.isPending
                  }
                />

              </div>

              <div className="space-y-2">

                <Label htmlFor="patient-duration">
                  How long has this been happening?
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
                  placeholder="For example: 2 days"
                  disabled={
                    immediateMutation.isPending ||
                    questionsMutation.isPending
                  }
                />

              </div>

              {formError ? (
                <Alert
                  variant="destructive"
                >
                  <AlertTriangle className="size-4" />

                  <AlertTitle>
                    Please check the
                    information
                  </AlertTitle>

                  <AlertDescription>
                    {
                      formError
                    }
                  </AlertDescription>
                </Alert>
              ) : null}

              <Alert>
                <Info className="size-4" />

                <AlertTitle>
                  Patient context
                </AlertTitle>

                <AlertDescription>
                  Existing conditions,
                  medications, allergies,
                  previous illnesses and
                  other profile information
                  are background context. They
                  are not automatically treated
                  as current symptoms.
                </AlertDescription>
              </Alert>

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
                questionsMutation.isPending ||
                assessmentMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Assessing…
                  </>
                ) : (
                  <>
                    <MessageCircleQuestion className="mr-2 size-4" />
                    Continue
                  </>
                )}
              </Button>

            </CardContent>
          </Card>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Follow-Up Questions                                               */}
        {/* ---------------------------------------------------------------- */}

        {stage ===
        "questions" ? (
          <Card>

            <CardHeader>

              <div className="flex items-center justify-between gap-4">

                <div>

                  <CardTitle className="flex items-center gap-2">
                    <MessageCircleQuestion className="size-5 text-primary" />
                    A few follow-up questions
                  </CardTitle>

                  <CardDescription>
                    These questions help
                    refine the symptom
                    assessment for{" "}
                    {patientName}.
                  </CardDescription>

                </div>

                <Badge variant="secondary">
                  {step + 1} /{" "}
                  {
                    questions.length
                  }
                </Badge>

              </div>

              <Progress
                value={
                  ((step + 1) /
                    questions.length) *
                  100
                }
                className="mt-4"
              />

            </CardHeader>

            <CardContent className="space-y-6">

              {questions[
                step
              ] ? (
                <>
                  <div className="rounded-xl border bg-muted/30 p-5">

                    <div className="flex gap-3">

                      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MessageCircleQuestion className="size-4" />
                      </div>

                      <div>

                        <p className="text-base font-medium leading-7">
                          {
                            questions[
                              step
                            ]
                              .question
                          }
                        </p>

                        {questions[
                          step
                        ].help ? (
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {
                              questions[
                                step
                              ].help
                            }
                          </p>
                        ) : null}

                      </div>

                    </div>

                  </div>

                  <div className="space-y-2">

                    <Label htmlFor="patient-answer">
                      Answer
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
                      placeholder="Enter the patient's answer…"
                      className="min-h-28"
                      autoFocus
                    />

                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">

                    <Button
                      variant="outline"
                      onClick={
                        previousQuestion
                      }
                      disabled={
                        step ===
                          0 ||
                        assessmentMutation.isPending ||
                        immediateMutation.isPending
                      }
                    >
                      <ChevronLeft className="mr-2 size-4" />
                      Previous
                    </Button>

                    <Button
                      onClick={
                        submitAnswer
                      }
                      disabled={
                        !currentAnswer.trim() ||
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
                      ) : step ===
                        questions.length -
                          1 ? (
                        <>
                          <Stethoscope className="mr-2 size-4" />
                          Get Assessment
                        </>
                      ) : (
                        <>
                          Next
                          <ChevronRight className="ml-2 size-4" />
                        </>
                      )}
                    </Button>

                  </div>
                </>
              ) : null}

            </CardContent>
          </Card>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Result                                                            */}
        {/* ---------------------------------------------------------------- */}

        {stage ===
          "result" &&
        assessment ? (
          <PatientResult
            assessment={
              assessment
            }
            patientName={
              patientName
            }
            matchStrength={
              matchStrength
            }
            savedId={
              savedId
            }
            saveError={
              saveError
            }
            isSaving={
              saveMutation.isPending
            }
            onSave={
              saveResult
            }
            onReset={
              reset
            }
            patientId={
              patientId
            }
          />
        ) : null}

      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Result Component                               */
/* -------------------------------------------------------------------------- */

function PatientResult({
  assessment,
  patientName,
  matchStrength,
  savedId,
  saveError,
  isSaving,
  onSave,
  onReset,
  patientId,
}: {
  assessment: Assessment;
  patientName: string;
  matchStrength: number;
  savedId: string | null;
  saveError: string | null;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
  patientId: string;
}) {
  const topCondition =
    assessment.conditions?.length
      ? [
          ...assessment.conditions,
        ].sort(
          (
            a,
            b,
          ) =>
            b.likelihood -
            a.likelihood,
        )[0] ?? null
      : null;

  const isEmergency =
    assessment.urgency ===
    "emergency";

  const isUrgent =
    assessment.urgency ===
    "urgent";

  const urgencyLabel =
    getUrgencyLabel(
      assessment.urgency,
    );

  return (
    <div className="space-y-6">

      {/* ------------------------------------------------------------------ */}
      {/* Emergency / Urgency Alert                                           */}
      {/* ------------------------------------------------------------------ */}

      {isEmergency ? (
        <Alert
          variant="destructive"
          className="border-destructive/50"
        >
          <ShieldAlert className="size-5" />

          <AlertTitle>
            Emergency attention may be needed
          </AlertTitle>

          <AlertDescription className="mt-2 leading-6">
            The responses indicate
            features that may require
            immediate medical attention.
            Please contact local emergency
            services or seek emergency care
            now.
          </AlertDescription>
        </Alert>
      ) : isUrgent ? (
        <Alert>
          <AlertTriangle className="size-5" />

          <AlertTitle>
            Urgent medical attention may be appropriate
          </AlertTitle>

          <AlertDescription className="mt-2 leading-6">
            The assessment suggests that
            prompt medical evaluation may
            be appropriate.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Result Header                                                       */}
      {/* ------------------------------------------------------------------ */}

      <Card>

        <CardHeader>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

            <div>

              <div className="flex items-center gap-2">

                <CheckCircle2 className="size-5 text-primary" />

                <CardTitle>
                  Symptom Assessment
                </CardTitle>

              </div>

              <CardDescription className="mt-2">
                Assessment for{" "}
                <span className="font-medium text-foreground">
                  {patientName}
                </span>
              </CardDescription>

            </div>

            <Badge
              variant={
                isEmergency
                  ? "destructive"
                  : isUrgent
                    ? "destructive"
                    : "secondary"
              }
            >
              {urgencyLabel}
            </Badge>

          </div>

        </CardHeader>

        <CardContent className="space-y-6">

          {/* -------------------------------------------------------------- */}
          {/* Match Strength                                                  */}
          {/* -------------------------------------------------------------- */}

          <div className="rounded-xl border bg-muted/30 p-5">

            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-sm font-medium">
                  Symptom Match Strength
                </p>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  A relative strength of the
                  symptom pattern match in
                  this assessment.
                </p>

              </div>

              <div className="text-right">

                <p className="text-2xl font-semibold">
                  {formatMatchStrength(
                    matchStrength,
                  )}
                  %
                </p>

              </div>

            </div>

            <Progress
              value={
                matchStrength
              }
              className="mt-4"
            />

          </div>

          {/* -------------------------------------------------------------- */}
          {/* Possible Match                                                  */}
          {/* -------------------------------------------------------------- */}

          {topCondition ? (
            <div>

              <p className="text-sm font-medium text-muted-foreground">
                Strongest symptom pattern match
              </p>

              <div className="mt-2 flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <h2 className="text-lg font-semibold">
                    {
                      topCondition.name
                    }
                  </h2>

                  {topCondition.description ? (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {
                        topCondition.description
                      }
                    </p>
                  ) : null}

                </div>

                <Badge variant="outline">
                  {formatMatchStrength(
                    topCondition.likelihood,
                  )}
                  % match
                </Badge>

              </div>

            </div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Summary                                                         */}
          {/* -------------------------------------------------------------- */}

          {assessment.summary ? (
            <div>

              <h2 className="text-lg font-semibold">
                Summary
              </h2>

              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {
                  assessment.summary
                }
              </p>

            </div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Supporting Factors                                              */}
          {/* -------------------------------------------------------------- */}

          {assessment.supportingFactors?.length ? (
            <div>

              <h2 className="text-lg font-semibold">
                Supporting factors
              </h2>

              <ul className="mt-3 space-y-2">

                {assessment.supportingFactors.map(
                  (
                    factor,
                    index,
                  ) => (
                    <li
                      key={`${factor}-${index}`}
                      className="flex gap-2 text-sm leading-6 text-muted-foreground"
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />

                      <span>
                        {
                          factor
                        }
                      </span>
                    </li>
                  ),
                )}

              </ul>

            </div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Red Flags                                                       */}
          {/* -------------------------------------------------------------- */}

          {assessment.redFlags?.length ? (
            <Alert
              variant={
                isEmergency
                  ? "destructive"
                  : "default"
              }
            >
              <AlertTriangle className="size-4" />

              <AlertTitle>
                Warning signs
              </AlertTitle>

              <AlertDescription>

                <ul className="mt-2 space-y-1">

                  {assessment.redFlags.map(
                    (
                      flag,
                      index,
                    ) => (
                      <li
                        key={`${flag}-${index}`}
                        className="leading-6"
                      >
                        •{" "}
                        {
                          flag
                        }
                      </li>
                    ),
                  )}

                </ul>

              </AlertDescription>
            </Alert>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Next Step                                                       */}
          {/* -------------------------------------------------------------- */}

          {assessment.nextStep ? (
            <div className="rounded-xl border p-5">

              <div className="flex gap-3">

                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Stethoscope className="size-4" />
                </div>

                <div>

                  <h2 className="font-semibold">
                    Suggested next step
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {
                      assessment.nextStep
                    }
                  </p>

                </div>

              </div>

            </div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Uncertainty                                                     */}
          {/* -------------------------------------------------------------- */}

          {assessment.uncertainty ? (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">
                Important:
              </span>{" "}
              {
                assessment.uncertainty
              }
            </div>
          ) : null}

          <Separator />

          {/* -------------------------------------------------------------- */}
          {/* Save                                                            */}
          {/* -------------------------------------------------------------- */}

          {!savedId ? (
            <div className="space-y-3">

              <Button
                className="w-full"
                size="lg"
                onClick={
                  onSave
                }
                disabled={
                  isSaving
                }
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 size-4" />
                    Save to {patientName}'s History
                  </>
                )}
              </Button>

              {saveError ? (
                <p
                  className="text-center text-xs text-destructive"
                  role="alert"
                >
                  {
                    saveError
                  }
                </p>
              ) : null}

            </div>
          ) : (
            <Alert>
              <CheckCircle2 className="size-4" />

              <AlertTitle>
                Saved successfully
              </AlertTitle>

              <AlertDescription>
                This assessment has been
                saved only to{" "}
                {patientName}'s private
                symptom history.
              </AlertDescription>
            </Alert>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Navigation                                                      */}
          {/* -------------------------------------------------------------- */}

          <div className="flex flex-col gap-3 sm:flex-row">

            <Button
              asChild
              variant="outline"
              className="flex-1"
            >
              <Link
                to="/patient-history/$patient_ID"
                params={{
                  patient_ID:
                    patientId,
                }}
              >
                <BarChartIcon />
                View Patient History
              </Link>
            </Button>

            <Button
              variant="outline"
              className="flex-1"
              onClick={
                onReset
              }
            >
              <Activity className="mr-2 size-4" />
              New Patient Check
            </Button>

          </div>

          {/* -------------------------------------------------------------- */}
          {/* Medical Safety Note                                             */}
          {/* -------------------------------------------------------------- */}

          <div className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
            This assessment is for
            informational and decision-support
            purposes only. It is not a diagnosis
            and does not replace evaluation by a
            qualified healthcare professional.
            Do not stop or change prescribed
            medication based only on this result.
          </div>

        </CardContent>
      </Card>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                           Small Bar Chart Icon                             */
/* -------------------------------------------------------------------------- */

function BarChartIcon() {
  return (
    <span className="mr-2 inline-flex">
      <Activity className="size-4" />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                           Urgency Label                                    */
/* -------------------------------------------------------------------------- */

function getUrgencyLabel(
  urgency: Assessment["urgency"],
) {
  switch (
    urgency
  ) {
    case "emergency":
      return "Emergency";

    case "urgent":
      return "Urgent";

    case "see-a-doctor":
      return "See a doctor";

    case "self-care":
      return "Self-care";

    default:
      return "Assessment";
  }
}

/* -------------------------------------------------------------------------- */
/*                         Match Strength Helpers                             */
/* -------------------------------------------------------------------------- */

function normalizeMatchStrength(
  value: unknown,
): number {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric,
    )
  ) {
    return 0;
  }

  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        numeric,
      ),
    ),
  );
}

function formatMatchStrength(
  value: unknown,
): string {
  return String(
    normalizeMatchStrength(
      value,
    ),
  );
}