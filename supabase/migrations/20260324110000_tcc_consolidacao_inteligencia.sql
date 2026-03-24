-- TCC consolidation: real-world workflow, uncertainty-based stock, alerts and substitution automation

-- 1) Estoque metadata for uncertainty workflow
ALTER TABLE public.estoque_obra_material
  ADD COLUMN IF NOT EXISTS ultima_atualizacao_estoque timestamptz,
  ADD COLUMN IF NOT EXISTS confiabilidade numeric;

UPDATE public.estoque_obra_material
SET ultima_atualizacao_estoque = COALESCE(ultima_atualizacao_estoque, atualizado_em, now())
WHERE ultima_atualizacao_estoque IS NULL;

ALTER TABLE public.estoque_obra_material
  ALTER COLUMN ultima_atualizacao_estoque SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'estoque_obra_material_confiabilidade_chk'
  ) THEN
    ALTER TABLE public.estoque_obra_material
      ADD CONSTRAINT estoque_obra_material_confiabilidade_chk
      CHECK (confiabilidade IS NULL OR (confiabilidade >= 0 AND confiabilidade <= 1));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_estoque_update_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_age_hours numeric;
BEGIN
  IF NEW.ultima_atualizacao_estoque IS NULL THEN
    NEW.ultima_atualizacao_estoque := COALESCE(NEW.atualizado_em, now());
  END IF;

  IF NEW.atualizado_em IS NULL THEN
    NEW.atualizado_em := NEW.ultima_atualizacao_estoque;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.estoque_atual IS DISTINCT FROM OLD.estoque_atual THEN
      NEW.ultima_atualizacao_estoque := now();
      NEW.atualizado_em := NEW.ultima_atualizacao_estoque;
    ELSIF NEW.ultima_atualizacao_estoque IS DISTINCT FROM OLD.ultima_atualizacao_estoque THEN
      NEW.atualizado_em := NEW.ultima_atualizacao_estoque;
    ELSIF NEW.atualizado_em IS DISTINCT FROM OLD.atualizado_em THEN
      NEW.ultima_atualizacao_estoque := NEW.atualizado_em;
    END IF;
  END IF;

  IF NEW.confiabilidade IS NULL THEN
    v_age_hours := GREATEST(EXTRACT(EPOCH FROM (now() - NEW.ultima_atualizacao_estoque)) / 3600.0, 0);
    NEW.confiabilidade := GREATEST(0::numeric, LEAST(1::numeric, 1 - (v_age_hours / 72.0)));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_estoque_update_metadata ON public.estoque_obra_material;
CREATE TRIGGER tr_sync_estoque_update_metadata
BEFORE INSERT OR UPDATE ON public.estoque_obra_material
FOR EACH ROW
EXECUTE FUNCTION public.sync_estoque_update_metadata();

-- 2) Pedido status modernization
UPDATE public.pedidos_compra SET status = 'criado' WHERE status = 'pendente';
UPDATE public.pedidos_compra SET status = 'aprovando' WHERE status = 'aprovado';
UPDATE public.pedidos_compra SET status = 'em_transporte' WHERE status = 'enviado';

