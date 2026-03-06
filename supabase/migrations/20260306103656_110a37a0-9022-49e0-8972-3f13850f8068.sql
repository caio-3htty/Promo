
-- Create pedidos_compra table
CREATE TABLE public.pedidos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id),
  material_id uuid NOT NULL REFERENCES public.materiais(id),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  quantidade numeric NOT NULL DEFAULT 0,
  preco_unit numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  codigo_compra text,
  criado_por uuid,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pedidos_compra ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated can view
CREATE POLICY "Authenticated users can view pedidos_compra"
  ON public.pedidos_compra FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- RLS: gestores full access
CREATE POLICY "Gestores full access pedidos_compra"
  ON public.pedidos_compra FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_pedidos_compra_updated_at
  BEFORE UPDATE ON public.pedidos_compra
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
