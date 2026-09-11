import {
  createFileRoute,
  Link,
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
  type ReactNode,
} from "react";

import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  LangContext,
  useLang,
  type Lang,
} from "@/lib/i18n";

import type {
  HistoryEntry,
} from "@/lib/history";

import {
  deleteCheck,
  listChecks,
} from "@/lib/history.functions";

import {
  ProfileMenu,
} from "@/components/ProfileMenu";

import {
  SymptomTimeline,
} from "@/components/SymptomTimeline";

import {
  Button,
} from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Separator,
} from "@/components/ui/separator";

/* -------------------------------------------------------------------------- */
/*                                  Route                                     */
/* -------------------------------------------------------------------------- */

export const Route =
  createFileRoute(
    "/_authenticated/history",
  )({
    head: () => ({
      meta: [
        {
          title:
            "My Symptom History — SymptomScope",
        },

        {
          name:
            "description",

          content:
            "Review your saved symptom checks and symptom-match trend over time.",
        },

        {
          property:
            "og:title",

          content:
            "My Symptom History — SymptomScope",
        },

        {
          property:
            "og:description",

          content:
            "Your private symptom-check timeline and symptom-match trend.",
        },

        {
          property:
            "og:type",

          content:
            "website",
        },

        {
          name:
            "twitter:card",

          content:
            "summary_large_image",
        },
      ],
    }),

    component:
      HistoryRoute,
  });

/* -------------------------------------------------------------------------- */
/*                              Language Wrapper                              */
/* -------------------------------------------------------------------------- */

