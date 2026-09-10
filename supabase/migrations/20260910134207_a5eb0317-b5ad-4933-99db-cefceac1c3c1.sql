ALTER TABLE public.symptom_checks
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS red_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS red_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS supporting_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vitals jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS uncertainty text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_step text NOT NULL DEFAULT '';