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

  const firstName =
    profileQuery.data?.name?.trim().split(/\s+/)[0] ||
    "there";

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm transition-colors hover:bg-accent"
            aria-label="Open profile"
          >
            <UserRound className="size-5" />
          </Link>
        </header>

        <section className="grid gap-5 md:grid-cols-2">
          <Card className="overflow-hidden border-border/70 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HeartPulse className="size-6" />
              </div>

              <h2 className="mt-5 text-xl font-semibold">
                Symptom Check for Myself
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Describe your own symptoms, answer adaptive follow-up
                questions and review the assessment against your own profile
                and history.
              </p>

              <Button
                className="mt-6 w-full sm:w-auto"
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
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UsersRound className="size-6" />
              </div>

              <h2 className="mt-5 text-xl font-semibold">
                Symptom Check for Someone Else
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Create or choose a separate patient profile. Their symptoms,
                assessment and history remain separate from your own history.
              </p>

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

              {patientsQuery.data?.length ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {patientsQuery.data.length} saved patient
                  {patientsQuery.data.length === 1 ? "" : "s"} available.
                </p>
              ) : null}
            </CardContent>
          </Card>

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
                      Use emergency services when someone has a serious or
                      life-threatening emergency. Do not wait for a symptom
                      assessment in an emergency.
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

        <Separator className="my-8" />

        <section className="grid gap-4 sm:grid-cols-2">
          <Link to="/history">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Activity className="size-5" />
                </div>
                <div>
                  <h3 className="font-medium">
                    My Symptom History
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    View your own history and trend.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/patients">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <UsersRound className="size-5" />
                </div>
                <div>
                  <h3 className="font-medium">
                    Other Patient Profiles
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    View each patient's separate history.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </section>
      </div>
    </main>
  );
}