-- Operational stock reliability hardening (P3): adjustment history + decision fields

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estoque_ajuste_tipo') THEN
    CREATE TYPE public.estoque_ajuste_tipo AS ENUM (
      'inicial',
      'correcao',
      'inventario',
      'recebimento_manual'
    );
  END IF;
END;
$$;

ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS criticidade text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS consumo_medio_diario numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'materiais_criticidade_check'
  ) THEN
    ALTER TABLE public.materiais
      ADD CONSTRAINT materiais_criticidade_check
      CHECK (criticidade IN ('baixa', 'media', 'alta', 'critica'));
  END IF;
END;
$$;

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS prazo_prometido_dias integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prazo_real_medio_dias numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confiabilidade numeric NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fornecedores_confiabilidade_check'
  ) THEN
    ALTER TABLE public.fornecedores
      ADD CONSTRAINT fornecedores_confiabilidade_check
      CHECK (confiabilidade >= 0 AND confiabilidade <= 1);
  END IF;
END;
$$;

ALTER TABLE public.material_fornecedor
  ADD COLUMN IF NOT EXISTS lead_time_real_dias numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fornecedor_preferencial boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.estoque_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  estoque_obra_material_id uuid REFERENCES public.estoque_obra_material(id) ON DELETE SET NULL,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  tipo public.estoque_ajuste_tipo NOT NULL,
  motivo text,
  quantidade_anterior numeric NOT NULL DEFAULT 0,
  delta numeric NOT NULL DEFAULT 0,
  quantidade_resultante numeric NOT NULL DEFAULT 0,
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_ajustes_tenant_obra_material_created
ON public.estoque_ajustes (tenant_id, obra_id, material_id, created_at DESC);

ALTER TABLE public.estoque_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estoque_ajustes_select" ON public.estoque_ajustes;
CREATE POLICY "estoque_ajustes_select"
ON public.estoque_ajustes
FOR SELECT
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'estoque.view', obra_id)
);

DROP POLICY IF EXISTS "estoque_ajustes_insert" ON public.estoque_ajustes;
CREATE POLICY "estoque_ajustes_insert"
ON public.estoque_ajustes
FOR INSERT
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'estoque.manage', obra_id)
);

CREATE OR REPLACE FUNCTION public.registrar_ajuste_estoque(
  _obra_id uuid,
  _material_id uuid,
  _tipo public.estoque_ajuste_tipo,
  _novo_saldo numeric,
  _motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_estoque_id uuid;
  v_anterior numeric := 0;
  v_resultante numeric := COALESCE(_novo_saldo, 0);
  v_delta numeric := 0;
  v_adjustment_id uuid;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario autenticado obrigatorio';
  END IF;

  IF _obra_id IS NULL OR _material_id IS NULL THEN
    RAISE EXCEPTION 'obra_id e material_id obrigatorios';
  END IF;

  v_tenant_id := public.current_tenant_id(v_actor_user_id);

  IF NOT public.user_has_permission(v_actor_user_id, v_tenant_id, 'estoque.manage', _obra_id) THEN
    RAISE EXCEPTION 'Sem permissao para ajustar estoque da obra';
  END IF;

  SELECT id, estoque_atual
  INTO v_estoque_id, v_anterior
  FROM public.estoque_obra_material
  WHERE obra_id = _obra_id
    AND material_id = _material_id
    AND tenant_id = v_tenant_id
  LIMIT 1
  FOR UPDATE;

  v_anterior := COALESCE(v_anterior, 0);
  v_resultante := COALESCE(_novo_saldo, v_anterior);
  v_delta := v_resultante - v_anterior;

  IF v_estoque_id IS NULL THEN
    INSERT INTO public.estoque_obra_material (
      tenant_id,
      obra_id,
      material_id,
      estoque_atual,
      atualizado_em,
      atualizado_por,
      ultima_atualizacao_estoque,
      confiabilidade
    ) VALUES (
      v_tenant_id,
      _obra_id,
      _material_id,
      v_resultante,
      now(),
      v_actor_user_id,
      now(),
      1
    )
    RETURNING id INTO v_estoque_id;
  ELSE
    UPDATE public.estoque_obra_material
    SET
      estoque_atual = v_resultante,
      atualizado_em = now(),
      atualizado_por = v_actor_user_id,
      ultima_atualizacao_estoque = now(),
      confiabilidade = 1
    WHERE id = v_estoque_id;
  END IF;

  INSERT INTO public.estoque_ajustes (
    tenant_id,
    estoque_obra_material_id,
    obra_id,
    material_id,
    tipo,
    motivo,
    quantidade_anterior,
    delta,
    quantidade_resultante,
    registrado_por
  ) VALUES (
    v_tenant_id,
    v_estoque_id,
    _obra_id,
    _material_id,
    _tipo,
    NULLIF(BTRIM(COALESCE(_motivo, '')), ''),
    v_anterior,
    v_delta,
    v_resultante,
    v_actor_user_id
  )
  RETURNING id INTO v_adjustment_id;

  PERFORM public.write_audit_log(
    'estoque_obra_material',
    v_estoque_id,
    'estoque_adjustment',
    v_actor_user_id,
    _obra_id,
    jsonb_build_object('estoque_anterior', v_anterior),
    jsonb_build_object(
      'tipo', _tipo::text,
      'novo_saldo', v_resultante,
      'delta', v_delta,
      'motivo', NULLIF(BTRIM(COALESCE(_motivo, '')), '')
    ),
    v_tenant_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'ajuste_id', v_adjustment_id,
    'estoque_id', v_estoque_id,
    'estoque_anterior', v_anterior,
    'novo_saldo', v_resultante,
    'delta', v_delta
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_ajuste_estoque(uuid, uuid, public.estoque_ajuste_tipo, numeric, text) TO authenticated;
