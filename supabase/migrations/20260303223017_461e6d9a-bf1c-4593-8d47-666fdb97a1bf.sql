
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
