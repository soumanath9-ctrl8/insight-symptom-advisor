import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  UserRound,
} from "lucide-react";

import {
  getOwnProfile,
  updateOwnProfile,
} from "@/lib/profile.functions";

import type {
  ExistingCondition,
  Sex,
  YesNo,
} from "@/lib/profile.types";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute(
  "/_authenticated/profile",
)({
  component: ProfilePage,
});

type ProfileForm = {
  name: string;
  age: string;
  sex: Sex | "";
  allergies: YesNo | "";
  existingConditions: ExistingCondition | "";
  currentMedications: string;
  previousIllnessAnswer: YesNo | "";
  previousMajorIllnesses: string;
  smokingStatus: YesNo | "";
  familyHistory: string;
  pregnancyStatus: YesNo | "";
};

const EMPTY_FORM: ProfileForm = {
  name: "",
  age: "",
  sex: "",
  allergies: "",
  existingConditions: "",
  currentMedications: "",
  previousIllnessAnswer: "",
  previousMajorIllnesses: "",
  smokingStatus: "",
  familyHistory: "",
  pregnancyStatus: "",
};

function ProfilePage() {
  const queryClient = useQueryClient();

  const [form, setForm] =
    useState<ProfileForm>(EMPTY_FORM);

  const [formError, setFormError] =
    useState<string | null>(null);

  const [saved, setSaved] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["own-profile"],
    queryFn: () => getOwnProfile(),
  });

  /**
   * Populate the form once the authenticated
   * user's own profile has loaded.
   *
   * This page NEVER loads patient_profiles.
   */
  useEffect(() => {
    const profile = profileQuery.data;

    if (!profile) {
      return;
    }

    setForm({
      name: profile.name ?? "",
      age: profile.age ?? "",
      sex: profile.sex ?? "",
      allergies: profile.allergies ?? "",
      existingConditions:
        profile.existingConditions ?? "",
      currentMedications:
        profile.currentMedications ?? "",

      previousIllnessAnswer:
        profile.previousMajorIllnesses?.trim()
          ? "Yes"
          : "No",

      previousMajorIllnesses:
        profile.previousMajorIllnesses ?? "",

      smokingStatus:
        profile.smokingStatus ?? "",

      familyHistory:
        profile.familyHistory ?? "",

      pregnancyStatus:
        profile.sex === "Female"
          ? profile.pregnancyStatus ?? ""
          : "",
    });
  }, [profileQuery.data]);

  function updateField<K extends keyof ProfileForm>(
    field: K,
    value: ProfileForm[K],
  ) {
    setSaved(false);
    setFormError(null);

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  /**
   * Required-field validation.
   */
  const missingFields = useMemo(() => {
    const missing: string[] = [];

    if (!form.name.trim()) {
      missing.push("Name");
    }

    if (!form.age.trim()) {
      missing.push("Age");
    }

    if (!form.sex) {
      missing.push("Sex");
    }

    if (!form.allergies) {
      missing.push("Allergies");
    }

    if (!form.existingConditions) {
      missing.push("Existing conditions");
    }

    if (!form.smokingStatus) {
      missing.push("Smoking status");
    }

    if (!form.familyHistory.trim()) {
      missing.push("Relevant family history");
    }

    if (!form.previousIllnessAnswer) {
      missing.push("Previous major illnesses");
    }

    if (
      form.previousIllnessAnswer === "Yes" &&
      !form.previousMajorIllnesses.trim()
    ) {
      missing.push("Previous major illness details");
    }

    if (
      form.sex === "Female" &&
      !form.pregnancyStatus
    ) {
      missing.push("Pregnancy status");
    }

    return missing;
  }, [form]);

  const canSave =
    missingFields.length === 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!canSave) {
        throw new Error(
          "Please complete all required fields.",
        );
      }

      const ageNumber = Number(form.age);

      if (
        !Number.isFinite(ageNumber) ||
        ageNumber < 0 ||
        ageNumber > 120
      ) {
        throw new Error(
          "Please enter a valid age between 0 and 120.",
        );
      }

      return updateOwnProfile({
        data: {
          name: form.name.trim(),

          age: form.age.trim(),

          sex: form.sex as Sex,

          allergies:
            form.allergies as YesNo,

          existingConditions:
            form.existingConditions as ExistingCondition,

          currentMedications:
            form.currentMedications.trim(),

          previousMajorIllnesses:
            form.previousIllnessAnswer === "Yes"
              ? form.previousMajorIllnesses.trim()
              : "",

          smokingStatus:
            form.smokingStatus as YesNo,

          familyHistory:
            form.familyHistory.trim(),

          pregnancyStatus:
            form.sex === "Female"
              ? (form.pregnancyStatus as YesNo)
              : "",
        },
      });
    },

    onSuccess: (updatedProfile) => {
      /**
       * Keep the React Query cache synchronized.
       */
      queryClient.setQueryData(
        ["own-profile"],
        updatedProfile,
      );

      queryClient.invalidateQueries({
        queryKey: ["profile"],
      });

      queryClient.invalidateQueries({
        queryKey: ["own-profile"],
      });

      setSaved(true);
      setFormError(null);
    },

    onError: (error) => {
      setSaved(false);

      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to save your profile.",
      );
    },
  });

  if (profileQuery.isLoading) {
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto flex max-w-3xl items-center justify-center py-24">
          <Loader2
            className="size-7 animate-spin text-muted-foreground"
            aria-label="Loading profile"
          />
        </div>
      </main>
    );
  }

  if (profileQuery.error) {
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>
                Unable to load your profile
              </CardTitle>

              <CardDescription>
                We could not load your saved profile
                information.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Button
                onClick={() =>
                  profileQuery.refetch()
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

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">

        {/* =====================================================
            HEADER
        ====================================================== */}
        <header className="mb-6">
          <Link
            to="/home"
            className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-2 size-4" />
            Back to Home
          </Link>

          <div className="mt-5 flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-6" />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                My Profile
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Manage the profile information used for
                your own symptom assessments.
              </p>
            </div>
          </div>
        </header>

        {/* =====================================================
            SEPARATION NOTICE
        ====================================================== */}
        <Card className="mb-6 border-border/70 bg-muted/20">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 size-5 shrink-0 text-primary" />

              <div>
                <p className="font-medium">
                  This is your personal profile
                </p>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Information saved here is used for your
                  own symptom checks. Profiles and histories
                  created for other patients are kept
                  separately.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* =====================================================
            PROFILE FORM
        ====================================================== */}
        <Card>
          <CardHeader>
            <CardTitle>
              Personal & Health Information
            </CardTitle>

            <CardDescription>
              Please provide accurate background information.
              These details provide context for your symptom
              assessment and are not automatically treated as
              current symptoms.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-8">

              {/* =================================================
                  BASIC INFORMATION
              ================================================== */}
              <section>
                <h2 className="text-base font-semibold">
                  Basic Information
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Basic details about you.
                </p>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">

                  {/* NAME */}
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="profile-name">
                      Name <Required />
                    </Label>

                    <Input
                      id="profile-name"
                      value={form.name}
                      onChange={(event) =>
                        updateField(
                          "name",
                          event.target.value,
                        )
                      }
                      placeholder="Your full name"
                      autoComplete="name"
                    />
                  </div>

                  {/* AGE */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-age">
                      Age <Required />
                    </Label>

                    <Input
                      id="profile-age"
                      type="number"
                      min="0"
                      max="120"
                      value={form.age}
                      onChange={(event) =>
                        updateField(
                          "age",
                          event.target.value,
                        )
                      }
                      placeholder="Your age"
                      inputMode="numeric"
                    />
                  </div>

                  {/* SEX */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-sex">
                      Sex <Required />
                    </Label>

                    <select
                      id="profile-sex"
                      value={form.sex}
                      onChange={(event) => {
                        const value =
                          event.target.value as
                            | Sex
                            | "";

                        updateField(
                          "sex",
                          value,
                        );

                        /**
                         * Pregnancy is applicable only
                         * when Sex = Female.
                         */
                        if (value !== "Female") {
                          updateField(
                            "pregnancyStatus",
                            "",
                          );
                        }
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">
                        Select sex
                      </option>

                      <option value="Male">
                        Male
                      </option>

                      <option value="Female">
                        Female
                      </option>
                    </select>
                  </div>
                </div>
              </section>

              <Separator />

              {/* =================================================
                  HEALTH BACKGROUND
              ================================================== */}
              <section>
                <h2 className="text-base font-semibold">
                  Health Background
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Background information that may be relevant
                  during symptom assessment.
                </p>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">

                  {/* ALLERGIES */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-allergies">
                      Allergies <Required />
                    </Label>

                    <select
                      id="profile-allergies"
                      value={form.allergies}
                      onChange={(event) =>
                        updateField(
                          "allergies",
                          event.target.value as
                            | YesNo
                            | "",
                        )
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">
                        Select
                      </option>

                      <option value="Yes">
                        Yes
                      </option>

                      <option value="No">
                        No
                      </option>
                    </select>
                  </div>

                  {/* EXISTING CONDITIONS */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-condition">
                      Existing Conditions <Required />
                    </Label>

                    <select
                      id="profile-condition"
                      value={
                        form.existingConditions
                      }
                      onChange={(event) =>
                        updateField(
                          "existingConditions",
                          event.target.value as
                            | ExistingCondition
                            | "",
                        )
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">
                        Select
                      </option>

                      <option value="Well">
                        Well
                      </option>

                      <option value="Very Well">
                        Very Well
                      </option>

                      <option value="Moderate">
                        Moderate
                      </option>

                      <option value="Worst">
                        Worst
                      </option>

                      <option value="Emergency">
                        Emergency
                      </option>
                    </select>
                  </div>

                  {/* CURRENT MEDICATIONS */}
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="profile-medications">
                      Current Medications
                    </Label>

                    <Textarea
                      id="profile-medications"
                      value={
                        form.currentMedications
                      }
                      onChange={(event) =>
                        updateField(
                          "currentMedications",
                          event.target.value,
                        )
                      }
                      placeholder="List your current medications, if any"
                      rows={4}
                    />

                    <p className="text-xs leading-5 text-muted-foreground">
                      Never stop, start or change a prescribed
                      medicine solely because of an app
                      assessment.
                    </p>
                  </div>

                  {/* PREVIOUS ILLNESS YES/NO */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-previous-illness">
                      Previous Major Illnesses{" "}
                      <Required />
                    </Label>

                    <select
                      id="profile-previous-illness"
                      value={
                        form.previousIllnessAnswer
                      }
                      onChange={(event) => {
                        const value =
                          event.target.value as
                            | YesNo
                            | "";

                        updateField(
                          "previousIllnessAnswer",
                          value,
                        );

                        if (value === "No") {
                          updateField(
                            "previousMajorIllnesses",
                            "",
                          );
                        }
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">
                        Select
                      </option>

                      <option value="Yes">
                        Yes
                      </option>

                      <option value="No">
                        No
                      </option>
                    </select>
                  </div>

                  {/* SMOKING */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-smoking">
                      Smoking Status <Required />
                    </Label>

                    <select
                      id="profile-smoking"
                      value={form.smokingStatus}
                      onChange={(event) =>
                        updateField(
                          "smokingStatus",
                          event.target.value as
                            | YesNo
                            | "",
                        )
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">
                        Select
                      </option>

                      <option value="Yes">
                        Yes
                      </option>

                      <option value="No">
                        No
                      </option>
                    </select>
                  </div>

                  {/* PREVIOUS ILLNESS DETAILS */}
                  {form.previousIllnessAnswer ===
                    "Yes" && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="profile-illness-details">
                        Which major illness?{" "}
                        <Required />
                      </Label>

                      <Textarea
                        id="profile-illness-details"
                        value={
                          form.previousMajorIllnesses
                        }
                        onChange={(event) =>
                          updateField(
                            "previousMajorIllnesses",
                            event.target.value,
                          )
                        }
                        placeholder="Describe the previous major illness"
                        rows={4}
                      />
                    </div>
                  )}

                  {/* FAMILY HISTORY */}
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="profile-family-history">
                      Relevant Family History{" "}
                      <Required />
                    </Label>

                    <Textarea
                      id="profile-family-history"
                      value={form.familyHistory}
                      onChange={(event) =>
                        updateField(
                          "familyHistory",
                          event.target.value,
                        )
                      }
                      placeholder="Enter relevant family medical history, or write 'None known'"
                      rows={4}
                    />

                    <p className="text-xs text-muted-foreground">
                      If there is no relevant family history,
                      you can write "None known".
                    </p>
                  </div>
                </div>
              </section>

              {/* =================================================
                  PREGNANCY — FEMALE ONLY
              ================================================== */}
              {form.sex === "Female" && (
                <>
                  <Separator />

                  <section>
                    <h2 className="text-base font-semibold">
                      Pregnancy Status
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      This information is shown only when
                      Female is selected.
                    </p>

                    <div className="mt-5 max-w-md space-y-2">
                      <Label htmlFor="profile-pregnancy">
                        Is the patient pregnant?{" "}
                        <Required />
                      </Label>

                      <select
                        id="profile-pregnancy"
                        value={
                          form.pregnancyStatus
                        }
                        onChange={(event) =>
                          updateField(
                            "pregnancyStatus",
                            event.target.value as
                              | YesNo
                              | "",
                          )
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">
                          Select
                        </option>

                        <option value="Yes">
                          Yes
                        </option>

                        <option value="No">
                          No
                        </option>
                      </select>
                    </div>
                  </section>
                </>
              )}

              {/* =================================================
                  VALIDATION
              ================================================== */}
              {!canSave && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium">
                    Please complete the required fields.
                  </p>

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Missing:{" "}
                    {missingFields.join(", ")}
                  </p>
                </div>
              )}

              {/* =================================================
                  ERROR
              ================================================== */}
              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
                >
                  {formError}
                </div>
              )}

              {/* =================================================
                  SUCCESS
              ================================================== */}
              {saved && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
                >
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />

                  <div>
                    <p className="font-medium">
                      Profile saved successfully
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Your updated information will be used
                      for your own future symptom assessments.
                    </p>
                  </div>
                </div>
              )}

              {/* =================================================
                  SAVE
              ================================================== */}
              <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  asChild
                >
                  <Link to="/home">
                    Cancel
                  </Link>
                </Button>

                <Button
                  disabled={
                    !canSave ||
                    saveMutation.isPending
                  }
                  onClick={() =>
                    saveMutation.mutate()
                  }
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 size-4" />
                      Save Profile
                    </>
                  )}
                </Button>
              </div>

              {/* =================================================
                  FOOTNOTE
              ================================================== */}
              <p className="text-center text-xs leading-5 text-muted-foreground">
                SymptomScope uses this information as
                background context for symptom assessment.
                It does not constitute a diagnosis or replace
                professional medical care.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* =====================================================
            QUICK LINKS
        ====================================================== */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            to="/history"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      My Symptom History
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      View your own saved symptom checks.
                    </p>
                  </div>

                  <ArrowLeft className="size-4 rotate-180 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link
            to="/home"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      Back to Home
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Return to your symptom assessment options.
                    </p>
                  </div>

                  <ArrowLeft className="size-4 rotate-180 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}

function Required() {
  return (
    <span
      aria-hidden="true"
      className="text-destructive"
    >
      {" "}
      *
    </span>
  );
}