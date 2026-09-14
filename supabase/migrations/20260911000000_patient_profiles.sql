-- ============================================================
-- SymptomScope
-- Patient Profiles + Separate Patient History
-- + Health Condition Trend
-- ============================================================


-- ============================================================
-- 1. EXTEND THE LOGGED-IN USER'S OWN PROFILE
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS existing_conditions TEXT,
  ADD COLUMN IF NOT EXISTS current_medications TEXT,
  ADD COLUMN IF NOT EXISTS previous_major_illnesses TEXT,
  ADD COLUMN IF NOT EXISTS smoking_status TEXT,
  ADD COLUMN IF NOT EXISTS family_history TEXT,
  ADD COLUMN IF NOT EXISTS pregnancy_status TEXT;


-- ============================================================
-- 2. SEPARATE PROFILES FOR "SOMEONE ELSE"
-- ============================================================

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


-- ============================================================
-- 3. PATIENT PROFILE PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.patient_profiles
TO authenticated;

GRANT ALL
ON public.patient_profiles
TO service_role;


-- ============================================================
-- 4. PATIENT PROFILE RLS
-- ============================================================

ALTER TABLE public.patient_profiles
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own patient profiles"
ON public.patient_profiles;

CREATE POLICY "Users manage own patient profiles"
ON public.patient_profiles
FOR ALL
TO authenticated
USING (
  auth.uid() = owner_user_id
)
WITH CHECK (
  auth.uid() = owner_user_id
);


-- ============================================================
-- 5. PATIENT PROFILE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS patient_profiles_owner_idx
ON public.patient_profiles (owner_user_id);

CREATE INDEX IF NOT EXISTS patient_profiles_owner_created_idx
ON public.patient_profiles (
  owner_user_id,
  created_at DESC
);


-- ============================================================
-- 6. ADD SUBJECT OWNERSHIP TO SYMPTOM CHECKS
-- ============================================================

ALTER TABLE public.symptom_checks
  ADD COLUMN IF NOT EXISTS patient_id UUID
    REFERENCES public.patient_profiles(id)
    ON DELETE CASCADE;

ALTER TABLE public.symptom_checks
  ADD COLUMN IF NOT EXISTS subject_type TEXT
    NOT NULL DEFAULT 'self';


-- ============================================================
-- 7. ADD HEALTH CONDITION TREND SCORE
-- ============================================================
--
-- IMPORTANT:
--
-- This field is intentionally separate from `severity`.
--
-- severity:
--   Existing database compatibility field.
--   Current application uses it for Symptom Match Strength
--   (0–100).
--
-- health_trend_score:
--   Separate non-clinical reported-health trend score.
--   0–100.
--
-- Interpretation:
--   Higher score = better reported condition/trend
--   Lower score  = worse reported condition/trend
--
-- This is NOT:
--   - disease probability
--   - diagnostic probability
--   - clinical risk percentage
--   - medical diagnosis
--
-- It is only a consistent trend indicator derived from
-- information reported during symptom checks.
-- ============================================================

ALTER TABLE public.symptom_checks
  ADD COLUMN IF NOT EXISTS health_trend_score INTEGER;


-- ============================================================
-- 8. VALIDATE HEALTH TREND SCORE
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'symptom_checks_health_trend_score_check'
  ) THEN
    ALTER TABLE public.symptom_checks
      ADD CONSTRAINT symptom_checks_health_trend_score_check
      CHECK (
        health_trend_score IS NULL
        OR (
          health_trend_score >= 0
          AND health_trend_score <= 100
        )
      );
  END IF;
END
$$;


-- ============================================================
-- 9. VALIDATE SUBJECT TYPE
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'symptom_checks_subject_type_check'
  ) THEN
    ALTER TABLE public.symptom_checks
      ADD CONSTRAINT symptom_checks_subject_type_check
      CHECK (
        subject_type IN ('self', 'patient')
      );
  END IF;
END
$$;


-- ============================================================
-- 10. KEEP PATIENT_ID CONSISTENT WITH SUBJECT_TYPE
-- ============================================================

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
        (
          subject_type = 'self'
          AND patient_id IS NULL
        )
        OR
        (
          subject_type = 'patient'
          AND patient_id IS NOT NULL
        )
      );
  END IF;
END
$$;


-- ============================================================
-- 11. SYMPTOM HISTORY INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS symptom_checks_patient_created_idx
ON public.symptom_checks (
  patient_id,
  created_at
);

CREATE INDEX IF NOT EXISTS symptom_checks_user_subject_created_idx
ON public.symptom_checks (
  user_id,
  subject_type,
  created_at
);


-- ============================================================
-- 12. HEALTH TREND INDEX
-- ============================================================
--
-- Useful when loading the user's/patient's historical trend.
-- NULL values are allowed because old records may not have
-- a health trend score yet.
-- ============================================================

CREATE INDEX IF NOT EXISTS symptom_checks_user_health_trend_idx
ON public.symptom_checks (
  user_id,
  subject_type,
  created_at
)
WHERE health_trend_score IS NOT NULL;


-- ============================================================
-- 13. REPLACE SYMPTOM CHECKS RLS POLICY
-- ============================================================

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


-- ============================================================
-- 14. UPDATED-AT FUNCTION FOR PATIENT PROFILES
-- ============================================================

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


-- ============================================================
-- 15. UPDATED-AT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS patient_profiles_updated_at
ON public.patient_profiles;

CREATE TRIGGER patient_profiles_updated_at
BEFORE UPDATE ON public.patient_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_patient_profile_updated_at();


-- ============================================================
-- 16. PROTECT UPDATED-AT FUNCTION
-- ============================================================

REVOKE EXECUTE
ON FUNCTION public.set_patient_profile_updated_at()
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 17. PREVENT SUBJECT REASSIGNMENT
-- ============================================================
--
-- Once a symptom check has been saved:
--
-- self -> cannot become patient
-- patient A -> cannot become patient B
-- patient -> cannot become self
--
-- This protects separation between:
--   1. Logged-in user's own history
--   2. Someone Else's patient history
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_symptom_check_subject_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF NEW.subject_type IS DISTINCT FROM OLD.subject_type
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
  THEN

    RAISE EXCEPTION
      'The subject of a saved symptom check cannot be changed.';

  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 18. SUBJECT REASSIGNMENT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS prevent_symptom_check_subject_change
ON public.symptom_checks;

CREATE TRIGGER prevent_symptom_check_subject_change
BEFORE UPDATE ON public.symptom_checks
FOR EACH ROW
EXECUTE FUNCTION public.prevent_symptom_check_subject_change();


-- ============================================================
-- 19. PROTECT SUBJECT REASSIGNMENT FUNCTION
-- ============================================================

REVOKE EXECUTE
ON FUNCTION public.prevent_symptom_check_subject_change()
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 20. DOCUMENTATION / SEMANTIC SAFETY
-- ============================================================
--
-- The application must keep these meanings separate:
--
-- severity
--   -> Symptom Match Strength (0–100)
--   -> relative match between reported symptoms and a
--      candidate explanation.
--   -> NOT a disease probability.
--
-- health_trend_score
--   -> Reported Health Condition Trend (0–100)
--   -> higher = better reported condition
--   -> lower = worse reported condition
--   -> NOT clinically validated.
--
-- subject_type = self
--   -> patient_id MUST be NULL.
--
-- subject_type = patient
--   -> patient_id MUST point to a patient profile owned
--      by the authenticated user.
--
-- ============================================================


-- ============================================================
-- END OF PATIENT PROFILE / HISTORY SCHEMA
-- ============================================================