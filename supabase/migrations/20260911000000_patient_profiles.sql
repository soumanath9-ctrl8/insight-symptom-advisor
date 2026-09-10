-- ============================================================
-- SymptomScope — Patient Profiles & Separate Patient History
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend the logged-in user's own profile
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS existing_conditions TEXT,
  ADD COLUMN IF NOT EXISTS current_medications TEXT,
  ADD COLUMN IF NOT EXISTS previous_major_illnesses TEXT,
  ADD COLUMN IF NOT EXISTS smoking_status TEXT,
  ADD COLUMN IF NOT EXISTS family_history TEXT,
  ADD COLUMN IF NOT EXISTS pregnancy_status TEXT;

-- ------------------------------------------------------------
-- 2. Separate profiles for "Someone Else"
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL DEFAULT '',
  age TEXT,
  sex TEXT,

  allergies TEXT,
  existing_conditions TEXT,
  current_medications TEXT,

  previous_major_illnesses TEXT,
  smoking_status TEXT,
  family_history TEXT,
  pregnancy_status TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.patient_profiles
TO authenticated;

GRANT ALL
ON public.patient_profiles
TO service_role;

ALTER TABLE public.patient_profiles
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own patient profiles"
ON public.patient_profiles;

CREATE POLICY "Users manage own patient profiles"
ON public.patient_profiles
FOR ALL
TO authenticated
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

CREATE INDEX IF NOT EXISTS patient_profiles_owner_idx
ON public.patient_profiles (owner_user_id);

CREATE INDEX IF NOT EXISTS patient_profiles_owner_created_idx
ON public.patient_profiles (owner_user_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. Add subject ownership to symptom checks
-- ------------------------------------------------------------

ALTER TABLE public.symptom_checks
  ADD COLUMN IF NOT EXISTS patient_id UUID
    REFERENCES public.patient_profiles(id)
    ON DELETE CASCADE;

ALTER TABLE public.symptom_checks
  ADD COLUMN IF NOT EXISTS subject_type TEXT
    NOT NULL DEFAULT 'self';

-- ------------------------------------------------------------
-- 4. Validate subject type
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'symptom_checks_subject_type_check'
  ) THEN
    ALTER TABLE public.symptom_checks
      ADD CONSTRAINT symptom_checks_subject_type_check
      CHECK (subject_type IN ('self', 'patient'));
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 5. Keep patient_id consistent with subject_type
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'symptom_checks_subject_consistency_check'
  ) THEN
    ALTER TABLE public.symptom_checks
      ADD CONSTRAINT symptom_checks_subject_consistency_check
      CHECK (
        (subject_type = 'self' AND patient_id IS NULL)
        OR
        (subject_type = 'patient' AND patient_id IS NOT NULL)
      );
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 6. Indexes
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS symptom_checks_patient_created_idx
ON public.symptom_checks (patient_id, created_at);

CREATE INDEX IF NOT EXISTS symptom_checks_user_subject_created_idx
ON public.symptom_checks (user_id, subject_type, created_at);

-- ------------------------------------------------------------
-- 7. Replace symptom_checks RLS policies
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users manage own checks"
ON public.symptom_checks;

CREATE POLICY "Users manage own checks"
ON public.symptom_checks
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  AND
  (
    (
      subject_type = 'self'
      AND patient_id IS NULL
    )
    OR
    (
      subject_type = 'patient'
      AND patient_id IN (
        SELECT pp.id
        FROM public.patient_profiles pp
        WHERE pp.owner_user_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND
  (
    (
      subject_type = 'self'
      AND patient_id IS NULL
    )
    OR
    (
      subject_type = 'patient'
      AND patient_id IN (
        SELECT pp.id
        FROM public.patient_profiles pp
        WHERE pp.owner_user_id = auth.uid()
      )
    )
  )
);

-- ------------------------------------------------------------
-- 8. Updated-at trigger for patient profiles
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_patient_profile_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_profiles_updated_at
ON public.patient_profiles;

CREATE TRIGGER patient_profiles_updated_at
BEFORE UPDATE ON public.patient_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_patient_profile_updated_at();

REVOKE EXECUTE
ON FUNCTION public.set_patient_profile_updated_at()
FROM PUBLIC, anon, authenticated;