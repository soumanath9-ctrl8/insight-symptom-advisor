import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileEditor } from "@/components/ProfileEditor";
import {
  createPatientProfile,
  deletePatientProfile,
  listPatientProfiles,
  updatePatientProfile,
} from "@/lib/profile.functions";
import { EMPTY_PROFILE } from "@/lib/profile.types";
import type { PatientProfile, ProfileData } from "@/lib/profile.types";

export const Route = createFileRoute("/_authenticated/patients")({
  component: PatientsPage,
});

function toPayload(profile: ProfileData) {
  return {
    name: profile.name,
    age: profile.age,
    sex: profile.sex,
    allergies: profile.allergies,
    existingConditions: profile.existingConditions,
    currentMedications: profile.currentMedications,
    previousMajorIllnesses: profile.previousMajorIllnesses,
    smokingStatus: profile.smokingStatus,
    familyHistory: profile.familyHistory,
    pregnancyStatus: profile.pregnancyStatus,
  };
}

function PatientsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PatientProfile | "new" | null>(null);

  const patientsQuery = useQuery({
    queryKey: ["patient-profiles"],
    queryFn: () => listPatientProfiles(),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["patient-profiles"] });

  const createMutation = useMutation({
    mutationFn: (profile: ProfileData) =>
      createPatientProfile({ data: toPayload(profile) }),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, profile }: { id: string; profile: ProfileData }) =>
      updatePatientProfile({ data: { id, profile: toPayload(profile) } }),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePatientProfile({ data: { id } }),
    onSuccess: refresh,
  });

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link to="/home">
          <Button variant="ghost" className="mb-5">
            <ArrowLeft />
            Home
          </Button>
        </Link>

        {editing ? (
          <ProfileEditor
            title={editing === "new" ? "New patient profile" : "Edit patient"}
            initialProfile={
              editing === "new"
                ? ({ id: "", ...EMPTY_PROFILE } as ProfileData)
                : editing
            }
            onCancel={() => setEditing(null)}
            onSave={async (profile) => {
              if (editing === "new") {
                await createMutation.mutateAsync(profile);
              } else {
                await updateMutation.mutateAsync({
                  id: editing.id,
                  profile,
                });
              }
            }}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Patient profiles</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep separate records for people you check symptoms for.
                </p>
              </div>
              <Button onClick={() => setEditing("new")}>
                <Plus />
                Add
              </Button>
            </div>

            {patientsQuery.isLoading ? (
              <div className="mt-10 flex justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : patientsQuery.isError ? (
              <p className="mt-6 text-sm text-destructive">
                {patientsQuery.error.message}
              </p>
            ) : patientsQuery.data?.length ? (
              <div className="mt-6 space-y-3">
                {patientsQuery.data.map((patient) => (
                  <Card key={patient.id} className="border-border/70">
                    <CardContent className="flex items-center gap-4 p-5">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <UserRound className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-medium">
                          {patient.name || "Unnamed patient"}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[patient.age, patient.sex].filter(Boolean).join(" · ") ||
                            "No details yet"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(patient)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete patient"
                        onClick={() => deleteMutation.mutate(patient.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="mt-8 text-sm text-muted-foreground">
                No patient profiles yet. Add one to keep their history separate.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
