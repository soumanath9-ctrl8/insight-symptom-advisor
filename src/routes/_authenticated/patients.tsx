import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Edit3,
  Loader2,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import {
  createPatientProfile,
  deletePatientProfile,
  listPatientProfiles,
  updatePatientProfile,
} from "@/lib/profile.functions";

import type {
  ExistingCondition,
  PatientProfile,
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

export const Route = createFileRoute("/_authenticated/patients")({
  component: PatientsPage,
});

type PatientForm = {
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

const EMPTY_FORM: PatientForm = {
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

function PatientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingPatient, setEditingPatient] =
    useState<PatientProfile | null>(null);

  const [form, setForm] =
    useState<PatientForm>(EMPTY_FORM);

  const [formError, setFormError] =
    useState<string | null>(null);

  const [deleteError, setDeleteError] =
    useState<string | null>(null);

  const patientsQuery = useQuery({
    queryKey: ["patient-profiles"],
    queryFn: () => listPatientProfiles(),
  });

  const patients = patientsQuery.data ?? [];

  const formTitle = editingPatient
    ? "Edit Patient Profile"
    : "Create Patient Profile";

  function updateField<K extends keyof PatientForm>(
    key: K,
    value: PatientForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function openCreateForm() {
    setEditingPatient(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(patient: PatientProfile) {
    const hasPreviousIllness =
      !!patient.previousMajorIllnesses?.trim();

    setEditingPatient(patient);

    setForm({
      name: patient.name ?? "",
      age: patient.age ?? "",
      sex: patient.sex ?? "",
      allergies: patient.allergies ?? "",
      existingConditions:
        patient.existingConditions ??
        "",
      currentMedications:
        patient.currentMedications ?? "",
      previousIllnessAnswer:
        hasPreviousIllness ? "Yes" : "No",
      previousMajorIllnesses:
        patient.previousMajorIllnesses ?? "",
      smokingStatus:
        patient.smokingStatus ?? "",
      familyHistory:
        patient.familyHistory ?? "",
      pregnancyStatus:
        patient.sex === "Female"
          ? patient.pregnancyStatus ?? ""
          : "",
    });

    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingPatient(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false;
    if (!form.age.trim()) return false;
    if (!form.sex) return false;
    if (!form.allergies) return false;
    if (!form.existingConditions) return false;
    if (!form.smokingStatus) return false;
    if (!form.familyHistory.trim()) return false;

    if (!form.previousIllnessAnswer) return false;

    if (
      form.previousIllnessAnswer === "Yes" &&
      !form.previousMajorIllnesses.trim()
    ) {
      return false;
    }

    if (
      form.sex === "Female" &&
      !form.pregnancyStatus
    ) {
      return false;
    }

    return true;
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError(null);

      if (!canSubmit) {
        throw new Error(
          "Please complete all required fields.",
        );
      }

      const payload = {
        name: form.name.trim(),
        age: form.age.trim(),
        sex: form.sex as Sex,
        allergies: form.allergies as YesNo,
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
      };

      if (editingPatient) {
        return updatePatientProfile({
          data: {
            id: editingPatient.id,
            profile: payload,
          },
        });
      }

      return createPatientProfile({
        data: payload,
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patient-profiles"],
      });

      closeForm();
    },

    onError: (error) => {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to save patient profile.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (patientId: string) => {
      setDeleteError(null);

      return deletePatientProfile({
        data: {
          id: patientId,
        },
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patient-profiles"],
      });

      setDeleteError(null);
    },

    onError: (error) => {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Unable to delete patient profile.",
      );
    },
  });

  function handleDelete(patient: PatientProfile) {
    const confirmed = window.confirm(
      `Delete the profile for ${patient.name}? This will also remove access to this patient's stored symptom history from your account.`,
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(patient.id);
  }

  if (patientsQuery.isLoading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-center py-24">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (patientsQuery.error) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <Card>
            <CardHeader>
              <CardTitle>
                Unable to load patient profiles
              </CardTitle>

              <CardDescription>
                We could not load the patient profiles associated
                with your account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Button
                onClick={() =>
                  patientsQuery.refetch()
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
      <div className="mx-auto w-full max-w-5xl">

        {/* ======================================================
            HEADER
        ======================================================= */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              to="/home"
              className="mb-3 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowRight className="mr-2 size-4 rotate-180" />
              Back to Home
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UsersRound className="size-6" />
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Patient Profiles
                </h1>

                <p className="mt-1 text-sm text-muted-foreground">
                  Manage separate profiles for people whose
                  symptoms you want to assess.
                </p>
              </div>
            </div>
          </div>

          <Button onClick={openCreateForm}>
            <Plus className="mr-2 size-4" />
            Add Patient
          </Button>
        </header>

        {/* ======================================================
            IMPORTANT SEPARATION NOTICE
        ======================================================= */}
        <Card className="mb-6 border-border/70 bg-muted/20">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />

              <div>
                <p className="font-medium">
                  Patient data is kept separate
                </p>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Each patient has their own profile, symptom
                  assessments and history. These records are not
                  mixed with your own self symptom history or with
                  another patient's history.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {deleteError && (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {deleteError}
          </div>
        )}

        {/* ======================================================
            CREATE / EDIT FORM
        ======================================================= */}
        {showForm && (
          <PatientProfileForm
            title={formTitle}
            form={form}
            error={formError}
            saving={saveMutation.isPending}
            canSubmit={canSubmit}
            editing={!!editingPatient}
            onChange={updateField}
            onSubmit={() =>
              saveMutation.mutate()
            }
            onCancel={closeForm}
          />
        )}

        {/* ======================================================
            PATIENT LIST
        ======================================================= */}
        <section className={showForm ? "mt-8" : ""}>
          {patients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                  <UserRound className="size-7 text-muted-foreground" />
                </div>

                <h2 className="mt-5 text-lg font-semibold">
                  No patient profiles yet
                </h2>

                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Create a separate patient profile before
                  starting a symptom check for someone else.
                </p>

                <Button
                  className="mt-5"
                  onClick={openCreateForm}
                >
                  <Plus className="mr-2 size-4" />
                  Create First Patient
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {patients.map((patient) => (
                <PatientCard
                  key={patient.id}
                  patient={patient}
                  deleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables ===
                      patient.id
                  }
                  onEdit={() =>
                    openEditForm(patient)
                  }
                  onDelete={() =>
                    handleDelete(patient)
                  }
                  onCheckSymptoms={() =>
                    navigate({
                      to: "/patient-checker/$patient_ID",
                      params: {
                        patient_ID: patient.id,
                      },
                    })
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* ================================================================
   PATIENT FORM
================================================================ */

function PatientProfileForm({
  title,
  form,
  error,
  saving,
  canSubmit,
  editing,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  form: PatientForm;
  error: string | null;
  saving: boolean;
  canSubmit: boolean;
  editing: boolean;
  onChange: <K extends keyof PatientForm>(
    key: K,
    value: PatientForm[K],
  ) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>

            <CardDescription className="mt-1">
              Enter the patient's background information
              separately from your own profile.
            </CardDescription>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close form"
          >
            <X className="size-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6">

          {/* BASIC INFORMATION */}
          <section>
            <h2 className="mb-4 text-base font-semibold">
              Basic Information
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="patient-name">
                  Name <Required />
                </Label>

                <Input
                  id="patient-name"
                  value={form.name}
                  onChange={(event) =>
                    onChange(
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="Patient's full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="patient-age">
                  Age <Required />
                </Label>

                <Input
                  id="patient-age"
                  type="number"
                  min="0"
                  max="120"
                  value={form.age}
                  onChange={(event) =>
                    onChange(
                      "age",
                      event.target.value,
                    )
                  }
                  placeholder="Age"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="patient-sex">
                  Sex <Required />
                </Label>

                <select
                  id="patient-sex"
                  value={form.sex}
                  onChange={(event) => {
                    const value =
                      event.target.value as Sex | "";

                    onChange("sex", value);

                    if (value !== "Female") {
                      onChange(
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

          {/* HEALTH BACKGROUND */}
          <section>
            <h2 className="mb-4 text-base font-semibold">
              Health Background
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">

              <div className="space-y-2">
                <Label htmlFor="patient-allergies">
                  Allergies <Required />
                </Label>

                <select
                  id="patient-allergies"
                  value={form.allergies}
                  onChange={(event) =>
                    onChange(
                      "allergies",
                      event.target.value as YesNo | "",
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

              <div className="space-y-2">
                <Label htmlFor="patient-condition">
                  Existing Conditions <Required />
                </Label>

                <select
                  id="patient-condition"
                  value={form.existingConditions}
                  onChange={(event) =>
                    onChange(
                      "existingConditions",
                      event.target
                        .value as ExistingCondition | "",
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

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="patient-medications">
                  Current Medications
                </Label>

                <Textarea
                  id="patient-medications"
                  value={form.currentMedications}
                  onChange={(event) =>
                    onChange(
                      "currentMedications",
                      event.target.value,
                    )
                  }
                  placeholder="List current medications, if any"
                  rows={3}
                />

                <p className="text-xs text-muted-foreground">
                  Do not stop or change a prescribed medicine
                  based only on this app's assessment.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="patient-previous-illness">
                  Previous Major Illnesses <Required />
                </Label>

                <select
                  id="patient-previous-illness"
                  value={form.previousIllnessAnswer}
                  onChange={(event) => {
                    const value =
                      event.target.value as YesNo | "";

                    onChange(
                      "previousIllnessAnswer",
                      value,
                    );

                    if (value === "No") {
                      onChange(
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

              <div className="space-y-2">
                <Label htmlFor="patient-smoking">
                  Smoking Status <Required />
                </Label>

                <select
                  id="patient-smoking"
                  value={form.smokingStatus}
                  onChange={(event) =>
                    onChange(
                      "smokingStatus",
                      event.target.value as YesNo | "",
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

              {form.previousIllnessAnswer === "Yes" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="patient-illness-details">
                    Which major illness? <Required />
                  </Label>

                  <Textarea
                    id="patient-illness-details"
                    value={
                      form.previousMajorIllnesses
                    }
                    onChange={(event) =>
                      onChange(
                        "previousMajorIllnesses",
                        event.target.value,
                      )
                    }
                    placeholder="Describe the previous major illness"
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="patient-family-history">
                  Relevant Family History <Required />
                </Label>

                <Textarea
                  id="patient-family-history"
                  value={form.familyHistory}
                  onChange={(event) =>
                    onChange(
                      "familyHistory",
                      event.target.value,
                    )
                  }
                  placeholder="Relevant family medical history, or write 'None known'"
                  rows={3}
                />
              </div>
            </div>
          </section>

          {/* PREGNANCY */}
          {form.sex === "Female" && (
            <section>
              <h2 className="mb-4 text-base font-semibold">
                Pregnancy Status
              </h2>

              <div className="max-w-md space-y-2">
                <Label htmlFor="patient-pregnancy">
                  Is the patient pregnant? <Required />
                </Label>

                <select
                  id="patient-pregnancy"
                  value={form.pregnancyStatus}
                  onChange={(event) =>
                    onChange(
                      "pregnancyStatus",
                      event.target.value as YesNo | "",
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
          )}

          {/* FORM ERROR */}
          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* ACTIONS */}
          <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              onClick={onSubmit}
              disabled={!canSubmit || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {editing
                    ? "Updating..."
                    : "Creating..."}
                </>
              ) : (
                <>
                  {editing
                    ? "Update Patient"
                    : "Create Patient"}
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
          </div>

          <p className="text-center text-xs leading-5 text-muted-foreground">
            Patient profile information is background
            context. It is not automatically treated as a
            current symptom.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================
   PATIENT CARD
================================================================ */

function PatientCard({
  patient,
  deleting,
  onEdit,
  onDelete,
  onCheckSymptoms,
}: {
  patient: PatientProfile;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCheckSymptoms: () => void;
}) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-5" />
            </div>

            <div className="min-w-0">
              <CardTitle className="truncate text-lg">
                {patient.name}
              </CardTitle>

              <CardDescription className="mt-1">
                {[patient.age, patient.sex]
                  .filter(Boolean)
                  .join(" · ")}
              </CardDescription>
            </div>
          </div>

          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label={`Edit ${patient.name}`}
              title="Edit patient"
              disabled={deleting}
            >
              <Edit3 className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={`Delete ${patient.name}`}
              title="Delete patient"
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4 text-destructive" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">

          <InfoItem
            label="Allergies"
            value={patient.allergies || "Not provided"}
          />

          <InfoItem
            label="Existing condition"
            value={
              patient.existingConditions ||
              "Not provided"
            }
          />

          <InfoItem
            label="Smoking"
            value={
              patient.smokingStatus ||
              "Not provided"
            }
          />

          <InfoItem
            label="Pregnancy"
            value={
              patient.sex === "Female"
                ? patient.pregnancyStatus ||
                  "Not provided"
                : "Not applicable"
            }
          />
        </div>

        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Separate patient record
          </p>

          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            This patient's assessments and symptom history
            are stored separately from your own history.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className="w-full"
            onClick={onCheckSymptoms}
          >
            Check Symptoms
            <ArrowRight className="ml-2 size-4" />
          </Button>

          <Button
            variant="outline"
            className="w-full"
            asChild
          >
            <Link
              to="/patient-checker/$patient_ID"
              params={{
                patient_ID: patient.id,
              }}
            >
              View History
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================
   SMALL HELPERS
================================================================ */

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium">
        {value}
      </p>
    </div>
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