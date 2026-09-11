import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

import { getPatient } from "@/lib/patient.functions";
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

export const Route = createFileRoute(
  "/_authenticated/patient-checker/$patient_ID",
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

  component: PatientHistoryPage,
});

function PatientHistoryPage() {
  const { patientId } = Route.useParams();
  const queryClient = useQueryClient();

  /*
   * ---------------------------------------------------------
   * PATIENT PROFILE
   * ---------------------------------------------------------
   *
   * Only the selected patient is loaded.
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
   * ---------------------------------------------------------
   * PATIENT-ONLY HISTORY
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   *
   * This does NOT use listChecks().
   *
   * Therefore the logged-in user's own ["checks"] history
   * can never be mixed into this graph.
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

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      deleteCheck({
        data: {
          id,
        },
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patient-checks", patientId],
      });
    },
  });

  const patient = patientQuery.data;

  const history: HistoryEntry[] =
    historyQuery.data ?? [];

  const sortedHistory = useMemo(() => {
    return [...history].sort(
      (a, b) =>
        new Date(a.date).getTime() -
        new Date(b.date).getTime(),
    );
  }, [history]);

  const latestSeverity =
    sortedHistory.length > 0
      ? clampSeverity(
          Number(
            sortedHistory[sortedHistory.length - 1]
              .severity,
          ),
        )
      : 0;

  const previousSeverity =
    sortedHistory.length > 1
      ? clampSeverity(
          Number(
            sortedHistory[sortedHistory.length - 2]
              .severity,
          ),
        )
      : null;

  const trend =
    previousSeverity === null
      ? "stable"
      : latestSeverity > previousSeverity
        ? "up"
        : latestSeverity < previousSeverity
          ? "down"
          : "stable";

  const averageSeverity =
    sortedHistory.length > 0
      ? sortedHistory.reduce(
          (sum, entry) =>
            sum +
            clampSeverity(Number(entry.severity)),
          0,
        ) / sortedHistory.length
      : 0;

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * PATIENT NOT FOUND / ACCESS ERROR
   * ---------------------------------------------------------
   */
  if (patientQuery.error || !patient) {
    return (
      <main className="min-h-screen bg-background">
        <ProfileMenu />

        <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
          <Button asChild variant="ghost" size="sm">
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
                This patient may have been deleted or may
                not belong to your account.
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
   * ---------------------------------------------------------
   * ERROR LOADING HISTORY
   * ---------------------------------------------------------
   */
  if (historyQuery.isError) {
    return (
      <main className="min-h-screen bg-background">
        <ProfileMenu />

        <div className="mx-auto max-w-4xl px-5 py-10 sm:py-16">
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/patient-checker/$patientId"
              params={{
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
                Something went wrong while loading the
                saved checks for this patient.
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
   * ---------------------------------------------------------
   * MAIN PAGE
   * ---------------------------------------------------------
   */
  return (
    <main className="min-h-screen bg-background">
      <ProfileMenu />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:py-12">
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/patient-checker/$patientId"
            params={{
              patientId,
            }}
          >
            <ArrowLeft className="mr-2 size-4" />
            Back to Patient Check
          </Link>
        </Button>

        {/* -------------------------------------------------
            PATIENT HEADER
        -------------------------------------------------- */}
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

        {/* -------------------------------------------------
            SEPARATION NOTICE
        -------------------------------------------------- */}
        <div className="rounded-xl border bg-muted/40 px-4 py-3">
          <p className="text-sm leading-6 text-muted-foreground">
            This is <span className="font-medium text-foreground">
              {patient.name}
            </span>
            's separate symptom history. It does not
            include your own self-check history.
          </p>
        </div>

        {/* -------------------------------------------------
            EMPTY STATE
        -------------------------------------------------- */}
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
                No saved symptom checks have been recorded
                for {patient.name} yet.
              </p>

              <Button asChild className="mt-6">
                <Link
                  to="/patient-checker/$patientId"
                  params={{
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
            {/* -------------------------------------------------
                SUMMARY CARDS
            -------------------------------------------------- */}
            <section
              aria-label="Patient symptom history summary"
              className="grid gap-4 sm:grid-cols-3"
            >
              <SummaryCard
                icon={
                  <CalendarDays className="size-5" />
                }
                label="Saved checks"
                value={String(history.length)}
              />

              <SummaryCard
                icon={
                  <Activity className="size-5" />
                }
                label="Latest severity"
                value={`${formatSeverity(
                  latestSeverity,
                )}/10`}
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

            {/* -------------------------------------------------
                GRAPH
            -------------------------------------------------- */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="size-5" />
                      Symptom Severity Trend
                    </CardTitle>

                    <CardDescription className="mt-1">
                      Severity recorded across{" "}
                      {patient.name}'s saved symptom
                      checks.
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
                <SeverityGraph
                  entries={sortedHistory}
                />

                <div className="mt-5 flex items-start justify-between gap-4 text-xs text-muted-foreground">
                  <span>0 — Minimal</span>

                  <span className="text-center">
                    Severity scale
                  </span>

                  <span>10 — Severe</span>
                </div>

                <Separator className="my-5" />

                <div className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  This graph shows the severity recorded
                  during saved checks. It is a history and
                  trend view, not a diagnosis or a clinically
                  validated probability.
                </div>
              </CardContent>
            </Card>

            {/* -------------------------------------------------
                OVERVIEW
            -------------------------------------------------- */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  History overview
                </CardTitle>

                <CardDescription>
                  Average recorded severity across this
                  patient's saved checks:{" "}
                  <span className="font-medium text-foreground">
                    {averageSeverity.toFixed(1)}/10
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

            {/* -------------------------------------------------
                FULL TIMELINE
            -------------------------------------------------- */}
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  Saved checks
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Review or remove individual entries from{" "}
                  {patient.name}'s history.
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

        {/* -------------------------------------------------
            FOOTER ACTIONS
        -------------------------------------------------- */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            variant="outline"
            className="flex-1"
          >
            <Link
              to="/patient-checker/$patientId"
              params={{
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

/**
 * ---------------------------------------------------------
 * SUMMARY CARD
 * ---------------------------------------------------------
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
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {label}
          </p>

          <p className="mt-1 text-lg font-semibold">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ---------------------------------------------------------
 * HISTORY SUMMARY ROW
 * ---------------------------------------------------------
 */
function HistorySummaryRow({
  entry,
}: {
  entry: HistoryEntry;
}) {
  const severity = clampSeverity(
    Number(entry.severity),
  );

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {entry.symptoms || "Symptom check"}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          {formatDate(entry.date)}
        </p>
      </div>

      <Badge variant="outline" className="shrink-0">
        {formatSeverity(severity)}/10
      </Badge>
    </div>
  );
}

/**
 * ---------------------------------------------------------
 * SEVERITY GRAPH
 * ---------------------------------------------------------
 */
function SeverityGraph({
  entries,
}: {
  entries: HistoryEntry[];
}) {
  const width = 760;
  const height = 280;

  const padding = {
    top: 22,
    right: 24,
    bottom: 48,
    left: 44,
  };

  const chartWidth =
    width - padding.left - padding.right;

  const chartHeight =
    height - padding.top - padding.bottom;

  const points = entries.map((entry, index) => {
    const severity = clampSeverity(
      Number(entry.severity),
    );

    const x =
      entries.length === 1
        ? padding.left + chartWidth / 2
        : padding.left +
          (index / (entries.length - 1)) *
            chartWidth;

    const y =
      padding.top +
      chartHeight -
      (severity / 10) * chartHeight;

    return {
      x,
      y,
      severity,
      entry,
    };
  });

  const path =
    points.length > 1
      ? points
          .map((point, index) =>
            index === 0
              ? `M ${point.x} ${point.y}`
              : `L ${point.x} ${point.y}`,
          )
          .join(" ")
      : "";

  const gridValues = [0, 2, 4, 6, 8, 10];

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[620px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label={`${entries.length} saved symptom checks shown on a symptom severity trend graph`}
        >
          {gridValues.map((value) => {
            const y =
              padding.top +
              chartHeight -
              (value / 10) * chartHeight;

            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.12"
                  strokeWidth="1"
                />

                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
                >
                  {value}
                </text>
              </g>
            );
          })}

          <line
            x1={padding.left}
            x2={padding.left}
            y1={padding.top}
            y2={padding.top + chartHeight}
            stroke="currentColor"
            strokeOpacity="0.18"
          />

          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + chartHeight}
            y2={padding.top + chartHeight}
            stroke="currentColor"
            strokeOpacity="0.18"
          />

          {path && (
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

          {points.map((point) => (
            <g key={point.entry.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r="6"
                className="fill-background stroke-primary"
                strokeWidth="3"
              />

              <text
                x={point.x}
                y={point.y - 13}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-medium"
              >
                {formatSeverity(point.severity)}
              </text>

              <text
                x={point.x}
                y={height - 20}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {formatGraphDate(
                  point.entry.date,
                )}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/**
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */
function clampSeverity(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(10, value));
}

function formatSeverity(value: number) {
  const safe = clampSeverity(value);

  return Number.isInteger(safe)
    ? String(safe)
    : safe.toFixed(1);
}

function formatDate(date: string) {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatGraphDate(date: string) {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}