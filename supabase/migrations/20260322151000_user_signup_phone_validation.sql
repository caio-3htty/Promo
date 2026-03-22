ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.access_signup_requests
ADD COLUMN IF NOT EXISTS requested_phone text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_phone_digits_chk'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_phone_digits_chk
    CHECK (phone IS NULL OR phone ~ '^[0-9]{10,13}$');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'access_signup_requests_requested_phone_digits_chk'
  ) THEN
    ALTER TABLE public.access_signup_requests
    ADD CONSTRAINT access_signup_requests_requested_phone_digits_chk
    CHECK (requested_phone IS NULL OR requested_phone ~ '^[0-9]{10,13}$');
  END IF;
END;
$$;
