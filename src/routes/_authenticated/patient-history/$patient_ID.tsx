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
import type { HistoryEntry } from "@/lib/history";

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
 * IMPORTANT:
 *
 * This is the PATIENT HISTORY route.
 *
 * Patient Symptom Checker:
 * /patient-checker/$patient_ID
 *
 * Patient History:
 * /patient-history/$patient_ID
 */

export const Route = createFileRoute(
  "/_authenticated/patient-history/$patient_ID",
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

  /*
   * =======================================================
   * PATIENT-ONLY HISTORY
   * =======================================================
   *
   * IMPORTANT:
   *
   * Never use listChecks() here.
   *
   * listPatientChecks() only returns:
   *
   * subject_type = patient
   * patient_id = selected patient
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

  /*
   * =======================================================
   * DELETE HISTORY
   * =======================================================
   */

  const removeMutation =
    useMutation({
      mutationFn: (id: string) =>
        deleteCheck({
          data: {
            id,
          },
        }),

      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [
            "patient-checks",
            patientId,
          ],
        });
      },
    });

  const patient =
    patientQuery.data;

  const history: HistoryEntry[] =
    historyQuery.data ?? [];

  /*
   * =======================================================
   * CHRONOLOGICAL HISTORY
   * =======================================================
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
   * LATEST MATCH STRENGTH
   * =======================================================
   */

  const latestMatchStrength =
    sortedHistory.length > 0
      ? clampMatchStrength(
          Number(
            sortedHistory[
              sortedHistory.length - 1
            ]?.severity ?? 0,
          ),
        )
      : 0;

  /*
   * =======================================================
   * PREVIOUS MATCH STRENGTH
   * =======================================================
   */

  const previousMatchStrength =
    sortedHistory.length > 1
      ? clampMatchStrength(
          Number(
            sortedHistory[
              sortedHistory.length - 2
            ]?.severity ?? 0,
          ),
        )
      : null;

  /*
   * =======================================================
   * TREND
   * =======================================================
   */

  const trend =
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
    sortedHistory.length > 0
      ? sortedHistory.reduce(
          (sum, entry) =>
            sum +
            clampMatchStrength(
              Number(entry.severity),
            ),
          0,
        ) / sortedHistory.length
      : 0;

  /*
   * =======================================================
   * LOADING PATIENT
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
   * PATIENT NOT FOUND / ACCESS ERROR
   * =======================================================
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
   * HISTORY ERROR
   * =======================================================
   */

  if (historyQuery.isError) {
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
                patient_ID: patientId,
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
              patient_ID: patientId,
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
              {[patient.age, patient.sex]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </section>

        {/* =================================================
            SEPARATION NOTICE
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
                    patient_ID: patientId,
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
                value={`${formatMatchStrength(
                  latestMatchStrength,
                )}%`}
              />

              <SummaryCard
                icon={
                  trend === "up" ? (
                    <TrendingUp className="size-5" />
                  ) : trend === "down" ? (
                    <TrendingDown className="size-5" />
                  ) : (
                    <Activity className="size-5" />
                  )
                }
                label="Recent trend"
                value={
                  trend === "up"
                    ? "Higher"
                    : trend === "down"
                      ? "Lower"
                      : "Stable"
                }
              />
            </section>

            {/* =================================================
                GRAPH
            ================================================== */}

            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="size-5" />

                      Symptom Match Strength Trend
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
                  entries={sortedHistory}
                />

                <div className="mt-5 flex items-start justify-between gap-4 text-xs text-muted-foreground">
                  <span>0% — Low match</span>

                  <span className="text-center">
                    Symptom Match Strength
                  </span>

                  <span>100% — Strong match</span>
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
                  this patient's saved checks:{" "}
                  <span className="font-medium text-foreground">
                    {formatMatchStrength(
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
                FULL TIMELINE
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

              <SymptomTimeline
                entries={history}
                onRemove={(id) =>
                  removeMutation.mutate(id)
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
                patient_ID: patientId,
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
 * HISTORY SUMMARY ROW
 * =========================================================
 */

function HistorySummaryRow({
  entry,
}: {
  entry: HistoryEntry;
}) {
  const matchStrength =
    clampMatchStrength(
      Number(entry.severity),
    );

  const dateLabel =
    formatHistoryDate(entry.date);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />

          <span className="text-sm font-medium">
            {dateLabel}
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
          {formatMatchStrength(
            matchStrength,
          )}
          %
        </Badge>

        {entry.urgency && (
          <span className="text-xs text-muted-foreground">
            {formatUrgency(
              entry.urgency,
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/*
 * =========================================================
 * MATCH STRENGTH GRAPH
 * =========================================================
 *
 * Database column:
 * severity
 *
 * Application meaning:
 * 0–100 symptom-match strength
 *
 * This is NOT:
 * - diagnostic probability
 * - medical risk percentage
 * - confirmed diagnosis probability
 */

function MatchStrengthGraph({
  entries,
}: {
  entries: HistoryEntry[];
}) {
  /*
   * Show latest 10 entries while keeping
   * chronological order.
   */

  const points = entries.slice(-10);

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
    matchStrength: number,
  ) => {
    const value =
      clampMatchStrength(
        matchStrength,
      );

    return (
      paddingTop +
      (1 - value / 100) *
        chartHeight
    );
  };

  const coordinates =
    points.map(
      (
        entry,
        index,
      ) => ({
        x: getX(index),

        y: getY(
          Number(
            entry.severity,
          ),
        ),

        value:
          clampMatchStrength(
            Number(
              entry.severity,
            ),
          ),

        entry,
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

  /*
   * 0–100 scale.
   */

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
          aria-label="Patient symptom match strength trend graph"
        >
          {/* =================================================
              GRID
          ================================================== */}

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

          {/* =================================================
              AXIS
          ================================================== */}

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

          {/* =================================================
              TREND LINE
          ================================================== */}

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

          {/* =================================================
              DATA POINTS
          ================================================== */}

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

                {/* Match strength */}

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

                {/* Date */}

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
                    point
                      .entry
                      .date,
                  )}
                </text>
              </g>
            ),
          )}

          {/* =================================================
              Y-AXIS LABEL
          ================================================== */}

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
 * HELPERS
 * =========================================================
 */

function clampMatchStrength(
  value: number,
) {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      value,
    ),
  );
}

function formatMatchStrength(
  value: number,
) {
  return clampMatchStrength(
    value,
  ).toFixed(1);
}

function formatHistoryDate(
  value: string,
) {
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
) {
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
) {
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