"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Loader2,
  Save,
  UserRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { ProfileData } from "@/lib/profile.types";

type Props = {
  initialProfile: ProfileData;
  onSave: (profile: ProfileData) => Promise<void>;
  onCancel?: () => void;
  title?: string;
};

const conditionOptions = [
  "Well",
  "Very Well",
  "Moderate",
  "Worst",
  "Emergency",
] as const;

function SelectField({
  label,
  value,
  onChange,
  children,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

export function ProfileEditor({
  initialProfile,
  onSave,
  onCancel,
  title = "Edit Profile",
}: Props) {
  const [profile, setProfile] = useState<ProfileData>(initialProfile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  function update<K extends keyof ProfileData>(
    key: K,
    value: ProfileData[K],
  ) {
    setProfile((current) => ({
      ...current,
      [key]: value,
      ...(key === "sex" && value === "Male"
        ? { pregnancyStatus: "" }
        : {}),
    }));
  }

  async function submit() {
    setError("");

    if (!profile.name.trim()) {
      setError("Please enter the person's name.");
      return;
    }

    if (!profile.age.trim()) {
      setError("Please enter the age.");
      return;
    }

    if (!profile.sex) {
      setError("Please select sex.");
      return;
    }

    if (profile.previousMajorIllnesses === "Yes") {
      // The actual illness is entered in the textarea below.
    }

    try {
      setSaving(true);
      await onSave({
        ...profile,
        name: profile.name.trim(),
        age: profile.age.trim(),
        currentMedications:
          profile.currentMedications.trim(),
        previousMajorIllnesses:
          profile.previousMajorIllnesses.trim(),
        familyHistory:
          profile.familyHistory.trim(),
        pregnancyStatus:
          profile.sex === "Female"
            ? profile.pregnancyStatus
            : "",
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <UserRound className="size-5" />
              {title}
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              These details help make the symptom assessment more relevant.
              Only information you provide will be used.
            </p>
          </div>

          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              aria-label="Close profile editor"
            >
              <X />
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-name">
              Name
            </Label>
            <Input
              id="profile-name"
              value={profile.name}
              onChange={(e) =>
                update("name", e.target.value)
              }
              placeholder="Enter name"
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-age">
              Age
            </Label>
            <Input
              id="profile-age"
              value={profile.age}
              onChange={(e) =>
                update(
                  "age",
                  e.target.value.replace(/[^\d]/g, "").slice(0, 3),
                )
              }
              placeholder="Age"
              inputMode="numeric"
            />
          </div>

          <SelectField
            label="Sex"
            value={profile.sex}
            onChange={(value) =>
              update(
                "sex",
                value as ProfileData["sex"],
              )
            }
            placeholder="Select sex"
          >
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
          </SelectField>

          <SelectField
            label="Allergies"
            value={profile.allergies}
            onChange={(value) =>
              update(
                "allergies",
                value as ProfileData["allergies"],
              )
            }
            placeholder="Any known allergies?"
          >
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
          </SelectField>

          <SelectField
            label="Existing conditions"
            value={profile.existingConditions}
            onChange={(value) =>
              update(
                "existingConditions",
                value as ProfileData["existingConditions"],
              )
            }
            placeholder="Select current state"
          >
            {conditionOptions.map((condition) => (
              <SelectItem
                key={condition}
                value={condition}
              >
                {condition}
              </SelectItem>
            ))}
          </SelectField>

          <SelectField
            label="Smoking status"
            value={profile.smokingStatus}
            onChange={(value) =>
              update(
                "smokingStatus",
                value as ProfileData["smokingStatus"],
              )
            }
            placeholder="Select"
          >
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
          </SelectField>

          {profile.sex === "Female" ? (
            <SelectField
              label="Are you pregnant?"
              value={profile.pregnancyStatus}
              onChange={(value) =>
                update(
                  "pregnancyStatus",
                  value as ProfileData["pregnancyStatus"],
                )
              }
              placeholder="Select"
            >
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectField>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="current-medications">
            Current medications
          </Label>
          <Textarea
            id="current-medications"
            value={profile.currentMedications}
            onChange={(e) =>
              update(
                "currentMedications",
                e.target.value,
              )
            }
            placeholder="List current medicines, if any"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="previous-illnesses">
            Previous major illnesses
          </Label>

          <Textarea
            id="previous-illnesses"
            value={profile.previousMajorIllnesses}
            onChange={(e) =>
              update(
                "previousMajorIllnesses",
                e.target.value,
              )
            }
            placeholder="If there are previous major illnesses, describe them here"
            rows={3}
          />

          <p className="text-xs text-muted-foreground">
            If there are no previous major illnesses, enter “None”.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="family-history">
            Relevant family history
          </Label>
          <Textarea
            id="family-history"
            value={profile.familyHistory}
            onChange={(e) =>
              update(
                "familyHistory",
                e.target.value,
              )
            }
            placeholder="Relevant family medical history, if any"
            rows={3}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          ) : null}

          <Button
            type="button"
            onClick={submit}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save />
                Save Profile
              </>
            )}
          </Button>
        </div>

        {!error && !saving ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="size-3.5" />
            Your information is used only to improve the relevance of the
            assessment.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}