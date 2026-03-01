
CREATE TABLE public.material_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  preco_atual numeric NOT NULL DEFAULT 0,
  pedido_minimo numeric NOT NULL DEFAULT 0,
  lead_time_dias integer NOT NULL DEFAULT 0,
  validade_preco date,
  ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, fornecedor_id)
);

ALTER TABLE public.material_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view material_fornecedor"
  ON public.material_fornecedor FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Gestores full access material_fornecedor"
  ON public.material_fornecedor FOR ALL
  USING (has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER update_material_fornecedor_updated_at
  BEFORE UPDATE ON public.material_fornecedor
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
