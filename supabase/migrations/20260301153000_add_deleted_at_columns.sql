-- add deleted_at timestamp for soft delete on relevant tables

ALTER TABLE public.obras
  ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.fornecedores
  ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.materiais
  ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.material_fornecedor
  ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

-- update RLS policies if needed to ignore deleted records
-- (optional: clients also filter by deleted_at)