ALTER TABLE public.pedidos_compra
  ALTER COLUMN status SET DEFAULT 'criado';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pedidos_compra_status_check'
  ) THEN
    ALTER TABLE public.pedidos_compra DROP CONSTRAINT pedidos_compra_status_check;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pedidos_compra_status_valid_check'
  ) THEN
    ALTER TABLE public.pedidos_compra DROP CONSTRAINT pedidos_compra_status_valid_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pedidos_compra_status_valid_check'
  ) THEN
    ALTER TABLE public.pedidos_compra
      ADD CONSTRAINT pedidos_compra_status_valid_check
      CHECK (status IN ('criado', 'aprovando', 'producao', 'em_transporte', 'entregue', 'atrasado', 'cancelado'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_pedido_transition(_from text, _to text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _from = _to THEN true
    WHEN _from = 'criado'       AND _to IN ('aprovando', 'cancelado') THEN true
    WHEN _from = 'aprovando'    AND _to IN ('producao', 'cancelado') THEN true
    WHEN _from = 'producao'     AND _to IN ('em_transporte', 'atrasado', 'cancelado') THEN true
    WHEN _from = 'em_transporte' AND _to IN ('entregue', 'atrasado', 'cancelado') THEN true
    WHEN _from = 'atrasado'     AND _to IN ('em_transporte', 'entregue', 'cancelado') THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_pedidos_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra_id uuid;
  v_tenant_id uuid;
  v_can_create boolean;
  v_can_edit_base boolean;
  v_can_approve boolean;
  v_can_receive boolean;
  v_can_delete boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    NEW.total := COALESCE(NEW.quantidade, 0) * COALESCE(NEW.preco_unit, 0);
    RETURN NEW;
  END IF;

  IF NOT public.is_user_active(auth.uid()) THEN
    RAISE EXCEPTION 'Usuario inativo';
  END IF;

  v_obra_id := COALESCE(NEW.obra_id, OLD.obra_id);
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id, public.current_tenant_id(auth.uid()));

  IF NOT public.user_belongs_to_obra(auth.uid(), v_obra_id)
     AND NOT public.has_any_role(auth.uid(), ARRAY['master', 'gestor']::public.app_role[]) THEN
    RAISE EXCEPTION 'Usuario sem vinculo com a obra';
  END IF;

  v_can_create := public.user_has_permission(auth.uid(), v_tenant_id, 'pedidos.create', v_obra_id);
  v_can_edit_base := public.user_has_permission(auth.uid(), v_tenant_id, 'pedidos.edit_base', v_obra_id);
  v_can_approve := public.user_has_permission(auth.uid(), v_tenant_id, 'pedidos.approve', v_obra_id);
  v_can_receive := public.user_has_permission(auth.uid(), v_tenant_id, 'pedidos.receive', v_obra_id);
  v_can_delete := public.user_has_permission(auth.uid(), v_tenant_id, 'pedidos.delete', v_obra_id);

  NEW.total := COALESCE(NEW.quantidade, 0) * COALESCE(NEW.preco_unit, 0);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_can_create THEN
      RAISE EXCEPTION 'Sem permissao para criar pedido';
    END IF;

    NEW.status := COALESCE(NULLIF(NEW.status, ''), 'criado');
    NEW.data_recebimento := NULL;
    NEW.recebido_por := NULL;
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NOT v_can_delete THEN
    RAISE EXCEPTION 'Sem permissao para excluir pedido';
  END IF;

  IF NEW.obra_id IS DISTINCT FROM OLD.obra_id
    OR NEW.material_id IS DISTINCT FROM OLD.material_id
    OR NEW.fornecedor_id IS DISTINCT FROM OLD.fornecedor_id
    OR NEW.quantidade IS DISTINCT FROM OLD.quantidade
    OR NEW.preco_unit IS DISTINCT FROM OLD.preco_unit
    OR NEW.total IS DISTINCT FROM OLD.total THEN
    IF NOT v_can_edit_base THEN
      RAISE EXCEPTION 'Sem permissao para editar dados base do pedido';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_valid_pedido_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Transicao de status invalida: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'entregue' THEN
      IF NOT v_can_receive THEN
        RAISE EXCEPTION 'Sem permissao para registrar recebimento';
      END IF;
    ELSIF NOT v_can_approve THEN
      RAISE EXCEPTION 'Sem permissao para alterar etapa do pedido';
    END IF;
  END IF;

  IF NEW.data_recebimento IS DISTINCT FROM OLD.data_recebimento
    OR NEW.recebido_por IS DISTINCT FROM OLD.recebido_por THEN
    IF NOT v_can_receive THEN
      RAISE EXCEPTION 'Sem permissao para registrar recebimento';
    END IF;
  END IF;

  IF NEW.status = 'entregue' THEN
    IF COALESCE(NULLIF(BTRIM(NEW.codigo_compra), ''), NULL) IS NULL THEN
      RAISE EXCEPTION 'Codigo de compra obrigatorio para concluir o pedido';
    END IF;
    NEW.data_recebimento := COALESCE(NEW.data_recebimento, now());
    NEW.recebido_por := COALESCE(NEW.recebido_por, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Alert engine with decision-oriented rules
CREATE OR REPLACE FUNCTION public.executar_ciclo_notificacoes(_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_created integer := 0;
  v_repeated integer := 0;
  v_escalated integer := 0;
  v_row record;
BEGIN
  v_tenant_id := COALESCE(_tenant_id, public.current_tenant_id(auth.uid()), public.default_tenant_id());

  IF auth.uid() IS NOT NULL
     AND NOT public.user_has_permission(auth.uid(), v_tenant_id, 'notifications.manage', NULL) THEN
    RAISE EXCEPTION 'Sem permissao para executar ciclo de notificacoes';
  END IF;

  -- Estoque desatualizado
  FOR v_row IN
    SELECT em.obra_id, em.material_id, m.nome AS material_nome
    FROM public.estoque_obra_material em
    JOIN public.materiais m ON m.id = em.material_id
    WHERE em.tenant_id = v_tenant_id
      AND COALESCE(em.ultima_atualizacao_estoque, em.atualizado_em) <= now() - interval '24 hours'
  LOOP
    BEGIN
      INSERT INTO public.notificacoes (
        tenant_id, obra_id, material_id, entidade_tipo, entidade_id, tipo, severidade,
        titulo, mensagem, proxima_repeticao_em, escalar_em, email_critico_em, metadata
      )
      VALUES (
        v_tenant_id,
        v_row.obra_id,
        v_row.material_id,
        'estoque_obra_material',
        v_row.material_id,
        'estoque_desatualizado',
        'warning',
        'Estoque sem atualizacao recente',
        format('O material %s esta sem atualizacao de estoque ha mais de 24h.', v_row.material_nome),
        now() + interval '1 hour',
        now() + interval '1 hour',
        now() + interval '4 hours',
        jsonb_build_object('janela_horas', 24)
      );
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  -- Risco de ruptura (estoque <= minimo + seguranca)
  FOR v_row IN
    SELECT em.obra_id, em.material_id, m.nome AS material_nome, em.estoque_atual,
           COALESCE(m.estoque_seguranca, 0) + COALESCE(m.estoque_minimo, 0) AS limite
    FROM public.estoque_obra_material em
    JOIN public.materiais m ON m.id = em.material_id
    WHERE em.tenant_id = v_tenant_id
      AND em.estoque_atual <= (COALESCE(m.estoque_seguranca, 0) + COALESCE(m.estoque_minimo, 0))
  LOOP
    BEGIN
      INSERT INTO public.notificacoes (
        tenant_id, obra_id, material_id, entidade_tipo, entidade_id, tipo, severidade,
        titulo, mensagem, proxima_repeticao_em, escalar_em, email_critico_em, metadata
      )
      VALUES (
        v_tenant_id,
        v_row.obra_id,
        v_row.material_id,
        'estoque_obra_material',
        v_row.material_id,
        'risco_ruptura',
        'critical',
        'Risco de ruptura de material',
        format('Se nao pedir reposicao em breve, pode faltar %s. Estoque atual: %s | Limite: %s.', v_row.material_nome, v_row.estoque_atual, v_row.limite),
        now() + interval '1 hour',
        now() + interval '30 minutes',
        now() + interval '2 hours',
        jsonb_build_object('estoque_atual', v_row.estoque_atual, 'limite', v_row.limite)
      );
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  -- Atraso de fornecedor por prazo de entrega previsto
  FOR v_row IN
    SELECT pc.id AS pedido_id, pc.obra_id, pc.material_id, m.nome AS material_nome, pp.prazo_entrega_previsto
    FROM public.pedidos_compra pc
    JOIN public.pedido_prazos_etapa pp ON pp.pedido_id = pc.id
    JOIN public.materiais m ON m.id = pc.material_id
    WHERE pc.tenant_id = v_tenant_id
      AND pc.status NOT IN ('entregue', 'cancelado')
      AND pp.prazo_entrega_previsto IS NOT NULL
      AND pp.prazo_entrega_previsto < now()
  LOOP
    BEGIN
      INSERT INTO public.notificacoes (
        tenant_id, obra_id, pedido_id, material_id, entidade_tipo, entidade_id, tipo, severidade,
        titulo, mensagem, proxima_repeticao_em, escalar_em, email_critico_em, metadata
      )
      VALUES (
        v_tenant_id,
        v_row.obra_id,
        v_row.pedido_id,
        v_row.material_id,
        'pedidos_compra',
        v_row.pedido_id,
        'atraso_fornecedor',
        'warning',
        'Fornecedor em atraso',
        format('Pedido %s de %s ultrapassou o prazo previsto de entrega.', left(v_row.pedido_id::text, 8), v_row.material_nome),
        now() + interval '1 hour',
        now() + interval '1 hour',
        now() + interval '4 hours',
        jsonb_build_object('prazo_entrega_previsto', v_row.prazo_entrega_previsto)
      );
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  -- Substituicao pendente de reposicao
  FOR v_row IN
    SELECT ism.id AS incidente_id, ism.obra_id, ism.pedido_id, ism.material_planejado_id, m.nome AS material_planejado
    FROM public.incidentes_substituicao_material ism
    JOIN public.materiais m ON m.id = ism.material_planejado_id
    WHERE ism.tenant_id = v_tenant_id
      AND ism.status = 'pendente_reposicao'
  LOOP
    BEGIN
      INSERT INTO public.notificacoes (
        tenant_id, obra_id, pedido_id, material_id, entidade_tipo, entidade_id, tipo, severidade,
        titulo, mensagem, proxima_repeticao_em, escalar_em, email_critico_em, metadata
      )
      VALUES (
        v_tenant_id,
        v_row.obra_id,
        v_row.pedido_id,
        v_row.material_planejado_id,
        'incidentes_substituicao_material',
        v_row.incidente_id,
        'substituicao_nao_reposta',
        'warning',
        'Substituicao sem reposicao concluida',
        format('A substituicao do material %s ainda requer reposicao futura.', v_row.material_planejado),
        now() + interval '1 hour',
        now() + interval '2 hours',
        now() + interval '6 hours',
        jsonb_build_object('incidente_id', v_row.incidente_id)
      );
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  -- Repeat pending alerts each 1h
  WITH due AS (
    SELECT id, tenant_id
    FROM public.notificacoes
    WHERE tenant_id = v_tenant_id
      AND status IN ('aberta', 'acknowledged')
      AND ack_em IS NULL
      AND encerrada_em IS NULL
      AND proxima_repeticao_em IS NOT NULL
      AND proxima_repeticao_em <= now()
  ),
  touched AS (
    UPDATE public.notificacoes n
    SET proxima_repeticao_em = now() + interval '1 hour',
        updated_at = now()
    FROM due
    WHERE n.id = due.id
    RETURNING n.id, n.tenant_id
  ),
  delivered AS (
    INSERT INTO public.notificacao_entregas (
      tenant_id,
      notificacao_id,
      canal,
      destino,
      status,
      payload,
      enviado_em
    )
    SELECT
      t.tenant_id,
      t.id,
      'in_app',
      'in_app',
      'sent',
      jsonb_build_object('reason', 'repeat', 'at', now()),
      now()
    FROM touched t
    RETURNING 1
  )
  SELECT count(*) INTO v_repeated FROM delivered;

  -- Escalate alerts without ACK
  WITH due AS (
    SELECT id, tenant_id
    FROM public.notificacoes
    WHERE tenant_id = v_tenant_id
      AND status = 'aberta'
      AND ack_em IS NULL
      AND encerrada_em IS NULL
      AND escalar_em IS NOT NULL
      AND escalar_em <= now()
  ),
  touched AS (
    UPDATE public.notificacoes n
    SET status = 'escalada',
        updated_at = now()
    FROM due
    WHERE n.id = due.id
    RETURNING n.id, n.tenant_id
  ),
  delivered AS (
    INSERT INTO public.notificacao_entregas (
      tenant_id,
      notificacao_id,
      canal,
      destino,
      status,
      payload,
      enviado_em
    )
    SELECT
      t.tenant_id,
      t.id,
      'in_app',
      'in_app',
      'sent',
      jsonb_build_object('reason', 'escalation', 'at', now()),
      now()
    FROM touched t
    RETURNING 1
  )
  SELECT count(*) INTO v_escalated FROM delivered;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'created', v_created,
    'repeated', v_repeated,
    'escalated', v_escalated,
    'executed_at', now()
  );
END;
$$;

-- 4) Substitution automation (planned -> used + future replenishment)
CREATE OR REPLACE FUNCTION public.register_material_substitution(
  _obra_id uuid,
  _pedido_id uuid,
  _material_planejado_id uuid,
  _material_substituto_id uuid,
  _motivo text,
  _quantidade_planejada numeric,
  _quantidade_substituto numeric,
  _custo_planejado_unit numeric DEFAULT 0,
  _custo_substituto_unit numeric DEFAULT 0,
  _gerar_reposicao boolean DEFAULT true,
  _fornecedor_id uuid DEFAULT NULL,
  _codigo_compra text DEFAULT NULL,
  _observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_incidente_id uuid;
  v_reposicao_pedido_id uuid;
  v_fornecedor_id uuid;
  v_status public.incidente_status_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario autenticado obrigatorio';
  END IF;

  IF _obra_id IS NULL OR _material_planejado_id IS NULL OR _material_substituto_id IS NULL THEN
    RAISE EXCEPTION 'obra/material planejado/material substituto sao obrigatorios';
  END IF;

  IF COALESCE(BTRIM(_motivo), '') = '' THEN
    RAISE EXCEPTION 'Motivo da substituicao e obrigatorio';
  END IF;

  IF _quantidade_planejada <= 0 OR _quantidade_substituto <= 0 THEN
    RAISE EXCEPTION 'Quantidades devem ser maiores que zero';
  END IF;

  v_tenant_id := public.current_tenant_id(auth.uid());

  IF NOT public.user_has_permission(auth.uid(), v_tenant_id, 'incidentes.manage', _obra_id) THEN
    RAISE EXCEPTION 'Sem permissao para registrar substituicao';
  END IF;

  v_fornecedor_id := _fornecedor_id;
  IF v_fornecedor_id IS NULL AND _pedido_id IS NOT NULL THEN
    SELECT fornecedor_id
    INTO v_fornecedor_id
    FROM public.pedidos_compra
    WHERE id = _pedido_id
      AND tenant_id = v_tenant_id
    LIMIT 1;
  END IF;

  v_status := CASE WHEN _gerar_reposicao THEN 'pendente_reposicao'::public.incidente_status_type ELSE 'resolvido'::public.incidente_status_type END;

  INSERT INTO public.incidentes_substituicao_material (
    tenant_id,
    obra_id,
    pedido_id,
    material_planejado_id,
    quantidade_planejada,
    custo_planejado_unit,
    motivo,
    material_substituto_id,
    quantidade_substituto,
    custo_substituto_unit,
    necessita_reposicao,
    status,
    registrado_por,
    origem_substituto
  ) VALUES (
    v_tenant_id,
    _obra_id,
    _pedido_id,
    _material_planejado_id,
    _quantidade_planejada,
    COALESCE(_custo_planejado_unit, 0),
    _motivo,
    _material_substituto_id,
    _quantidade_substituto,
    COALESCE(_custo_substituto_unit, 0),
    _gerar_reposicao,
    v_status,
    auth.uid(),
    COALESCE(_observacoes, 'registrado via sistema')
  )
  RETURNING id INTO v_incidente_id;

  IF _gerar_reposicao THEN
    IF v_fornecedor_id IS NULL THEN
      RAISE EXCEPTION 'Fornecedor obrigatorio para gerar reposicao automatica';
    END IF;

    IF NOT public.user_has_permission(auth.uid(), v_tenant_id, 'pedidos.create', _obra_id) THEN
      RAISE EXCEPTION 'Sem permissao para gerar pedido de reposicao';
    END IF;

    INSERT INTO public.pedidos_compra (
      tenant_id,
      obra_id,
      material_id,
      fornecedor_id,
      quantidade,
      preco_unit,
      total,
      status,
      codigo_compra,
      criado_por,
      observacoes,
      acao_alerta_status
    ) VALUES (
      v_tenant_id,
      _obra_id,
      _material_planejado_id,
      v_fornecedor_id,
      _quantidade_planejada,
      COALESCE(_custo_planejado_unit, 0),
      COALESCE(_quantidade_planejada, 0) * COALESCE(_custo_planejado_unit, 0),
      'criado',
      NULLIF(BTRIM(COALESCE(_codigo_compra, '')), ''),
      auth.uid(),
      COALESCE(_observacoes, 'Pedido gerado automaticamente por substituicao de material'),
      'pedido_registrado'
    ) RETURNING id INTO v_reposicao_pedido_id;

    UPDATE public.incidentes_substituicao_material
    SET pedido_reposicao_id = v_reposicao_pedido_id,
        updated_at = now()
    WHERE id = v_incidente_id;
  END IF;

  BEGIN
    INSERT INTO public.notificacoes (
      tenant_id,
      obra_id,
      pedido_id,
      material_id,
      entidade_tipo,
      entidade_id,
      tipo,
      severidade,
      titulo,
      mensagem,
      proxima_repeticao_em,
      escalar_em,
      email_critico_em,
      metadata
    ) VALUES (
      v_tenant_id,
      _obra_id,
      _pedido_id,
      _material_planejado_id,
      'incidentes_substituicao_material',
      v_incidente_id,
      'substituicao_nao_reposta',
      'warning',
      'Substituicao registrada e reposicao pendente',
      'A substituicao foi registrada e requer acompanhamento de reposicao.',
      now() + interval '1 hour',
      now() + interval '2 hours',
      now() + interval '6 hours',
      jsonb_build_object('incidente_id', v_incidente_id, 'pedido_reposicao_id', v_reposicao_pedido_id)
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'incidente_id', v_incidente_id,
    'pedido_reposicao_id', v_reposicao_pedido_id,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_valid_pedido_transition(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_material_substitution(uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric, boolean, uuid, text, text) TO authenticated;
