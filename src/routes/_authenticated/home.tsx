import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  HeartPulse,
  LifeBuoy,
  Loader2,
  UserRound,
  UsersRound,
  CircleAlert,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import {
  getOwnProfile,
  listPatientProfiles,
} from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();

  const profileQuery = useQuery({
    queryKey: ["own-profile"],
    queryFn: () => getOwnProfile(),
  });

  const patientsQuery = useQuery({
    queryKey: ["patient-profiles"],
    queryFn: () => listPatientProfiles(),
  });

  const profile = profileQuery.data;

  const firstName =
    profile?.name?.trim().split(/\s+/)[0] || "there";

  /**
   * Profile completion
   *
   * These are the important profile fields required
   * before a meaningful self assessment can be performed.
   */
  const missingProfileFields = profile
    ? [
        !profile.name?.trim() ? "Name" : null,
        !profile.age?.trim() ? "Age" : null,
        !profile.sex ? "Sex" : null,
        !profile.allergies ? "Allergies" : null,
        !profile.existingConditions
          ? "Existing conditions"
          : null,
        !profile.smokingStatus ? "Smoking status" : null,
        !profile.familyHistory?.trim()
          ? "Relevant family history"
          : null,
        profile.sex === "Female" && !profile.pregnancyStatus
          ? "Pregnancy status"
          : null,
      ].filter(Boolean)
    : [];

  const profileComplete =
    !!profile && missingProfileFields.length === 0;

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (profileQuery.error) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
          <Card className="w-full">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />

                <div className="flex-1">
                  <h1 className="font-semibold">
                    Unable to load your profile
                  </h1>

                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    We could not load your profile information.
                    Please try again or open your profile page.
                  </p>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <Button
                      onClick={() =>
                        profileQuery.refetch()
                      }
                    >
                      Try Again
                    </Button>

                    <Button
                      variant="outline"
                      asChild
                    >
                      <Link to="/profile">
                        Open Profile
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">

        {/* =========================================================
            HEADER
        ========================================================== */}
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              SymptomScope
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Hello, {firstName}
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Choose whose symptoms you want to assess.
            </p>
          </div>

          <Link
            to="/profile"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open your profile"
            title="Profile"
          >
            <UserRound className="size-5" />
          </Link>
        </header>

        {/* =========================================================
            PROFILE STATUS
        ========================================================== */}
        {!profileComplete ? (
          <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />

                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">
                    Complete your profile
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Complete your profile before using the
                    self symptom checker so your assessment
                    can use the relevant background information.
                  </p>

                  {missingProfileFields.length > 0 && (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Missing:{" "}
                      {missingProfileFields.join(", ")}
                    </p>
                  )}

                  <Button
                    size="sm"
                    className="mt-4"
                    variant="outline"
                    onClick={() =>
                      navigate({
                        to: "/profile",
                      })
                    }
                  >
                    Complete Profile
                    <ArrowRight />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6 border-border/70 bg-muted/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 shrink-0 text-primary" />

                <div>
                  <p className="text-sm font-medium">
                    Your profile is ready
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Your self symptom checks can use your
                    saved profile information.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* =========================================================
            MAIN HOME OPTIONS
        ========================================================== */}
        <section
          aria-label="Symptom assessment options"
          className="grid gap-5 md:grid-cols-2"
        >

          {/* -------------------------------------------------------
              OPTION 1 — SELF
          -------------------------------------------------------- */}
          <Card className="overflow-hidden border-border/70 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HeartPulse className="size-6" />
              </div>

              <h2 className="mt-5 text-xl font-semibold">
                Symptom Check for Myself
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Describe your own symptoms, answer adaptive
                follow-up questions and review the assessment
                using your own profile and symptom history.
              </p>

              <div className="mt-4 rounded-lg bg-muted/50 p-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  Your assessment and history remain separate
                  from all other patient profiles.
                </p>
              </div>

              <Button
                className="mt-6 w-full sm:w-auto"
                disabled={!profileComplete}
                onClick={() =>
                  navigate({
                    to: "/checker",
                    search: {
                      subject: "self",
                    },
                  })
                }
              >
                Check My Symptoms
                <ArrowRight />
              </Button>

              {!profileComplete && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Complete your profile first to start a
                  self symptom check.
                </p>
              )}
            </CardContent>
          </Card>

          {/* -------------------------------------------------------
              OPTION 2 — SOMEONE ELSE
          -------------------------------------------------------- */}
          <Card className="overflow-hidden border-border/70 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UsersRound className="size-6" />
              </div>

              <h2 className="mt-5 text-xl font-semibold">
                Symptom Check for Someone Else
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Create or choose a separate patient profile,
                then enter that patient's symptoms and review
                their own assessment and history.
              </p>

              <div className="mt-4 rounded-lg bg-muted/50 p-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  Patient profiles, assessments and histories
                  are kept completely separate from your own.
                </p>
              </div>

              <Button
                className="mt-6 w-full sm:w-auto"
                variant="outline"
                onClick={() =>
                  navigate({
                    to: "/patients",
                  })
                }
              >
                Manage Patients
                <ArrowRight />
              </Button>

              {patientsQuery.isLoading ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading patients...
                </div>
              ) : patientsQuery.error ? (
                <p className="mt-3 text-xs text-destructive">
                  Unable to load patient profiles.
                </p>
              ) : patientsQuery.data?.length ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {patientsQuery.data.length} saved patient
                  {patientsQuery.data.length === 1
                    ? ""
                    : "s"}{" "}
                  available.
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  No patient profiles created yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* -------------------------------------------------------
              OPTION 3 — EMERGENCY
          -------------------------------------------------------- */}
          <Card className="border-border/70 shadow-sm md:col-span-2">
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                    <LifeBuoy className="size-6" />
                  </div>

                  <div>
                    <h2 className="text-xl font-semibold">
                      Emergency Helpline Numbers
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                      If someone has a serious or potentially
                      life-threatening emergency, contact
                      emergency services immediately. Do not
                      wait for a symptom assessment.
                    </p>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  className="shrink-0"
                  onClick={() =>
                    navigate({
                      to: "/emergency",
                    })
                  }
                >
                  Emergency Help
                  <ArrowRight />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* =========================================================
            SECONDARY NAVIGATION
        ========================================================== */}
        <Separator className="my-8" />

        <section
          aria-label="History and patient profile"
          className="grid gap-4 sm:grid-cols-2"
        >

          {/* SELF HISTORY */}
          <Link
            to="/history"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Activity className="size-5" />
                </div>

                <div className="min-w-0">
                  <h3 className="font-medium">
                    My Symptom History
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    View your own symptom history and trend.
                  </p>
                </div>

                <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          {/* OTHER PATIENTS */}
          <Link
            to="/patients"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <UsersRound className="size-5" />
                </div>

                <div className="min-w-0">
                  <h3 className="font-medium">
                    Other Patient Profiles
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    View each patient's separate profile and history.
                  </p>
                </div>

                <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </section>

        {/* =========================================================
            SAFETY FOOTNOTE
        ========================================================== */}
        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-muted-foreground">
          SymptomScope provides informational symptom
          assessment and decision-support information. It
          does not provide a definitive diagnosis and does
          not replace a qualified healthcare professional.
        </p>
      </div>
    </main>
  );
}