function HistoryRoute() {
  const [lang, setLang] =
    useState<Lang>("en");

  return (
    <LangContext.Provider
      value={{
        lang,
        setLang,
      }}
    >
      <HistoryBody />
    </LangContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Main History Body                             */
/* -------------------------------------------------------------------------- */

function HistoryBody() {
  const { t } =
    useLang();

  const listFn =
    useServerFn(
      listChecks,
    );

  const deleteFn =
    useServerFn(
      deleteCheck,
    );

  const queryClient =
    useQueryClient();

  /* ------------------------------------------------------------------------ */
  /*                         Load SELF History Only                           */
  /* ------------------------------------------------------------------------ */

  const historyQuery =
    useQuery({
      /*
       * IMPORTANT:
       * This cache key belongs exclusively to the logged-in user's
       * self-check history.
       *
       * Patient history uses:
       * ["patient-checks", patientId]
       *
       * Therefore the two histories cannot share the same React Query cache.
       */
      queryKey: [
        "self-checks",
      ],

      queryFn: () =>
        listFn({}),
    });

  /*
   * Server-side listChecks() already guarantees:
   *
   * subject_type = "self"
   * patient_id IS NULL
   *
   * The additional client-side filter is intentionally defensive.
   * It prevents a malformed/legacy record from ever appearing
   * in the Self History UI.
   */
  const history: HistoryEntry[] =
    useMemo(() => {
      const records =
        historyQuery.data ??
        [];

      return records.filter(
        (entry) =>
          entry.subjectType ===
            "self" &&
          !entry.patientId,
      );
    }, [
      historyQuery.data,
    ]);

  /* ------------------------------------------------------------------------ */
  /*                              Delete Entry                                */
  /* ------------------------------------------------------------------------ */

  const removeMutation =
    useMutation({
      mutationFn:
        (
          id: string,
        ) =>
          deleteFn({
            data: {
              id,
            },
          }),

      onSuccess:
        async () => {
          /*
           * Invalidate ONLY self-history.
           *
           * Patient histories use a completely different query key.
           */
          await queryClient.invalidateQueries(
            {
              queryKey: [
                "self-checks",
              ],
            },
          );
        },
    });

  /* ------------------------------------------------------------------------ */
  /*                         Chronological History                            */
  /* ------------------------------------------------------------------------ */

  const sortedHistory =
    useMemo(() => {
      return [
        ...history,
      ].sort(
        (
          a,
          b,
        ) =>
          new Date(
            a.date,
          ).getTime() -
          new Date(
            b.date,
          ).getTime(),
      );
    }, [
      history,
    ]);

  /* ------------------------------------------------------------------------ */
  /*                         Latest Match Strength                            */
  /* ------------------------------------------------------------------------ */

  const latestMatchStrength =
    sortedHistory.length >
    0
      ? normalizeMatchStrength(
          sortedHistory[
            sortedHistory.length -
              1
          ]?.severity ??
            0,
        )
      : 0;

  /* ------------------------------------------------------------------------ */
  /*                       Previous Match Strength                            */
  /* ------------------------------------------------------------------------ */

  const previousMatchStrength =
    sortedHistory.length >
    1
      ? normalizeMatchStrength(
          sortedHistory[
            sortedHistory.length -
              2
          ]?.severity ??
            0,
        )
      : null;

  /* ------------------------------------------------------------------------ */
  /*                                  Trend                                   */
  /* ------------------------------------------------------------------------ */

  const trend =
    previousMatchStrength ===
    null
      ? "stable"
      : latestMatchStrength >
          previousMatchStrength
        ? "up"
        : latestMatchStrength <
            previousMatchStrength
          ? "down"
          : "stable";

  /* ------------------------------------------------------------------------ */
  /*                         Average Match Strength                           */
  /* ------------------------------------------------------------------------ */

  const averageMatchStrength =
    sortedHistory.length >
    0
      ? sortedHistory.reduce(
          (
            sum,
            entry,
          ) =>
            sum +
            normalizeMatchStrength(
              entry.severity,
            ),
          0,
        ) /
        sortedHistory.length
      : 0;

  /* ------------------------------------------------------------------------ */
  /*                              Date Helper                                 */
  /* ------------------------------------------------------------------------ */

  const formatDate =
    (
      date: string,
    ) => {
      const parsed =
        new Date(
          date,
        );

      if (
        Number.isNaN(
          parsed.getTime(),
        )
      ) {
        return date;
      }

      return parsed.toLocaleDateString(
        undefined,
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      );
    };

  /* ------------------------------------------------------------------------ */
  /*                                  UI                                      */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-background">
      <ProfileMenu />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:py-12">

        {/* ---------------------------------------------------------------- */}
        {/* Back to self checker                                             */}
        {/* ---------------------------------------------------------------- */}

        <Button
          asChild
          variant="ghost"
          size="sm"
        >
          <Link
            to="/checker"
            search={{
              subject: "self",
            }}
          >
            <ArrowLeft className="mr-2 size-4" />
            {t.tabCheck}
          </Link>
        </Button>

        {/* ---------------------------------------------------------------- */}
        {/* Page Header                                                       */}
        {/* ---------------------------------------------------------------- */}

        <div>
          <div className="flex items-center gap-3">

            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="size-5" />
            </div>

            <div>
              <h1 className="font-display text-3xl">
                My Symptom History
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Your saved self-checks and
                symptom-match trend.
              </p>
            </div>

          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Loading                                                           */}
        {/* ---------------------------------------------------------------- */}

        {historyQuery.isLoading ? (
          <Card>
            <CardContent className="flex min-h-56 items-center justify-center">
              <div
                className="flex items-center gap-3 text-sm text-muted-foreground"
                aria-live="polite"
              >
                <Loader2 className="size-5 animate-spin" />

                Loading your symptom
                history…
              </div>
            </CardContent>
          </Card>
        ) : historyQuery.isError ? (

          /* -------------------------------------------------------------- */
          /* Error                                                            */
          /* -------------------------------------------------------------- */

          <Card>
            <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">

              <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Activity className="size-6" />
              </div>

              <h2 className="mt-4 font-semibold">
                Unable to load history
              </h2>

              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Something went wrong while
                loading your saved symptom
                checks. Please try again.
              </p>

              <Button
                className="mt-5"
                variant="outline"
                onClick={() =>
                  historyQuery.refetch()
                }
              >
                Try again
              </Button>

            </CardContent>
          </Card>

        ) : history.length ===
          0 ? (

          /* -------------------------------------------------------------- */
          /* Empty                                                            */
          /* -------------------------------------------------------------- */

          <Card>
            <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">

              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BarChart3 className="size-7" />
              </div>

              <h2 className="mt-5 text-lg font-semibold">
                No symptom history yet
              </h2>

              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Complete and save a symptom
                check for yourself. Your
                saved checks will appear here
                with a symptom-match trend.
              </p>

              <Button
                asChild
                className="mt-6"
              >
                <Link
                  to="/checker"
                  search={{
                    subject: "self",
                  }}
                >
                  Start a Self Check
                </Link>
              </Button>

            </CardContent>
          </Card>

        ) : (

          /* -------------------------------------------------------------- */
          /* History Content                                                  */
          /* -------------------------------------------------------------- */

          <>
            {/* ============================================================ */}
            {/* SUMMARY CARDS                                                 */}
            {/* ============================================================ */}

            <section
              aria-label="Symptom history summary"
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
                  trend ===
                  "up" ? (
                    <TrendingUp className="size-5" />
                  ) : trend ===
                    "down" ? (
                    <TrendingDown className="size-5" />
                  ) : (
                    <Activity className="size-5" />
                  )
                }
                label="Recent trend"
                value={
                  trend ===
                  "up"
                    ? "Higher"
                    : trend ===
                        "down"
                      ? "Lower"
                      : "Stable"
                }
              />

            </section>

            {/* ============================================================ */}
            {/* MATCH GRAPH                                                    */}
            {/* ============================================================ */}

            <Card className="overflow-hidden">

              <CardHeader className="pb-2">

                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="size-5" />
                      Symptom Match Trend
                    </CardTitle>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Match strength recorded
                      during your saved
                      self-checks over time.
                    </p>
                  </div>

                  <Badge variant="secondary">
                    {history.length}{" "}
                    {history.length ===
                    1
                      ? "check"
                      : "checks"}
                  </Badge>

                </div>

              </CardHeader>

              <CardContent className="pt-5">

                <MatchStrengthGraph
                  entries={
                    sortedHistory
                  }
                />

                <div className="mt-5 flex items-start justify-between gap-4 text-xs text-muted-foreground">

                  <span>
                    0 — Lower
                  </span>

                  <span className="text-center">
                    Symptom match
                    strength
                  </span>

                  <span>
                    100 — Higher
                  </span>

                </div>

                <Separator className="my-5" />

                <div className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  This graph shows the
                  symptom-match strength
                  recorded during your
                  saved checks. It is a
                  history/trend measure and
                  is not a diagnosis or a
                  clinically validated
                  probability.
                </div>

              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* OVERVIEW                                                       */}
            {/* ============================================================ */}

            <Card>

              <CardHeader>

                <CardTitle className="text-lg">
                  History overview
                </CardTitle>

                <p className="text-sm text-muted-foreground">
                  Your average recorded
                  symptom-match strength
                  across these saved checks
                  is{" "}
                  <span className="font-medium text-foreground">
                    {averageMatchStrength.toFixed(
                      1,
                    )}
                    %
                  </span>
                  .
                </p>

              </CardHeader>

              <CardContent>

                <div className="space-y-3">

                  {sortedHistory
                    .slice()
                    .reverse()
                    .slice(
                      0,
                      5,
                    )
                    .map(
                      (
                        entry,
                      ) => {

                        const matchStrength =
                          normalizeMatchStrength(
                            entry.severity,
                          );

                        return (
                          <div
                            key={
                              entry.id
                            }
                            className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3"
                          >

                            <div className="min-w-0">

                              <p className="truncate text-sm font-medium">
                                {entry.symptoms ||
                                  "Symptom check"}
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDate(
                                  entry.date,
                                )}
                              </p>

                            </div>

                            <Badge
                              variant="outline"
                              className="shrink-0"
                            >
                              {formatMatchStrength(
                                matchStrength,
                              )}
                              %
                            </Badge>

                          </div>
                        );
                      },
                    )}

                </div>

              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* SAVED CHECKS                                                   */}
            {/* ============================================================ */}

            <section>

              <div className="mb-4">

                <h2 className="text-xl font-semibold">
                  Saved checks
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Review or remove individual
                  entries from your private
                  self-check history.
                </p>

              </div>

              <SymptomTimeline
                entries={
                  history
                }
                onRemove={(
                  id,
                ) =>
                  removeMutation.mutate(
                    id,
                  )
                }
              />

              {removeMutation.isPending ? (
                <div
                  className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  Removing entry…
                </div>
              ) : null}

              {removeMutation.isError ? (
                <p
                  className="mt-3 text-right text-xs text-destructive"
                  role="alert"
                >
                  Could not remove that
                  history entry. Please try
                  again.
                </p>
              ) : null}

            </section>
          </>
        )}

      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Summary Card                                 */
