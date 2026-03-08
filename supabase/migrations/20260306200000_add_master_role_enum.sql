-- Add enum value in its own migration/transaction before any usage.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'master';
