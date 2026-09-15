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
import { useMemo } from "react";
import type React from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Loader2,
  TrendingDown,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { getPatient } from "@/lib/profile.functions";
import {
  deleteCheck,
  listPatientChecks,
} from "@/lib/history.functions";
import {
  historyHealthTrendScore,
  historyMatchStrength,
  type HistoryEntry,
} from "@/lib/history";

import { ProfileMenu } from "@/components/ProfileMenu";
import { SymptomTimeline } from "@/components/SymptomTimeline";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/*
 * =========================================================
 * ROUTE
 * =========================================================
 *
 * PATIENT HISTORY ONLY
 *
 * Patient Symptom Checker:
 * /patient-checker/$patient_ID
 *
 * Patient History:
 * /patient-history/$patient_ID
 *
 * IMPORTANT DATA-ISOLATION RULE
 *
 * This route NEVER calls listChecks().
 *
 * It only calls listPatientChecks() with the selected
 * patient ID.
 *
 * The server is responsible for verifying that:
 *
 * 1. The logged-in user is authenticated.
 * 2. The selected patient exists.
 * 3. The selected patient belongs to the logged-in user.
 * 4. Only checks belonging to that patient are returned.
 *
 * Therefore:
 *
 * SELF HISTORY
 *     -> listChecks()
 *
 * PATIENT HISTORY
 *     -> listPatientChecks(patientId)
 *
 * These two histories remain completely separated.
 */

export const Route = createFileRoute(
  "/_authenticated/patient-history/$patient_ID",
)({
  ssr: false,

  beforeLoad: async ({ params }) => {
    /*
     * Dynamic route parameters are required.
     *
     * If the parameter is missing, do not attempt any
     * patient query.
     */
    if (!params.patient_ID) {
      throw redirect({
        to: "/patients",
      });
    }

    return {
      patientId: params.patient_ID,
    };
  },

  component: PatientHistoryPage,
});

/*
 * =========================================================
 * MAIN PAGE
 * =========================================================
 */

