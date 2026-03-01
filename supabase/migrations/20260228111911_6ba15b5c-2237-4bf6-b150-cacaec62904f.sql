
-- Fornecedores table
CREATE TABLE public.fornecedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  contatos TEXT,
  entrega_propria BOOLEAN NOT NULL DEFAULT false,
  ultima_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

-- Gestores: full CRUD
CREATE POLICY "Gestores full access fornecedores" ON public.fornecedores
  FOR ALL USING (has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));

-- Others: read only
CREATE POLICY "Authenticated users can view fornecedores" ON public.fornecedores
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Materiais table
CREATE TABLE public.materiais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'un',
  tempo_producao_padrao INTEGER,
  estoque_minimo NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;

-- Gestores: full CRUD
CREATE POLICY "Gestores full access materiais" ON public.materiais
  FOR ALL USING (has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));

-- Others: read only
CREATE POLICY "Authenticated users can view materiais" ON public.materiais
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Trigger for materiais updated_at
CREATE TRIGGER update_materiais_updated_at
  BEFORE UPDATE ON public.materiais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
