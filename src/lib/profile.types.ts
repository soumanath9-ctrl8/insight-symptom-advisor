export type Sex = "Male" | "Female";

export type YesNo = "Yes" | "No";

export type ExistingCondition =
  | "Well"
  | "Very Well"
  | "Moderate"
  | "Worst"
  | "Emergency";

export type ProfileData = {
  id: string;
  name: string;
  age: string;
  sex: Sex | "";
  allergies: YesNo | "";
  existingConditions: ExistingCondition | "";
  currentMedications: string;
  previousMajorIllnesses: string;
  smokingStatus: YesNo | "";
  familyHistory: string;
  pregnancyStatus: YesNo | "";
};

export type PatientProfile = ProfileData & {
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_PROFILE: Omit<ProfileData, "id"> = {
  name: "",
  age: "",
  sex: "",
  allergies: "",
  existingConditions: "",
  currentMedications: "",
  previousMajorIllnesses: "",
  smokingStatus: "",
  familyHistory: "",
  pregnancyStatus: "",
};