/* -------------------------------------------------------------------------- */

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
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

/* -------------------------------------------------------------------------- */
/*                         Match Strength Graph                               */
/* -------------------------------------------------------------------------- */

function MatchStrengthGraph({
  entries,
}: {
  entries: HistoryEntry[];
}) {
  const width =
    760;

  const height =
    280;

  const padding = {
    top: 20,
    right: 24,
    bottom: 48,
    left: 44,
  };

  const chartWidth =
    width -
    padding.left -
    padding.right;

  const chartHeight =
    height -
    padding.top -
    padding.bottom;

  const points =
    entries.map(
      (
        entry,
        index,
      ) => {

        const matchStrength =
          normalizeMatchStrength(
            entry.severity,
          );

        const x =
          entries.length ===
          1
            ? padding.left +
              chartWidth /
                2
            : padding.left +
              (index /
                (entries.length -
                  1)) *
                chartWidth;

        const y =
          padding.top +
          chartHeight -
          (matchStrength /
            100) *
            chartHeight;

        return {
          x,
          y,
          matchStrength,
          entry,
        };
      },
    );

  const path =
    points.length >
    1
      ? points
          .map(
            (
              point,
              index,
            ) =>
              index ===
              0
                ? `M ${point.x} ${point.y}`
                : `L ${point.x} ${point.y}`,
          )
          .join(
            " ",
          )
      : "";

  const gridValues =
    [
      0,
      20,
      40,
      60,
      80,
      100,
    ];

  return (
    <div className="w-full overflow-x-auto">

      <div className="min-w-[620px]">

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label="Symptom match strength trend graph"
        >

          {/* -------------------------------------------------------------- */}
          {/* Grid                                                            */}
          {/* -------------------------------------------------------------- */}

          {gridValues.map(
            (
              value,
            ) => {

              const y =
                padding.top +
                chartHeight -
                (value /
                  100) *
                  chartHeight;

              return (
                <g
                  key={
                    value
                  }
                >

                  <line
                    x1={
                      padding.left
                    }
                    x2={
                      width -
                      padding.right
                    }
                    y1={
                      y
                    }
                    y2={
                      y
                    }
                    stroke="currentColor"
                    strokeOpacity="0.12"
                    strokeWidth="1"
                  />

                  <text
                    x={
                      padding.left -
                      10
                    }
                    y={
                      y + 4
                    }
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {
                      value
                    }
                  </text>

                </g>
              );
            },
          )}

          {/* -------------------------------------------------------------- */}
          {/* Y Axis                                                          */}
          {/* -------------------------------------------------------------- */}

          <line
            x1={
              padding.left
            }
            x2={
              padding.left
            }
            y1={
              padding.top
            }
            y2={
              padding.top +
              chartHeight
            }
            stroke="currentColor"
            strokeOpacity="0.18"
          />

          {/* -------------------------------------------------------------- */}
          {/* X Axis                                                          */}
          {/* -------------------------------------------------------------- */}

          <line
            x1={
              padding.left
            }
            x2={
              width -
              padding.right
            }
            y1={
              padding.top +
              chartHeight
            }
            y2={
              padding.top +
              chartHeight
            }
            stroke="currentColor"
            strokeOpacity="0.18"
          />

          {/* -------------------------------------------------------------- */}
          {/* Trend Line                                                       */}
          {/* -------------------------------------------------------------- */}

          {path ? (
            <path
              d={
                path
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            />
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Data Points                                                      */}
          {/* -------------------------------------------------------------- */}

          {points.map(
            (
              point,
              index,
            ) => (
              <g
                key={
                  point
                    .entry
                    .id
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
                  className="fill-background stroke-primary"
                  strokeWidth="3"
                />

                <text
                  x={
                    point.x
                  }
                  y={
                    point.y -
                    12
                  }
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-medium"
                >
                  {formatMatchStrength(
                    point.matchStrength,
                  )}
                  %
                </text>

                <text
                  x={
                    point.x
                  }
                  y={
                    height -
                    20
                  }
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatGraphDate(
                    point
                      .entry
                      .date,
                    index,
                    entries.length,
                  )}
                </text>

              </g>
            ),
          )}

        </svg>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         Normalization Helpers                              */
/* -------------------------------------------------------------------------- */

/**
 * Normalize any stored match-strength value to 0–100.
 */
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

  return Math.max(
    0,
    Math.min(
      100,
      numeric,
    ),
  );
}

/**
 * Format match strength without unnecessary decimal places.
 */
function formatMatchStrength(
  value: number,
) {
  const safe =
    normalizeMatchStrength(
      value,
    );

  return Number.isInteger(
    safe,
  )
    ? String(
        safe,
      )
    : safe.toFixed(
        1,
      );
}

/* -------------------------------------------------------------------------- */
/*                             Graph Date                                    */
/* -------------------------------------------------------------------------- */

function formatGraphDate(
  date: string,
  index: number,
  _total: number,
) {
  const parsed =
    new Date(
      date,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return `#${index + 1}`;
  }

  return parsed.toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
    },
  );
}