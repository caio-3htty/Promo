-- PRUMO 2026 consolidated implementation (3 releases)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_policy_type') THEN
    CREATE TYPE public.risk_policy_type AS ENUM ('conservador', 'equilibrado', 'agressivo');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_status_type') THEN
    CREATE TYPE public.notification_status_type AS ENUM ('aberta', 'acknowledged', 'escalada', 'encerrada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_severity_type') THEN
    CREATE TYPE public.notification_severity_type AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel_type') THEN
    CREATE TYPE public.notification_channel_type AS ENUM ('in_app', 'email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'retencao_status_type') THEN
    CREATE TYPE public.retencao_status_type AS ENUM ('pending', 'running', 'awaiting_email', 'completed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incidente_status_type') THEN
    CREATE TYPE public.incidente_status_type AS ENUM ('aberto', 'pendente_reposicao', 'resolvido');
  END IF;
END $$;

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS revisao_periodicidade_dias integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS proxima_revisao_em timestamptz;

ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS atualizado_por uuid,
  ADD COLUMN IF NOT EXISTS revisao_periodicidade_dias integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS proxima_revisao_em timestamptz,
  ADD COLUMN IF NOT EXISTS politica_risco public.risk_policy_type NOT NULL DEFAULT 'conservador',
  ADD COLUMN IF NOT EXISTS estoque_seguranca numeric NOT NULL DEFAULT 0;

ALTER TABLE public.material_fornecedor
  ADD COLUMN IF NOT EXISTS revisao_periodicidade_dias integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS proxima_revisao_em timestamptz;

ALTER TABLE public.pedidos_compra
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS acao_alerta_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS alerta_encerrado_em timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_compra_acao_alerta_status_check') THEN
    ALTER TABLE public.pedidos_compra
      ADD CONSTRAINT pedidos_compra_acao_alerta_status_check
      CHECK (acao_alerta_status IN ('pendente', 'pedido_registrado', 'codigo_registrado', 'recebimento_confirmado'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pedido_prazos_etapa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  prazo_aprovacao_mrv_previsto timestamptz,
  prazo_aprovacao_mrv_real timestamptz,
  prazo_aprovacao_fornecedor_previsto timestamptz,
  prazo_aprovacao_fornecedor_real timestamptz,
  prazo_producao_previsto timestamptz,
  prazo_producao_real timestamptz,
  prazo_entrega_previsto timestamptz,
  prazo_entrega_real timestamptz,
  requer_frete_munk boolean NOT NULL DEFAULT false,
  prazo_agendar_frete_em timestamptz,
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedido_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orcamento_material_obra_periodo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  valor_orcado numeric NOT NULL DEFAULT 0,
  valor_realizado numeric NOT NULL DEFAULT 0,
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (periodo_fim >= periodo_inicio),
  UNIQUE (tenant_id, obra_id, material_id, periodo_inicio, periodo_fim)
);

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id uuid REFERENCES public.obras(id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materiais(id) ON DELETE SET NULL,
  entidade_tipo text,
  entidade_id uuid,
  tipo text NOT NULL,
  severidade public.notification_severity_type NOT NULL DEFAULT 'warning',
  titulo text NOT NULL,
  mensagem text NOT NULL,
  status public.notification_status_type NOT NULL DEFAULT 'aberta',
  ack_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ack_em timestamptz,
  encerrada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  encerrada_em timestamptz,
  encerramento_motivo text,
  proxima_repeticao_em timestamptz,
  escalar_em timestamptz,
  email_critico_em timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notificacoes_abertas_dedup ON public.notificacoes (
  tenant_id,
  tipo,
  COALESCE(obra_id::text, ''),
  COALESCE(pedido_id::text, ''),
  COALESCE(material_id::text, ''),
  COALESCE(entidade_id::text, '')
) WHERE status IN ('aberta', 'acknowledged', 'escalada');

CREATE TABLE IF NOT EXISTS public.notificacao_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notificacao_id uuid NOT NULL REFERENCES public.notificacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nota text,
  ack_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notificacao_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notificacao_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notificacao_id uuid NOT NULL REFERENCES public.notificacoes(id) ON DELETE CASCADE,
  canal public.notification_channel_type NOT NULL,
  destino text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.incidentes_substituicao_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos_compra(id) ON DELETE SET NULL,
  material_planejado_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE RESTRICT,
  quantidade_planejada numeric NOT NULL,
  custo_planejado_unit numeric NOT NULL DEFAULT 0,
  motivo text NOT NULL,
  material_substituto_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE RESTRICT,
  origem_substituto text,
  quantidade_substituto numeric NOT NULL,
  custo_substituto_unit numeric NOT NULL DEFAULT 0,
  necessita_reposicao boolean NOT NULL DEFAULT false,
  pedido_reposicao_id uuid REFERENCES public.pedidos_compra(id) ON DELETE SET NULL,
  status public.incidente_status_type NOT NULL DEFAULT 'aberto',
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.retencao_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  janela_inicio timestamptz NOT NULL,
  janela_fim timestamptz NOT NULL,
  retencao_dias integer NOT NULL DEFAULT 365,
  status public.retencao_status_type NOT NULL DEFAULT 'pending',
  registros_expurgados integer NOT NULL DEFAULT 0,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_payload jsonb,
  erro text,
  solicitado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.refresh_cadastro_review_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.revisao_periodicidade_dias := GREATEST(1, COALESCE(NEW.revisao_periodicidade_dias, 30));
  NEW.ultima_atualizacao := CASE WHEN TG_OP = 'INSERT' THEN COALESCE(NEW.ultima_atualizacao, now()) ELSE now() END;
  NEW.proxima_revisao_em := NEW.ultima_atualizacao + make_interval(days => NEW.revisao_periodicidade_dias);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fornecedores_review_window ON public.fornecedores;
CREATE TRIGGER trg_fornecedores_review_window BEFORE INSERT OR UPDATE ON public.fornecedores
FOR EACH ROW EXECUTE FUNCTION public.refresh_cadastro_review_window();
DROP TRIGGER IF EXISTS trg_materiais_review_window ON public.materiais;
CREATE TRIGGER trg_materiais_review_window BEFORE INSERT OR UPDATE ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.refresh_cadastro_review_window();
DROP TRIGGER IF EXISTS trg_material_fornecedor_review_window ON public.material_fornecedor;
CREATE TRIGGER trg_material_fornecedor_review_window BEFORE INSERT OR UPDATE ON public.material_fornecedor
FOR EACH ROW EXECUTE FUNCTION public.refresh_cadastro_review_window();

CREATE OR REPLACE FUNCTION public.ack_notificacao(_notificacao_id uuid, _nota text DEFAULT NULL)
RETURNS public.notificacoes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_notificacao public.notificacoes;
BEGIN
  SELECT * INTO v_notificacao FROM public.notificacoes WHERE id = _notificacao_id FOR UPDATE;
  IF v_notificacao.id IS NULL THEN RAISE EXCEPTION 'Notificacao nao encontrada'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario autenticado obrigatorio'; END IF;
  IF NOT public.user_has_permission(auth.uid(), v_notificacao.tenant_id, 'notifications.view', v_notificacao.obra_id) THEN
    RAISE EXCEPTION 'Sem permissao para reconhecer notificacao';
  END IF;
  INSERT INTO public.notificacao_acks (tenant_id, notificacao_id, user_id, nota)
  VALUES (v_notificacao.tenant_id, _notificacao_id, auth.uid(), _nota)
  ON CONFLICT (notificacao_id, user_id) DO UPDATE SET nota = EXCLUDED.nota, ack_em = now();
  UPDATE public.notificacoes
  SET status = CASE WHEN status = 'encerrada' THEN status ELSE 'acknowledged' END, ack_por = auth.uid(), ack_em = now(), updated_at = now()
  WHERE id = _notificacao_id RETURNING * INTO v_notificacao;
  RETURN v_notificacao;
END; $$;

CREATE OR REPLACE FUNCTION public.encerrar_notificacao(_notificacao_id uuid, _motivo text DEFAULT NULL)
RETURNS public.notificacoes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_notificacao public.notificacoes;
BEGIN
  SELECT * INTO v_notificacao FROM public.notificacoes WHERE id = _notificacao_id FOR UPDATE;
  IF v_notificacao.id IS NULL THEN RAISE EXCEPTION 'Notificacao nao encontrada'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.user_has_permission(auth.uid(), v_notificacao.tenant_id, 'notifications.manage', v_notificacao.obra_id) THEN
    RAISE EXCEPTION 'Sem permissao para encerrar notificacao';
  END IF;
  UPDATE public.notificacoes
  SET status = 'encerrada', encerrada_por = COALESCE(auth.uid(), encerrada_por), encerrada_em = now(), encerramento_motivo = COALESCE(_motivo, encerramento_motivo), updated_at = now()
  WHERE id = _notificacao_id RETURNING * INTO v_notificacao;
  RETURN v_notificacao;
END; $$;

CREATE OR REPLACE FUNCTION public.executar_ciclo_notificacoes(_tenant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid; v_created integer := 0; v_row record;
BEGIN
  v_tenant_id := COALESCE(_tenant_id, public.current_tenant_id(auth.uid()), public.default_tenant_id());
  IF auth.uid() IS NOT NULL AND NOT public.user_has_permission(auth.uid(), v_tenant_id, 'notifications.manage', NULL) THEN
    RAISE EXCEPTION 'Sem permissao para executar ciclo de notificacoes';
  END IF;
  FOR v_row IN
    SELECT em.obra_id, em.material_id, m.nome AS material_nome
    FROM public.estoque_obra_material em
    JOIN public.materiais m ON m.id = em.material_id
    WHERE em.tenant_id = v_tenant_id AND em.atualizado_em <= now() - interval '24 hours'
  LOOP
    BEGIN
      INSERT INTO public.notificacoes (tenant_id, obra_id, material_id, entidade_tipo, entidade_id, tipo, severidade, titulo, mensagem, proxima_repeticao_em, escalar_em, email_critico_em, metadata)
      VALUES (v_tenant_id, v_row.obra_id, v_row.material_id, 'estoque_obra_material', v_row.material_id, 'estoque_desatualizado', 'warning', 'Estoque sem atualizacao recente',
        format('O material %s esta sem atualizacao de estoque ha mais de 24h.', v_row.material_nome), now() + interval '1 hour', now() + interval '1 hour', now() + interval '4 hours', jsonb_build_object('janela_horas', 24));
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'created', v_created, 'executed_at', now());
END; $$;

CREATE OR REPLACE FUNCTION public.generate_pedido_pdf_payload(_pedido_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pedido', to_jsonb(pc),
    'obra', to_jsonb(o),
    'material', to_jsonb(m),
    'fornecedor', to_jsonb(f),
    'prazos', (SELECT to_jsonb(pp) FROM public.pedido_prazos_etapa pp WHERE pp.pedido_id = pc.id LIMIT 1),
    'eventos', COALESCE((SELECT jsonb_agg(to_jsonb(pe) ORDER BY pe.created_at ASC) FROM public.pedido_eventos pe WHERE pe.pedido_id = pc.id), '[]'::jsonb),
    'incidentes_substituicao', COALESCE((SELECT jsonb_agg(to_jsonb(ism) ORDER BY ism.created_at DESC) FROM public.incidentes_substituicao_material ism WHERE ism.pedido_id = pc.id), '[]'::jsonb)
  )
  FROM public.pedidos_compra pc
  JOIN public.obras o ON o.id = pc.obra_id
  JOIN public.materiais m ON m.id = pc.material_id
  JOIN public.fornecedores f ON f.id = pc.fornecedor_id
  WHERE pc.id = _pedido_id;
$$;

CREATE OR REPLACE FUNCTION public.executar_retencao_operacional(_tenant_id uuid DEFAULT NULL, _retencao_dias integer DEFAULT 365)
RETURNS public.retencao_execucoes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid; v_cutoff timestamptz; v_exec public.retencao_execucoes; v_deleted integer := 0;
BEGIN
  v_tenant_id := COALESCE(_tenant_id, public.current_tenant_id(auth.uid()), public.default_tenant_id());
  v_cutoff := now() - make_interval(days => GREATEST(1, COALESCE(_retencao_dias, 365)));
  INSERT INTO public.retencao_execucoes (tenant_id, janela_inicio, janela_fim, retencao_dias, status, solicitado_por)
  VALUES (v_tenant_id, to_timestamp(0), v_cutoff, GREATEST(1, COALESCE(_retencao_dias, 365)), 'running', auth.uid())
  RETURNING * INTO v_exec;
  DELETE FROM public.pedido_eventos WHERE tenant_id = v_tenant_id AND created_at <= v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  UPDATE public.retencao_execucoes
  SET status = 'awaiting_email', registros_expurgados = v_deleted, resumo = jsonb_build_object('pedido_eventos_pre_expurgo', v_deleted), updated_at = now()
  WHERE id = v_exec.id RETURNING * INTO v_exec;
  RETURN v_exec;
END; $$;

ALTER TABLE public.pedido_prazos_etapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_material_obra_periodo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacao_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacao_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidentes_substituicao_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retencao_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prumo 2026 tenant scope pedido_prazos" ON public.pedido_prazos_etapa;
CREATE POLICY "Prumo 2026 tenant scope pedido_prazos" ON public.pedido_prazos_etapa
FOR ALL USING (public.user_has_permission(auth.uid(), tenant_id, 'pedidos.view', obra_id))
WITH CHECK (public.user_has_permission(auth.uid(), tenant_id, 'pedidos.plan', obra_id));

DROP POLICY IF EXISTS "Prumo 2026 tenant scope pedido_eventos" ON public.pedido_eventos;
CREATE POLICY "Prumo 2026 tenant scope pedido_eventos" ON public.pedido_eventos
FOR ALL USING (public.user_has_permission(auth.uid(), tenant_id, 'pedidos.view', obra_id))
WITH CHECK (public.user_has_permission(auth.uid(), tenant_id, 'pedidos.edit_base', obra_id) OR public.user_has_permission(auth.uid(), tenant_id, 'pedidos.receive', obra_id) OR public.user_has_permission(auth.uid(), tenant_id, 'pedidos.approve', obra_id));

DROP POLICY IF EXISTS "Prumo 2026 tenant scope orcamento" ON public.orcamento_material_obra_periodo;
CREATE POLICY "Prumo 2026 tenant scope orcamento" ON public.orcamento_material_obra_periodo
FOR ALL USING (public.user_has_permission(auth.uid(), tenant_id, 'orcamento.view', obra_id))
WITH CHECK (public.user_has_permission(auth.uid(), tenant_id, 'orcamento.manage', obra_id));

DROP POLICY IF EXISTS "Prumo 2026 tenant scope notificacoes" ON public.notificacoes;
CREATE POLICY "Prumo 2026 tenant scope notificacoes" ON public.notificacoes
FOR ALL USING (public.user_has_permission(auth.uid(), tenant_id, 'notifications.view', obra_id))
WITH CHECK (public.user_has_permission(auth.uid(), tenant_id, 'notifications.manage', obra_id));

DROP POLICY IF EXISTS "Prumo 2026 tenant scope notificacao_acks" ON public.notificacao_acks;
CREATE POLICY "Prumo 2026 tenant scope notificacao_acks" ON public.notificacao_acks
FOR ALL USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Prumo 2026 tenant scope notificacao_entregas" ON public.notificacao_entregas;
CREATE POLICY "Prumo 2026 tenant scope notificacao_entregas" ON public.notificacao_entregas
FOR ALL USING (public.is_same_tenant(tenant_id, auth.uid()) AND public.user_has_permission(auth.uid(), tenant_id, 'notifications.view', NULL))
WITH CHECK (public.is_same_tenant(tenant_id, auth.uid()) AND public.user_has_permission(auth.uid(), tenant_id, 'notifications.manage', NULL));

DROP POLICY IF EXISTS "Prumo 2026 tenant scope incidentes" ON public.incidentes_substituicao_material;
CREATE POLICY "Prumo 2026 tenant scope incidentes" ON public.incidentes_substituicao_material
FOR ALL USING (public.user_has_permission(auth.uid(), tenant_id, 'incidentes.view', obra_id))
WITH CHECK (public.user_has_permission(auth.uid(), tenant_id, 'incidentes.manage', obra_id));

DROP POLICY IF EXISTS "Prumo 2026 tenant scope retencao" ON public.retencao_execucoes;
CREATE POLICY "Prumo 2026 tenant scope retencao" ON public.retencao_execucoes
FOR ALL USING (public.user_has_permission(auth.uid(), tenant_id, 'reports.view', NULL))
WITH CHECK (public.user_has_permission(auth.uid(), tenant_id, 'reports.generate', NULL));

INSERT INTO public.permission_catalog (key, area, label_pt, label_en, label_es, obra_scoped)
VALUES
  ('pedidos.plan', 'compras', 'Gerenciar prazos de etapa', 'Manage stage deadlines', 'Gestionar plazos de etapa', true),
  ('orcamento.view', 'compras', 'Visualizar orcamentos de material', 'View material budgets', 'Ver presupuestos de material', true),
  ('orcamento.manage', 'compras', 'Gerenciar orcamentos de material', 'Manage material budgets', 'Gestionar presupuestos de material', true),
  ('notifications.view', 'monitoramento', 'Visualizar alertas', 'View alerts', 'Ver alertas', true),
  ('notifications.manage', 'monitoramento', 'Gerenciar alertas', 'Manage alerts', 'Gestionar alertas', true),
  ('reports.view', 'governanca', 'Visualizar relatorios operacionais', 'View operational reports', 'Ver reportes operativos', false),
  ('reports.generate', 'governanca', 'Gerar relatorios operacionais', 'Generate operational reports', 'Generar reportes operativos', false),
  ('incidentes.view', 'operacao', 'Visualizar incidentes de substituicao', 'View substitution incidents', 'Ver incidentes de sustitucion', true),
  ('incidentes.manage', 'operacao', 'Gerenciar incidentes de substituicao', 'Manage substitution incidents', 'Gestionar incidentes de sustitucion', true)
ON CONFLICT (key) DO UPDATE
SET area = EXCLUDED.area, label_pt = EXCLUDED.label_pt, label_en = EXCLUDED.label_en, label_es = EXCLUDED.label_es, obra_scoped = EXCLUDED.obra_scoped, is_active = true;

GRANT EXECUTE ON FUNCTION public.ack_notificacao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_notificacao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.executar_ciclo_notificacoes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pedido_pdf_payload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.executar_retencao_operacional(uuid, integer) TO authenticated;