function PatientHistoryPage() {
  const { patient_ID: patientId } =
    Route.useParams();

  const queryClient =
    useQueryClient();

  /*
   * =======================================================
   * PATIENT PROFILE
   * =======================================================
   *
   * This query is scoped to the selected patient ID.
   *
   * getPatient() performs the owner verification on the
   * server, so a user cannot use another user's patient ID
   * to retrieve that patient's profile.
   */

  const patientQuery = useQuery({
    queryKey: [
      "patient",
      patientId,
    ],

    enabled:
      Boolean(patientId),

    queryFn: () =>
      getPatient({
        data: {
          id: patientId,
        },
      }),
  });

  /*
   * =======================================================
   * PATIENT-ONLY HISTORY
   * =======================================================
   *
   * HARD DATA ISOLATION
   *
   * This query NEVER calls listChecks().
   *
   * The selected patient ID is passed to the server.
   *
   * history.functions.ts then verifies:
   *
   * patient_profiles.id = patientId
   * AND
   * patient_profiles.owner_user_id = authenticated user
   *
   * Only after that verification are the patient's checks
   * returned.
   */

  const historyQuery = useQuery({
    queryKey: [
      "patient-checks",
      patientId,
    ],

    enabled:
      Boolean(patientId),

    queryFn: () =>
      listPatientChecks({
        data: {
          patientId,
        },
      }),
  });

  /*
   * =======================================================
   * DELETE PATIENT HISTORY
   * =======================================================
   *
   * deleteCheck() performs owner-scoped authorization on
   * the server.
   *
   * This page does NOT send:
   *
   * - user ID
   * - owner ID
   * - arbitrary patient ID
   *
   * to authorize deletion.
   *
   * The server determines ownership from the authenticated
   * session.
   *
   * After deletion, ONLY this patient's history query is
   * invalidated.
   *
   * Self history is never invalidated or modified here.
   */

  const removeMutation =
    useMutation({
      mutationFn: (id: string) =>
        deleteCheck({
          data: {
            id,
          },
        }),

      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: [
            "patient-checks",
            patientId,
          ],
        });
      },
    });

  /*
   * =======================================================
   * RAW QUERY DATA
   * =======================================================
   */

  const patient =
    patientQuery.data;

  const history: HistoryEntry[] =
    historyQuery.data ?? [];

  /*
   * =======================================================
   * CHRONOLOGICAL HISTORY
   * =======================================================
   *
   * Oldest -> newest.
   *
   * This order is used for all graphs and calculations.
   */

  const sortedHistory =
    useMemo(() => {
      return [...history].sort(
        (a, b) =>
          new Date(a.date).getTime() -
          new Date(b.date).getTime(),
      );
    }, [history]);

  /*
   * =======================================================
   * SYMPTOM MATCH STRENGTH DATA
   * =======================================================
   *
   * IMPORTANT:
   *
   * `severity` is legacy storage terminology.
   *
   * In the current application it represents:
   *
   * Symptom Match Strength
   *
   * It is NOT:
   *
   * - medical risk
   * - disease probability
   * - diagnosis probability
   * - AI assessed risk
   *
   * historyMatchStrength() performs the normalization.
   */

  const matchStrengthHistory =
    useMemo(() => {
      return sortedHistory.map(
        (entry) => ({
          entry,
          value:
            historyMatchStrength(
              entry,
            ),
        }),
      );
    }, [sortedHistory]);

  /*
   * =======================================================
   * HEALTH CONDITION TREND DATA
   * =======================================================
   *
   * IMPORTANT DATA-PRESERVATION RULE
   *
   * Only actually stored healthTrendScore values are used.
   *
   * Legacy records with:
   *
   * healthTrendScore = null
   *
   * remain null.
   *
   * We NEVER calculate a new Health Condition Trend score
   * from:
   *
   * - severity
   * - Symptom Match Strength
   * - date
   * - top condition
   * - urgency
   *
   * This prevents historical data from being fabricated.
   */

  const healthTrendHistory =
    useMemo(() => {
      return sortedHistory
        .map((entry) => ({
          entry,
          value:
            historyHealthTrendScore(
              entry,
            ),
        }))
        .filter(
          (
            item,
          ): item is {
            entry: HistoryEntry;
            value: number;
          } =>
            item.value !== null,
        );
    }, [sortedHistory]);

  /*
   * =======================================================
   * LATEST MATCH STRENGTH
   * =======================================================
   */

  const latestMatchStrength =
    matchStrengthHistory.length > 0
      ? matchStrengthHistory[
          matchStrengthHistory.length - 1
        ]?.value ?? 0
      : 0;

  /*
   * =======================================================
   * PREVIOUS MATCH STRENGTH
   * =======================================================
   */

  const previousMatchStrength =
    matchStrengthHistory.length > 1
      ? matchStrengthHistory[
          matchStrengthHistory.length - 2
        ]?.value ?? null
      : null;

  /*
   * =======================================================
   * MATCH STRENGTH TREND
   * =======================================================
   */

  const matchTrend =
    previousMatchStrength === null
      ? "stable"
      : latestMatchStrength >
          previousMatchStrength
        ? "up"
        : latestMatchStrength <
            previousMatchStrength
          ? "down"
          : "stable";

  /*
   * =======================================================
   * AVERAGE MATCH STRENGTH
   * =======================================================
   */

  const averageMatchStrength =
    matchStrengthHistory.length > 0
      ? matchStrengthHistory.reduce(
          (sum, item) =>
            sum + item.value,
          0,
        ) /
        matchStrengthHistory.length
      : 0;

  /*
   * =======================================================
   * LATEST HEALTH CONDITION TREND
   * =======================================================
   */

  const latestHealthTrend =
    healthTrendHistory.length > 0
      ? healthTrendHistory[
          healthTrendHistory.length - 1
        ]?.value ?? null
      : null;

  /*
   * =======================================================
   * PREVIOUS HEALTH CONDITION TREND
   * =======================================================
   */

  const previousHealthTrend =
    healthTrendHistory.length > 1
      ? healthTrendHistory[
          healthTrendHistory.length - 2
        ]?.value ?? null
      : null;

  /*
   * =======================================================
   * HEALTH CONDITION TREND DIRECTION
   * =======================================================
   */

  const healthTrendDirection =
    latestHealthTrend === null ||
    previousHealthTrend === null
      ? "stable"
      : latestHealthTrend >
          previousHealthTrend
        ? "up"
        : latestHealthTrend <
            previousHealthTrend
          ? "down"
          : "stable";

  /*
   * =======================================================
   * AVERAGE HEALTH CONDITION TREND
   * =======================================================
   */

  const averageHealthTrend =
    healthTrendHistory.length > 0
      ? healthTrendHistory.reduce(
          (sum, item) =>
            sum + item.value,
          0,
        ) /
        healthTrendHistory.length
      : null;

  /*
   * =======================================================
   * PATIENT PROFILE LOADING
   * =======================================================
   */

  if (patientQuery.isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <ProfileMenu />

        <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center px-5">
          <div
            className="flex items-center gap-3 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Loader2 className="size-5 animate-spin" />

            Loading patient history…
          </div>
        </div>
      </main>
    );
  }

  /*
   * =======================================================
   * PATIENT PROFILE ACCESS ERROR
   * =======================================================
   *
   * We intentionally do not distinguish between:
   *
   * - patient does not exist
   * - patient belongs to another account
   * - patient cannot be accessed
   *
   * This avoids unnecessarily exposing whether another
   * account's patient ID exists.
   */

  if (
    patientQuery.error ||
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
                This patient may have been deleted
                or may not belong to your account.
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

  /*
   * =======================================================
   * PATIENT HISTORY LOADING
   * =======================================================
   */

  if (
    historyQuery.isLoading
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

            Loading patient history…
          </div>
        </div>
      </main>
    );
  }

  /*
   * =======================================================
   * HISTORY ERROR
   * =======================================================
   */

  if (
    historyQuery.isError
  ) {
    return (
      <main className="min-h-screen bg-background">
        <ProfileMenu />

        <div className="mx-auto max-w-4xl px-5 py-10 sm:py-16">
          <Button
            asChild
            variant="ghost"
            size="sm"
          >
            <Link
              to="/patient-checker/$patient_ID"
              params={{
                patient_ID:
                  patientId,
              }}
            >
              <ArrowLeft className="mr-2 size-4" />

              Back to Patient Check
            </Link>
          </Button>

          <Card className="mt-6">
            <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Activity className="size-6" />
              </div>

              <h2 className="mt-4 font-semibold">
                Unable to load patient history
              </h2>

              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Something went wrong while loading
                the saved checks for this patient.
              </p>

              <Button
                className="mt-5"
                variant="outline"
                onClick={() =>
                  historyQuery.refetch()
                }
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  /*
   * =======================================================
   * MAIN PAGE
   * =======================================================
   */

  return (
    <main className="min-h-screen bg-background">
      <ProfileMenu />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:py-12">

        {/* =================================================
            BACK TO PATIENT CHECKER
        ================================================== */}

        <Button
          asChild
          variant="ghost"
          size="sm"
        >
          <Link
            to="/patient-checker/$patient_ID"
            params={{
              patient_ID:
                patientId,
            }}
          >
            <ArrowLeft className="mr-2 size-4" />

            Back to Patient Check
          </Link>
        </Button>

        {/* =================================================
            PATIENT HEADER
        ================================================== */}

        <section className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="size-6" />
          </div>

          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              Patient history
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

        {/* =================================================
            DATA SEPARATION NOTICE
        ================================================== */}

        <div className="rounded-xl border bg-muted/40 px-4 py-3">
          <p className="text-sm leading-6 text-muted-foreground">
            This is{" "}
            <span className="font-medium text-foreground">
              {patient.name}
            </span>
            's separate symptom history. It does
            not include your own self-check history.
          </p>
        </div>

        {/* =================================================
            EMPTY HISTORY
        ================================================== */}

        {history.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BarChart3 className="size-7" />
              </div>

              <h2 className="mt-5 text-lg font-semibold">
                No symptom history yet
              </h2>

              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                No saved symptom checks have been
                recorded for {patient.name} yet.
              </p>

              <Button
                asChild
                className="mt-6"
              >
                <Link
                  to="/patient-checker/$patient_ID"
                  params={{
                    patient_ID:
                      patientId,
                  }}
                >
                  Start Patient Symptom Check
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* =================================================
                SUMMARY CARDS
            ================================================== */}

            <section
              aria-label="Patient symptom history summary"
              className="grid gap-4 sm:grid-cols-3"
            >
              <SummaryCard
                icon={
                  <CalendarDays className="size-5" />
                }
                label="Saved checks"
                value={String(
                  history.length,
                )}
              />

              <SummaryCard
                icon={
                  <Activity className="size-5" />
                }
                label="Latest match strength"
                value={`${formatPercentage(
                  latestMatchStrength,
                )}%`}
              />

              <SummaryCard
                icon={
                  matchTrend === "up" ? (
                    <TrendingUp className="size-5" />
                  ) : matchTrend === "down" ? (
                    <TrendingDown className="size-5" />
                  ) : (
                    <Activity className="size-5" />
                  )
                }
                label="Recent match trend"
                value={
                  matchTrend === "up"
                    ? "Higher"
                    : matchTrend === "down"
                      ? "Lower"
                      : "Stable"
                }
              />
            </section>

            {/* =================================================
                HEALTH CONDITION TREND
            ================================================== */}

            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="size-5" />

                      Health Condition Trend
                    </CardTitle>

                    <CardDescription className="mt-1">
                      A non-clinical indicator based on
                      {` ${patient.name}'s`} saved
                      symptom-check information.
                    </CardDescription>
                  </div>

                  {latestHealthTrend !==
                    null && (
                    <Badge variant="secondary">
                      {formatPercentage(
                        latestHealthTrend,
                      )}
                      %
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="pt-5">
                {healthTrendHistory.length ===
                0 ? (
                  <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
                    <Activity className="size-8 text-muted-foreground" />

                    <p className="mt-3 text-sm font-medium">
                      Health trend data is not available yet
                    </p>

                    <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                      New saved checks will appear here
                      after a Health Condition Trend score
                      is recorded. Older checks without a
                      stored trend score are not converted
                      into one.
                    </p>
                  </div>
                ) : (
                  <>
                    <HealthTrendGraph
                      entries={
                        healthTrendHistory
                      }
                    />

                    <div className="mt-5 flex items-start justify-between gap-4 text-xs text-muted-foreground">
                      <span>
                        0% — Worse reported condition
                      </span>

                      <span className="text-center">
                        Higher score = better reported
                        condition
                      </span>

                      <span>
                        100% — Better reported condition
                      </span>
                    </div>

                    <Separator className="my-5" />

                    <div className="grid gap-3 sm:grid-cols-3">
                      <TrendSummary
                        label="Latest"
                        value={
                          latestHealthTrend !==
                          null
                            ? `${formatPercentage(
                                latestHealthTrend,
                              )}%`
                            : "—"
                        }
                      />

                      <TrendSummary
                        label="Average"
                        value={
                          averageHealthTrend !==
                          null
                            ? `${formatPercentage(
                                averageHealthTrend,
                              )}%`
                            : "—"
                        }
                      />

                      <TrendSummary
                        label="Recent change"
                        value={
                          healthTrendDirection ===
                          "up"
                            ? "Better"
                            : healthTrendDirection ===
                                "down"
                              ? "Worse"
                              : "Stable"
                        }
                      />
                    </div>

                    <div className="mt-5 rounded-lg bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
                      This is a non-clinical trend
                      indicator. It is not a diagnosis,
                      disease probability, medical risk,
                      prognosis, or validated clinical score.
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* =================================================
                SYMPTOM MATCH STRENGTH
            ================================================== */}

            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="size-5" />

                      Symptom Match Strength
                    </CardTitle>

                    <CardDescription className="mt-1">
                      Symptom-match strength recorded
                      across {patient.name}'s saved
                      symptom checks.
                    </CardDescription>
                  </div>

                  <Badge variant="secondary">
                    {history.length}{" "}
                    {history.length === 1
                      ? "check"
                      : "checks"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-5">
                <MatchStrengthGraph
                  entries={
                    matchStrengthHistory
                  }
                />

                <div className="mt-5 flex items-start justify-between gap-4 text-xs text-muted-foreground">
                  <span>
                    0% — Low match
                  </span>

                  <span className="text-center">
                    Symptom Match Strength
                  </span>

                  <span>
                    100% — Strong match
                  </span>
                </div>

                <Separator className="my-5" />

                <div className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  This graph shows symptom-match
                  strength recorded during saved checks.
                  It is not a diagnosis and the percentage
                  is not a clinically validated probability.
                </div>
              </CardContent>
            </Card>

            {/* =================================================
                HISTORY OVERVIEW
            ================================================== */}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  History overview
                </CardTitle>

                <CardDescription>
                  Average symptom-match strength across
                  {` ${patient.name}'s`} saved checks:{" "}
                  <span className="font-medium text-foreground">
                    {formatPercentage(
                      averageMatchStrength,
                    )}
                    %
                  </span>
                  .
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  {sortedHistory
                    .slice()
                    .reverse()
                    .slice(0, 5)
                    .map((entry) => (
                      <HistorySummaryRow
                        key={entry.id}
                        entry={entry}
                      />
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* =================================================
                SAVED CHECKS
            ================================================== */}

            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  Saved checks
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Review or remove individual entries
                  from {patient.name}'s history.
                </p>
              </div>

              {/*
               * IMPORTANT
               *
               * SymptomTimeline is intentionally a
               * SAVED-CHECK LIST ONLY.
               *
               * It must NOT render:
               *
               * - Symptom Match Strength graph
               * - Health Condition Trend graph
               * - AI Risk graph
               *
               * The two graphs above are the only graphs
               * on this patient history page:
               *
               * 1. Health Condition Trend
               * 2. Symptom Match Strength
               *
               * This prevents the duplicate graph that was
               * previously appearing under Saved checks.
               */}

              <SymptomTimeline
                entries={
                  sortedHistory
                }
                onRemove={(id) =>
                  removeMutation.mutate(
                    id,
                  )
                }
              />

              {removeMutation.isPending && (
                <div
                  className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  <Loader2 className="size-3.5 animate-spin" />

                  Removing history entry…
                </div>
              )}

              {removeMutation.isError && (
                <p
                  className="mt-3 text-right text-xs text-destructive"
                  role="alert"
                >
                  Could not remove this history entry.
                  Please try again.
                </p>
              )}
            </section>
          </>
        )}

        {/* =================================================
            FOOTER ACTIONS
        ================================================== */}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            variant="outline"
            className="flex-1"
          >
            <Link
              to="/patient-checker/$patient_ID"
              params={{
                patient_ID:
                  patientId,
              }}
            >
              Check {patient.name}'s Symptoms
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="flex-1"
          >
            <Link to="/patients">
              All Patient Profiles
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

/*
 * =========================================================
 * SUMMARY CARD
 * =========================================================
 */

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>

          <p className="mt-1 truncate text-xl font-semibold">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/*
 * =========================================================
 * TREND SUMMARY
 * =========================================================
 */

function TrendSummary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-lg font-semibold">
        {value}
      </p>
    </div>
  );
}

/*
 * =========================================================
 * HEALTH CONDITION TREND GRAPH
 * =========================================================
 *
 * Only actual stored healthTrendScore values are rendered.
 *
 * Legacy null values are intentionally excluded.
 */

function HealthTrendGraph({
  entries,
}: {
  entries: Array<{
    entry: HistoryEntry;
    value: number;
  }>;
}) {
  const points =
    entries.slice(-10);

  if (points.length === 0) {
    return null;
  }

  const width = 760;
  const height = 300;

  const paddingLeft = 48;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 44;

  const chartWidth =
    width -
    paddingLeft -
    paddingRight;

  const chartHeight =
    height -
    paddingTop -
    paddingBottom;

  const getX = (
    index: number,
  ) => {
    if (points.length === 1) {
      return (
        paddingLeft +
        chartWidth / 2
      );
    }

    return (
      paddingLeft +
      (index /
        (points.length - 1)) *
        chartWidth
    );
  };

  const getY = (
    value: number,
  ) => {
    const score =
      clampScore(value);

    return (
      paddingTop +
      (1 - score / 100) *
        chartHeight
    );
  };

  const coordinates =
    points.map(
      (
        point,
        index,
      ) => ({
        x: getX(index),
        y: getY(
          point.value,
        ),
        value:
          clampScore(
            point.value,
          ),
        entry:
          point.entry,
      }),
    );

  const path =
    coordinates
      .map(
        (
          point,
          index,
        ) =>
          index === 0
            ? `M ${point.x} ${point.y}`
            : `L ${point.x} ${point.y}`,
      )
      .join(" ");

  const gridValues = [
    0,
    25,
    50,
    75,
    100,
  ];

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[620px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Health Condition Trend graph"
        >
          {gridValues.map(
            (value) => {
              const y =
                getY(value);

              return (
                <g key={value}>
                  <line
                    x1={
                      paddingLeft
                    }
                    x2={
                      width -
                      paddingRight
                    }
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity="0.12"
                    strokeWidth="1"
                  />

                  <text
                    x={
                      paddingLeft -
                      10
                    }
                    y={
                      y + 4
                    }
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {value}%
                  </text>
                </g>
              );
            },
          )}

          <line
            x1={paddingLeft}
            x2={paddingLeft}
            y1={paddingTop}
            y2={
              height -
              paddingBottom
            }
            stroke="currentColor"
            strokeOpacity="0.2"
          />

          <line
            x1={paddingLeft}
            x2={
              width -
              paddingRight
            }
            y1={
              height -
              paddingBottom
            }
            y2={
              height -
              paddingBottom
            }
            stroke="currentColor"
            strokeOpacity="0.2"
          />

          {coordinates.length >
            1 && (
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            />
          )}

          {coordinates.map(
            (
              point,
            ) => (
              <g
                key={
                  point.entry.id
                }
              >
                <circle
                  cx={
                    point.x
                  }
                  cy={
                    point.y
                  }
                  r="6"
                  className="fill-primary"
                />

                <circle
                  cx={
                    point.x
                  }
                  cy={
                    point.y
                  }
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.12"
                />

                <text
                  x={
                    point.x
                  }
                  y={
                    point.y -
                    14
                  }
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-medium"
                >
                  {
                    point.value
                  }
                  %
                </text>

                <text
                  x={
                    point.x
                  }
                  y={
                    height -
                    paddingBottom +
                    22
                  }
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatShortDate(
                    point.entry.date,
                  )}
                </text>
              </g>
            ),
          )}

          <text
            x="14"
            y={
              height / 2
            }
            transform={`rotate(-90 14 ${height / 2})`}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            Health Trend
          </text>
        </svg>
      </div>
    </div>
  );
}

/*
 * =========================================================
 * SYMPTOM MATCH STRENGTH GRAPH
 * =========================================================
 *
 * `severity` is interpreted ONLY through
 * historyMatchStrength().
 *
 * It is never treated as Health Condition Trend.
 */

function MatchStrengthGraph({
  entries,
}: {
  entries: Array<{
    entry: HistoryEntry;
    value: number;
  }>;
}) {
  const points =
    entries.slice(-10);

  if (points.length === 0) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed bg-muted/20">
        <p className="text-sm text-muted-foreground">
          No graph data available.
        </p>
      </div>
    );
  }

  const width = 760;
  const height = 300;

  const paddingLeft = 48;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 44;

  const chartWidth =
    width -
    paddingLeft -
    paddingRight;

  const chartHeight =
    height -
    paddingTop -
    paddingBottom;

  const getX = (
    index: number,
  ) => {
    if (points.length === 1) {
      return (
        paddingLeft +
        chartWidth / 2
      );
    }

    return (
      paddingLeft +
      (index /
        (points.length - 1)) *
        chartWidth
    );
  };

  const getY = (
    value: number,
  ) => {
    const score =
      clampScore(value);

    return (
      paddingTop +
      (1 - score / 100) *
        chartHeight
    );
  };

  const coordinates =
    points.map(
      (
        point,
        index,
      ) => ({
        x: getX(index),
        y: getY(
          point.value,
        ),
        value:
          clampScore(
            point.value,
          ),
        entry:
          point.entry,
      }),
    );

  const path =
    coordinates
      .map(
        (
          point,
          index,
        ) =>
          index === 0
            ? `M ${point.x} ${point.y}`
            : `L ${point.x} ${point.y}`,
      )
      .join(" ");

  const gridValues = [
    0,
    25,
    50,
    75,
    100,
  ];

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[620px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Symptom Match Strength graph"
        >
          {gridValues.map(
            (value) => {
              const y =
                getY(value);

              return (
                <g key={value}>
                  <line
                    x1={
                      paddingLeft
                    }
                    x2={
                      width -
                      paddingRight
                    }
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity="0.12"
                    strokeWidth="1"
                  />

                  <text
                    x={
                      paddingLeft -
                      10
                    }
                    y={
                      y + 4
                    }
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {value}%
                  </text>
                </g>
              );
            },
          )}

          <line
            x1={paddingLeft}
            x2={paddingLeft}
            y1={paddingTop}
            y2={
              height -
              paddingBottom
            }
            stroke="currentColor"
            strokeOpacity="0.2"
          />

          <line
            x1={paddingLeft}
            x2={
              width -
              paddingRight
            }
            y1={
              height -
              paddingBottom
            }
            y2={
              height -
              paddingBottom
            }
            stroke="currentColor"
            strokeOpacity="0.2"
          />

          {coordinates.length >
            1 && (
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            />
          )}

          {coordinates.map(
            (
              point,
            ) => (
              <g
                key={
                  point.entry.id
                }
              >
                <circle
                  cx={
                    point.x
                  }
                  cy={
                    point.y
                  }
                  r="6"
                  className="fill-primary"
                />

                <circle
                  cx={
                    point.x
                  }
                  cy={
                    point.y
                  }
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.12"
                />

                <text
                  x={
                    point.x
                  }
                  y={
                    point.y -
                    14
                  }
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-medium"
                >
                  {
                    point.value
                  }
                  %
                </text>

                <text
                  x={
                    point.x
                  }
                  y={
                    height -
                    paddingBottom +
                    22
                  }
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatShortDate(
                    point.entry.date,
                  )}
                </text>
              </g>
            ),
          )}

          <text
            x="14"
            y={
              height / 2
            }
            transform={`rotate(-90 14 ${height / 2})`}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            Match Strength
          </text>
        </svg>
      </div>
    </div>
  );
}

/*
 * =========================================================
 * HISTORY SUMMARY ROW
 * =========================================================
 */

function HistorySummaryRow({
  entry,
}: {
  entry: HistoryEntry;
}) {
  const matchStrength =
    historyMatchStrength(
      entry,
    );

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />

          <span className="text-sm font-medium">
            {formatHistoryDate(
              entry.date,
            )}
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {entry.symptoms ||
            "Symptom check"}
        </p>

        {entry.topCondition && (
          <p className="mt-1 text-xs text-muted-foreground">
            Main possible condition:{" "}
            <span className="font-medium text-foreground">
              {entry.topCondition}
            </span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
        <Badge variant="secondary">
          {formatPercentage(
            matchStrength,
          )}
          %
        </Badge>

        <span className="text-xs text-muted-foreground">
          {formatUrgency(
            entry.urgency,
          )}
        </span>
      </div>
    </div>
  );
}

/*
 * =========================================================
 * HELPERS
 * =========================================================
 */

function clampScore(
  value: number,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
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

function formatPercentage(
  value: number,
): string {
  return clampScore(
    value,
  ).toString();
}

function formatHistoryDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        "medium",
      timeStyle:
        "short",
    },
  ).format(date);
}

function formatShortDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  ).format(date);
}

function formatUrgency(
  urgency: HistoryEntry["urgency"],
): string {
  switch (urgency) {
    case "emergency":
      return "Emergency";

    case "urgent":
      return "Urgent";

    case "see-a-doctor":
      return "See a doctor";

    case "self-care":
      return "Self-care";

    default:
      return urgency;
  }
}