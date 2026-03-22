ALTER TABLE public.access_signup_requests
  ADD COLUMN IF NOT EXISTS reviewed_obra_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
