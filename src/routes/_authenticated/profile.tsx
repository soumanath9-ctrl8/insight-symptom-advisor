import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/ProfileEditor";

import {
  getOwnProfile,
  updateOwnProfile,
} from "@/lib/profile.functions";
import type { ProfileData } from "@/lib/profile.types";

export const Route = createFileRoute("/_authenticated/profile")({
  component: OwnProfilePage,
});

function OwnProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["own-profile"],
    queryFn: () => getOwnProfile(),
  });

  const saveMutation = useMutation({
    mutationFn: (profile: ProfileData) =>
      updateOwnProfile({
        data: {
          name: profile.name,
          age: profile.age,
          sex: profile.sex,
          allergies: profile.allergies,
          existingConditions:
            profile.existingConditions,
          currentMedications:
            profile.currentMedications,
          previousMajorIllnesses:
            profile.previousMajorIllnesses,
          smokingStatus:
            profile.smokingStatus,
          familyHistory:
            profile.familyHistory,
          pregnancyStatus:
            profile.pregnancyStatus,
        },
      }),
    onSuccess: async (profile) => {
      await queryClient.invalidateQueries({
        queryKey: ["own-profile"],
      });

      navigate({
        to: "/home",
      });
    },
  });

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4">
        <div className="w-full rounded-xl border p-6">
          <h1 className="text-xl font-semibold">
            Unable to load profile
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {profileQuery.error.message}
          </p>
        </div>
      </main>
    );
  }

  if (!profileQuery.data) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <Link to="/home">
            <Button variant="ghost">
              <ArrowLeft />
              Back
            </Button>
          </Link>

          <div className="mt-6 rounded-xl border p-6">
            <p className="text-sm text-muted-foreground">
              Your profile could not be found. Please sign out and sign in
              again so the profile can be created.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link to="/home">
          <Button variant="ghost" className="mb-5">
            <ArrowLeft />
            Home
          </Button>
        </Link>

        <ProfileEditor
          initialProfile={profileQuery.data}
          onSave={async (profile) => {
            await saveMutation.mutateAsync(profile);
          }}
        />
      </div>
    </main>
  );
}