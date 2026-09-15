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

/* ================================================================
   ROUTE
================================================================ */

export const Route = createFileRoute("/_authenticated/patients")({
  component: PatientsPage,
});

/* ================================================================
   TYPES
================================================================ */

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

/* ================================================================
   EMPTY FORM
================================================================ */

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

/* ================================================================
   MAIN PAGE
================================================================ */

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

  /* ==============================================================
     LOAD ONLY THE CURRENT USER'S PATIENT PROFILES
     
     IMPORTANT:
     listPatientProfiles() is server-authenticated and owner-scoped.
     This page never requests another user's patients.
  ============================================================== */

  const patientsQuery = useQuery({
    queryKey: ["patient-profiles"],
    queryFn: () => listPatientProfiles(),
  });

  const patients = patientsQuery.data ?? [];

  /* ==============================================================
     FORM TITLE
  ============================================================== */

  const formTitle = editingPatient
    ? "Edit Patient Profile"
    : "Create Patient Profile";

  /* ==============================================================
     UPDATE FORM FIELD
  ============================================================== */

  function updateField<K extends keyof PatientForm>(
    key: K,
    value: PatientForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  /* ==============================================================
     OPEN CREATE FORM
  ============================================================== */

  function openCreateForm() {
    setEditingPatient(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setDeleteError(null);
    setShowForm(true);
  }

  /* ==============================================================
     OPEN EDIT FORM
  ============================================================== */

  function openEditForm(patient: PatientProfile) {
    const hasPreviousIllness =
      Boolean(patient.previousMajorIllnesses?.trim());

    setEditingPatient(patient);

    setForm({
      name: patient.name ?? "",

      age: patient.age ?? "",

      sex: patient.sex ?? "",

      allergies: patient.allergies ?? "",

      existingConditions:
        patient.existingConditions ?? "",

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

      /*
       * Pregnancy is meaningful only for Female patients.
       * Never hydrate a Male patient with pregnancy data.
       */
      pregnancyStatus:
        patient.sex === "Female"
          ? patient.pregnancyStatus ?? ""
          : "",
    });

    setFormError(null);
    setDeleteError(null);
    setShowForm(true);
  }

  /* ==============================================================
     CLOSE FORM
  ============================================================== */

  function closeForm() {
    setShowForm(false);
    setEditingPatient(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
  }

  /* ==============================================================
     FORM VALIDATION
  ============================================================== */

  const canSubmit = useMemo(() => {
    const trimmedName = form.name.trim();

    const trimmedAge = form.age.trim();

    if (!trimmedName) {
      return false;
    }

    if (!trimmedAge) {
      return false;
    }

    /*
     * Age must be a real number within the UI-supported range.
     */
    const numericAge = Number(trimmedAge);

    if (
      !Number.isFinite(numericAge) ||
      numericAge < 0 ||
      numericAge > 120
    ) {
      return false;
    }

    if (!form.sex) {
      return false;
    }

    if (!form.allergies) {
      return false;
    }

    if (!form.existingConditions) {
      return false;
    }

    if (!form.smokingStatus) {
      return false;
    }

    if (!form.familyHistory.trim()) {
      return false;
    }

    if (!form.previousIllnessAnswer) {
      return false;
    }

    /*
     * If Previous Major Illnesses = Yes,
     * the actual illness description is mandatory.
     */
    if (
      form.previousIllnessAnswer === "Yes" &&
      !form.previousMajorIllnesses.trim()
    ) {
      return false;
    }

    /*
     * Pregnancy is mandatory only when Sex = Female.
     */
    if (
      form.sex === "Female" &&
      !form.pregnancyStatus
    ) {
      return false;
    }

    return true;
  }, [form]);

  /* ==============================================================
     SAVE PATIENT PROFILE
     
     SECURITY:
     - The client does NOT provide owner_user_id.
     - Server function obtains authenticated user.
     - Update uses patient ID + authenticated owner.
     - Create assigns authenticated owner on the server.
  ============================================================== */

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError(null);

      if (!canSubmit) {
        throw new Error(
          "Please complete all required fields.",
        );
      }

      const trimmedName = form.name.trim();
      const trimmedAge = form.age.trim();

      const numericAge = Number(trimmedAge);

      if (
        !Number.isFinite(numericAge) ||
        numericAge < 0 ||
        numericAge > 120
      ) {
        throw new Error(
          "Please enter a valid age between 0 and 120.",
        );
      }

      /*
       * Keep the stored representation compatible with the
       * existing profile contract.
       */
      const payload = {
        name: trimmedName,

        age: trimmedAge,

        sex: form.sex as Sex,

        allergies: form.allergies as YesNo,

        existingConditions:
          form.existingConditions as ExistingCondition,

        currentMedications:
          form.currentMedications.trim(),

        /*
         * The database field contains the illness detail.
         *
         * "No" -> empty string
         * "Yes" -> actual illness description
         */
        previousMajorIllnesses:
          form.previousIllnessAnswer === "Yes"
            ? form.previousMajorIllnesses.trim()
            : "",

        smokingStatus:
          form.smokingStatus as YesNo,

        familyHistory:
          form.familyHistory.trim(),

        /*
         * Never send pregnancy information for a Male patient.
         */
        pregnancyStatus:
          form.sex === "Female"
            ? (form.pregnancyStatus as YesNo)
            : "",
      };

      /* ------------------------------------------------------------
         UPDATE EXISTING PATIENT
      ------------------------------------------------------------ */

      if (editingPatient) {
        return updatePatientProfile({
          data: {
            id: editingPatient.id,
            profile: payload,
          },
        });
      }

      /* ------------------------------------------------------------
         CREATE NEW PATIENT
      ------------------------------------------------------------ */

      return createPatientProfile({
        data: payload,
      });
    },

    onSuccess: async (result) => {
      /*
       * Refresh the patient list after a successful server mutation.
       */
      await queryClient.invalidateQueries({
        queryKey: ["patient-profiles"],
      });

      /*
       * If a patient was being edited, refresh that patient's
       * profile/history-related cached data as well.
       *
       * This does NOT mix histories. These are still patient-specific
       * query keys.
       */
      if (editingPatient?.id) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["patient", editingPatient.id],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              "patient-checks",
              editingPatient.id,
            ],
          }),
        ]);
      }

      /*
       * Do not close the form until the mutation itself succeeded.
       */
      void result;

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

  /* ==============================================================
     DELETE PATIENT PROFILE
     
     IMPORTANT:
     deletePatientProfile() is owner-scoped server-side.
     The client cannot choose another account as owner.
  ============================================================== */

  const deleteMutation = useMutation({
    mutationFn: async (patientId: string) => {
      setDeleteError(null);

      if (!patientId.trim()) {
        throw new Error(
          "A valid patient profile is required.",
        );
      }

      return deletePatientProfile({
        data: {
          id: patientId,
        },
      });
    },

    onSuccess: async (_, patientId) => {
      /*
       * Refresh only the current user's patient-profile collection.
       */
      await queryClient.invalidateQueries({
        queryKey: ["patient-profiles"],
      });

      /*
       * Remove/invalidate only the deleted patient's cached data.
       * This does not touch self history or another patient's history.
       */
      queryClient.removeQueries({
        queryKey: ["patient", patientId],
      });

      queryClient.removeQueries({
        queryKey: ["patient-checks", patientId],
      });

      setDeleteError(null);

      /*
       * If the deleted patient happened to be open in the form,
       * close it so stale patient data is not displayed.
       */
      if (editingPatient?.id === patientId) {
        closeForm();
      }
    },

    onError: (error) => {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Unable to delete patient profile.",
      );
    },
  });

  /* ==============================================================
     DELETE HANDLER
  ============================================================== */

  function handleDelete(patient: PatientProfile) {
    if (!patient.id) {
      setDeleteError(
        "Unable to delete this patient profile.",
      );

      return;
    }

    const confirmed = window.confirm(
      `Delete the profile for ${patient.name}? This will also remove access to this patient's stored symptom history from your account.`,
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(patient.id);
  }

  /* ==============================================================
     OPEN PATIENT CHECKER
     
     IMPORTANT:
     This always uses the selected patient's ID.
     It never redirects to the self checker.
  ============================================================== */

  function handleCheckSymptoms(patientId: string) {
    if (!patientId) {
      return;
    }

    navigate({
      to: "/patient-checker/$patient_ID",
      params: {
        patient_ID: patientId,
      },
    });
  }

  /* ==============================================================
     LOADING STATE
  ============================================================== */

  if (patientsQuery.isLoading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-center py-24">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  /* ==============================================================
     ERROR STATE
  ============================================================== */

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
                We could not load the patient profiles
                associated with your account.
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

  /* ==============================================================
     MAIN UI
  ============================================================== */

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

          <Button
            onClick={openCreateForm}
            disabled={
              saveMutation.isPending ||
              deleteMutation.isPending
            }
          >
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

        {/* ======================================================
            DELETE ERROR
        ======================================================= */}

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
            editing={Boolean(editingPatient)}
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
                  disabled={
                    saveMutation.isPending ||
                    deleteMutation.isPending
                  }
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
                  editing={
                    editingPatient?.id === patient.id
                  }
                  onEdit={() =>
                    openEditForm(patient)
                  }
                  onDelete={() =>
                    handleDelete(patient)
                  }
                  onCheckSymptoms={() =>
                    handleCheckSymptoms(
                      patient.id,
                    )
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
            <CardTitle>
              {title}
            </CardTitle>

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

          {/* ====================================================
              BASIC INFORMATION
          ===================================================== */}

          <section>
            <h2 className="mb-4 text-base font-semibold">
              Basic Information
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">

              {/* NAME */}

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
                  disabled={saving}
                  autoComplete="off"
                />
              </div>

              {/* AGE */}

              <div className="space-y-2">
                <Label htmlFor="patient-age">
                  Age <Required />
                </Label>

                <Input
                  id="patient-age"
                  type="number"
                  min="0"
                  max="120"
                  step="1"
                  value={form.age}
                  onChange={(event) =>
                    onChange(
                      "age",
                      event.target.value,
                    )
                  }
                  placeholder="Age"
                  disabled={saving}
                  inputMode="numeric"
                />
              </div>

              {/* SEX */}

              <div className="space-y-2">
                <Label htmlFor="patient-sex">
                  Sex <Required />
                </Label>

                <select
                  id="patient-sex"
                  value={form.sex}
                  disabled={saving}
                  onChange={(event) => {
                    const value =
                      event.target.value as
                        | Sex
                        | "";

                    onChange(
                      "sex",
                      value,
                    );

                    /*
                     * Pregnancy status is only relevant
                     * for Female patients.
                     *
                     * If sex changes to Male, immediately
                     * clear pregnancy state from the form.
                     */
                    if (value !== "Female") {
                      onChange(
                        "pregnancyStatus",
                        "",
                      );
                    }
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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

          {/* ====================================================
              HEALTH BACKGROUND
          ===================================================== */}

          <section>
            <h2 className="mb-4 text-base font-semibold">
              Health Background
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">

              {/* ALLERGIES */}

              <div className="space-y-2">
                <Label htmlFor="patient-allergies">
                  Allergies <Required />
                </Label>

                <select
                  id="patient-allergies"
                  value={form.allergies}
                  disabled={saving}
                  onChange={(event) =>
                    onChange(
                      "allergies",
                      event.target.value as
                        | YesNo
                        | "",
                    )
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                <Label htmlFor="patient-condition">
                  Existing Conditions <Required />
                </Label>

                <select
                  id="patient-condition"
                  value={form.existingConditions}
                  disabled={saving}
                  onChange={(event) =>
                    onChange(
                      "existingConditions",
                      event.target.value as
                        | ExistingCondition
                        | "",
                    )
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                <Label htmlFor="patient-medications">
                  Current Medications
                </Label>

                <Textarea
                  id="patient-medications"
                  value={form.currentMedications}
                  disabled={saving}
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

              {/* PREVIOUS MAJOR ILLNESSES */}

              <div className="space-y-2">
                <Label htmlFor="patient-previous-illness">
                  Previous Major Illnesses <Required />
                </Label>

                <select
                  id="patient-previous-illness"
                  value={form.previousIllnessAnswer}
                  disabled={saving}
                  onChange={(event) => {
                    const value =
                      event.target.value as
                        | YesNo
                        | "";

                    onChange(
                      "previousIllnessAnswer",
                      value,
                    );

                    /*
                     * If there is no previous major illness,
                     * remove any stale illness description.
                     */
                    if (value === "No") {
                      onChange(
                        "previousMajorIllnesses",
                        "",
                      );
                    }
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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

              {/* SMOKING STATUS */}

              <div className="space-y-2">
                <Label htmlFor="patient-smoking">
                  Smoking Status <Required />
                </Label>

                <select
                  id="patient-smoking"
                  value={form.smokingStatus}
                  disabled={saving}
                  onChange={(event) =>
                    onChange(
                      "smokingStatus",
                      event.target.value as
                        | YesNo
                        | "",
                    )
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                  <Label htmlFor="patient-illness-details">
                    Which major illness? <Required />
                  </Label>

                  <Textarea
                    id="patient-illness-details"
                    value={
                      form.previousMajorIllnesses
                    }
                    disabled={saving}
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

              {/* FAMILY HISTORY */}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="patient-family-history">
                  Relevant Family History <Required />
                </Label>

                <Textarea
                  id="patient-family-history"
                  value={form.familyHistory}
                  disabled={saving}
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

          {/* ====================================================
              PREGNANCY
          ===================================================== */}

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
                  disabled={saving}
                  onChange={(event) =>
                    onChange(
                      "pregnancyStatus",
                      event.target.value as
                        | YesNo
                        | "",
                    )
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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

          {/* ====================================================
              FORM ERROR
          ===================================================== */}

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* ====================================================
              FORM ACTIONS
          ===================================================== */}

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

          {/* ====================================================
              FORM CONTEXT NOTE
          ===================================================== */}

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
  editing,
  onEdit,
  onDelete,
  onCheckSymptoms,
}: {
  patient: PatientProfile;

  deleting: boolean;

  editing: boolean;

  onEdit: () => void;

  onDelete: () => void;

  onCheckSymptoms: () => void;
}) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">

          {/* ====================================================
              PATIENT IDENTITY
          ===================================================== */}

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

          {/* ====================================================
              EDIT / DELETE
          ===================================================== */}

          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label={`Edit ${patient.name}`}
              title="Edit patient"
              disabled={
                deleting ||
                editing
              }
            >
              {editing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Edit3 className="size-4" />
              )}
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

        {/* ======================================================
            PATIENT BACKGROUND SUMMARY
        ======================================================= */}

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoItem
            label="Allergies"
            value={
              patient.allergies ||
              "Not provided"
            }
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

        {/* ======================================================
            SEPARATION NOTICE
        ======================================================= */}

        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Separate patient record
          </p>

          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            This patient's assessments and symptom history
            are stored separately from your own history.
          </p>
        </div>

        {/* ======================================================
            ACTIONS
        ======================================================= */}

        <div className="grid gap-2 sm:grid-cols-2">

          {/* ----------------------------------------------------
              CHECK SYMPTOMS
              
              Patient-specific route:
              /patient-checker/$patient_ID
          ----------------------------------------------------- */}

          <Button
            className="w-full"
            onClick={onCheckSymptoms}
            disabled={deleting || editing}
          >
            Check Symptoms

            <ArrowRight className="ml-2 size-4" />
          </Button>

          {/* ----------------------------------------------------
              VIEW HISTORY

              Patient-specific route:
              /patient-history/$patient_ID
              
              This does NOT use /history.
          ----------------------------------------------------- */}

          <Button
            variant="outline"
            className="w-full"
            asChild
            disabled={deleting || editing}
          >
            <Link
              to="/patient-history/$patient_ID"
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
   SMALL INFO ITEM
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

/* ================================================================
   REQUIRED FIELD MARKER
================================================================ */

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