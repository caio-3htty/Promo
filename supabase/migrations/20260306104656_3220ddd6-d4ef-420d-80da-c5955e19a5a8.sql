
-- Tabela de estoque por obra e material
CREATE TABLE public.estoque_obra_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id),
  material_id uuid NOT NULL REFERENCES public.materiais(id),
  estoque_atual numeric NOT NULL DEFAULT 0,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(obra_id, material_id)
);

ALTER TABLE public.estoque_obra_material ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ver estoque
CREATE POLICY "Authenticated users can view estoque"
  ON public.estoque_obra_material FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Gestores e almoxarifes podem modificar
CREATE POLICY "Gestores full access estoque"
  ON public.estoque_obra_material FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Almoxarifes can update estoque"
  ON public.estoque_obra_material FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'almoxarife'::app_role));

CREATE POLICY "Almoxarifes can insert estoque"
  ON public.estoque_obra_material FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'almoxarife'::app_role));

-- Adicionar colunas de recebimento na pedidos_compra
ALTER TABLE public.pedidos_compra
  ADD COLUMN IF NOT EXISTS data_recebimento timestamp with time zone,
  ADD COLUMN IF NOT EXISTS recebido_por uuid;

-- Almoxarifes podem atualizar pedidos (para marcar como entregue)
CREATE POLICY "Almoxarifes can update pedidos_compra"
  ON public.pedidos_compra FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'almoxarife'::app_role));
