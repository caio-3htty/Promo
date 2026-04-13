-- P4-P6 implementation: forecast/recommendation, persona dashboards, and Excel import pipeline

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_entity_type') THEN
    CREATE TYPE public.import_entity_type AS ENUM (
      'fornecedores',
      'materiais',
      'material_fornecedor',
      'estoque_inicial',
      'obras',
      'usuarios'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_job_status') THEN
    CREATE TYPE public.import_job_status AS ENUM (
      'preview_ready',
      'preview_error',
      'committed',
      'failed'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.recomendacoes_compra_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  estoque_atual numeric NOT NULL DEFAULT 0,
  consumo_medio_diario numeric NOT NULL DEFAULT 0,
  dias_cobertura numeric,
  data_ruptura_estimada date,
  lead_time_real_dias numeric NOT NULL DEFAULT 0,
  data_pedido_ideal date,
  risco text NOT NULL,
  recomendacao text NOT NULL,
  justificativa text NOT NULL,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  gerado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recomendacoes_historico_tenant_obra_material
ON public.recomendacoes_compra_historico (tenant_id, obra_id, material_id, gerado_em DESC);

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type public.import_entity_type NOT NULL,
  status public.import_job_status NOT NULL,
  file_name text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  normalized_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  preview_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  committed_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  committed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_created
ON public.import_jobs (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_import_jobs_touch_updated_at ON public.import_jobs;
CREATE TRIGGER tr_import_jobs_touch_updated_at
BEFORE UPDATE ON public.import_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

CREATE OR REPLACE FUNCTION public.compute_material_forecast(
  _tenant_id uuid DEFAULT NULL,
  _obra_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid,
  obra_id uuid,
  material_id uuid,
  material_nome text,
  unidade text,
  estoque_atual numeric,
  estoque_minimo numeric,
  estoque_seguranca numeric,
  consumo_medio_diario numeric,
  dias_cobertura numeric,
  data_ruptura_estimada date,
  lead_time_real_dias numeric,
  data_pedido_ideal date,
  risco text,
  recomendacao text,
  justificativa text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT COALESCE(_tenant_id, public.current_tenant_id(auth.uid()), public.default_tenant_id()) AS tenant_id
  ),
  base AS (
    SELECT
      c.tenant_id,
      em.obra_id,
      em.material_id,
      m.nome AS material_nome,
      m.unidade,
      COALESCE(em.estoque_atual, 0) AS estoque_atual,
      COALESCE(m.estoque_minimo, 0) AS estoque_minimo,
      COALESCE(m.estoque_seguranca, 0) AS estoque_seguranca,
      COALESCE(m.consumo_medio_diario, 0) AS consumo_medio_diario,
      GREATEST(
        COALESCE(
          (
            SELECT COALESCE(NULLIF(AVG(NULLIF(mf.lead_time_real_dias, 0)), 0), NULLIF(AVG(NULLIF(mf.lead_time_dias, 0)), 0))
            FROM public.material_fornecedor mf
            WHERE mf.tenant_id = c.tenant_id
              AND mf.material_id = em.material_id
              AND mf.deleted_at IS NULL
          ),
          7
        ),
        1
      ) AS lead_time_real_dias,
      COALESCE(m.criticidade, 'media') AS criticidade
    FROM ctx c
    JOIN public.estoque_obra_material em ON em.tenant_id = c.tenant_id
    JOIN public.materiais m ON m.id = em.material_id AND m.tenant_id = c.tenant_id AND m.deleted_at IS NULL
    WHERE (_obra_id IS NULL OR em.obra_id = _obra_id)
  ),
  calc AS (
    SELECT
      b.*, 
      CASE
        WHEN b.consumo_medio_diario <= 0 THEN NULL
        ELSE ROUND((GREATEST(b.estoque_atual - b.estoque_seguranca, 0) / NULLIF(b.consumo_medio_diario, 0))::numeric, 2)
      END AS dias_cobertura,
      CASE
        WHEN b.consumo_medio_diario <= 0 THEN NULL
        ELSE (CURRENT_DATE + ((GREATEST(b.estoque_atual - b.estoque_seguranca, 0) / NULLIF(b.consumo_medio_diario, 0)) * interval '1 day'))::date
      END AS data_ruptura_estimada
    FROM base b
  )
  SELECT
    c.tenant_id,
    c.obra_id,
    c.material_id,
    c.material_nome,
    c.unidade,
    c.estoque_atual,
    c.estoque_minimo,
    c.estoque_seguranca,
    c.consumo_medio_diario,
    c.dias_cobertura,
    c.data_ruptura_estimada,
    c.lead_time_real_dias,
    CASE
      WHEN c.data_ruptura_estimada IS NULL THEN NULL
      ELSE (c.data_ruptura_estimada - make_interval(days => GREATEST(c.lead_time_real_dias::int, 1)))::date
    END AS data_pedido_ideal,
    CASE
      WHEN c.estoque_atual <= 0 THEN 'alto'
      WHEN c.dias_cobertura IS NULL THEN 'medio'
      WHEN c.dias_cobertura <= c.lead_time_real_dias THEN 'alto'
      WHEN c.dias_cobertura <= c.lead_time_real_dias + CASE WHEN c.criticidade IN ('alta', 'critica') THEN 3 ELSE 2 END THEN 'medio'
      ELSE 'baixo'
    END AS risco,
    CASE
      WHEN c.estoque_atual <= 0 THEN 'Pedir agora'
      WHEN c.dias_cobertura IS NULL THEN 'Validar consumo e monitorar'
      WHEN c.dias_cobertura <= c.lead_time_real_dias THEN 'Pedir agora'
      WHEN c.dias_cobertura <= c.lead_time_real_dias + CASE WHEN c.criticidade IN ('alta', 'critica') THEN 3 ELSE 2 END THEN 'Pedir em ate 24h'
      ELSE 'Monitorar'
    END AS recomendacao,
    CASE
      WHEN c.estoque_atual <= 0 THEN format('Estoque zerado. Lead time medio %.1f dias.', c.lead_time_real_dias)
      WHEN c.dias_cobertura IS NULL THEN 'Sem consumo medio diario configurado para previsao confiavel.'
      WHEN c.dias_cobertura <= c.lead_time_real_dias THEN format('Cobertura %.2f dias menor/igual ao lead time %.1f dias.', c.dias_cobertura, c.lead_time_real_dias)
      ELSE format('Cobertura %.2f dias para lead time %.1f dias.', c.dias_cobertura, c.lead_time_real_dias)
    END AS justificativa
  FROM calc c;
$$;
CREATE OR REPLACE FUNCTION public.registrar_snapshot_recomendacoes(
  _tenant_id uuid DEFAULT NULL,
  _obra_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_actor uuid := auth.uid();
  v_inserted integer := 0;
BEGIN
  v_tenant_id := COALESCE(_tenant_id, public.current_tenant_id(v_actor), public.default_tenant_id());

  IF v_actor IS NOT NULL
     AND NOT public.user_has_permission(v_actor, v_tenant_id, 'estoque.view', _obra_id) THEN
    RAISE EXCEPTION 'Sem permissao para registrar snapshot de recomendacoes';
  END IF;

  INSERT INTO public.recomendacoes_compra_historico (
    tenant_id,
    obra_id,
    material_id,
    estoque_atual,
    consumo_medio_diario,
    dias_cobertura,
    data_ruptura_estimada,
    lead_time_real_dias,
    data_pedido_ideal,
    risco,
    recomendacao,
    justificativa,
    gerado_por
  )
  SELECT
    f.tenant_id,
    f.obra_id,
    f.material_id,
    f.estoque_atual,
    f.consumo_medio_diario,
    f.dias_cobertura,
    f.data_ruptura_estimada,
    f.lead_time_real_dias,
    f.data_pedido_ideal,
    f.risco,
    f.recomendacao,
    f.justificativa,
    v_actor
  FROM public.compute_material_forecast(v_tenant_id, _obra_id) f;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'obra_id', _obra_id,
    'inserted', v_inserted,
    'generated_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  _tenant_id uuid DEFAULT NULL,
  _obra_id uuid DEFAULT NULL,
  _inicio timestamptz DEFAULT NULL,
  _fim timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_total_obras integer := 0;
  v_total_pedidos integer := 0;
  v_pedidos_atrasados integer := 0;
  v_pedidos_entregues integer := 0;
  v_alertas_ativos integer := 0;
  v_alertas_criticos integer := 0;
  v_estoque_desatualizado integer := 0;
  v_risco_ruptura integer := 0;
  v_substituicoes_pendentes integer := 0;
  v_solicitacoes_pendentes integer := 0;
  v_usuarios_ativos integer := 0;
BEGIN
  v_tenant_id := COALESCE(_tenant_id, public.current_tenant_id(v_actor), public.default_tenant_id());
  v_inicio := COALESCE(_inicio, now() - interval '30 days');
  v_fim := COALESCE(_fim, now());

  IF v_actor IS NOT NULL
     AND NOT public.user_has_permission(v_actor, v_tenant_id, 'obras.view', _obra_id) THEN
    RAISE EXCEPTION 'Sem permissao para visualizar dashboard';
  END IF;

  SELECT count(*) INTO v_total_obras
  FROM public.obras o
  WHERE o.tenant_id = v_tenant_id
    AND o.deleted_at IS NULL
    AND (_obra_id IS NULL OR o.id = _obra_id);

  SELECT count(*),
         count(*) FILTER (WHERE pc.status = 'atrasado'),
         count(*) FILTER (WHERE pc.status = 'entregue')
  INTO v_total_pedidos, v_pedidos_atrasados, v_pedidos_entregues
  FROM public.pedidos_compra pc
  WHERE pc.tenant_id = v_tenant_id
    AND pc.deleted_at IS NULL
    AND (_obra_id IS NULL OR pc.obra_id = _obra_id)
    AND pc.criado_em BETWEEN v_inicio AND v_fim;

  SELECT count(*),
         count(*) FILTER (WHERE n.severidade = 'critical')
  INTO v_alertas_ativos, v_alertas_criticos
  FROM public.notificacoes n
  WHERE n.tenant_id = v_tenant_id
    AND n.status <> 'encerrada'
    AND (_obra_id IS NULL OR n.obra_id = _obra_id);

  SELECT count(*) INTO v_estoque_desatualizado
  FROM public.estoque_obra_material em
  WHERE em.tenant_id = v_tenant_id
    AND (_obra_id IS NULL OR em.obra_id = _obra_id)
    AND COALESCE(em.ultima_atualizacao_estoque, em.atualizado_em) <= now() - interval '24 hours';

  SELECT count(*) INTO v_risco_ruptura
  FROM public.compute_material_forecast(v_tenant_id, _obra_id) f
  WHERE f.risco = 'alto';

  SELECT count(*) INTO v_substituicoes_pendentes
  FROM public.incidentes_substituicao_material ism
  WHERE ism.tenant_id = v_tenant_id
    AND (_obra_id IS NULL OR ism.obra_id = _obra_id)
    AND ism.status = 'pendente_reposicao';

  SELECT count(*) INTO v_solicitacoes_pendentes
  FROM public.access_signup_requests ar
  WHERE ar.tenant_id = v_tenant_id
    AND ar.status = 'pending';

  SELECT count(*) INTO v_usuarios_ativos
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant_id
    AND p.is_active = true;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'filters', jsonb_build_object('obra_id', _obra_id, 'inicio', v_inicio, 'fim', v_fim),
    'master_gestor', jsonb_build_object(
      'obras_ativas', v_total_obras,
      'pedidos_total', v_total_pedidos,
      'pedidos_atrasados', v_pedidos_atrasados,
      'alertas_ativos', v_alertas_ativos,
      'alertas_criticos', v_alertas_criticos,
      'solicitacoes_pendentes', v_solicitacoes_pendentes,
      'usuarios_ativos', v_usuarios_ativos
    ),
    'engenheiro', jsonb_build_object(
      'pedidos_atrasados', v_pedidos_atrasados,
      'risco_ruptura', v_risco_ruptura,
      'substituicoes_pendentes', v_substituicoes_pendentes,
      'alertas_ativos', v_alertas_ativos
    ),
    'operacional_almoxarife', jsonb_build_object(
      'itens_estoque_desatualizado', v_estoque_desatualizado,
      'itens_risco_ruptura', v_risco_ruptura,
      'pedidos_entregues_periodo', v_pedidos_entregues,
      'pedidos_total_periodo', v_total_pedidos
    ),
    'series', jsonb_build_object(
      'pedidos_por_status', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('status', s.status, 'total', s.total) ORDER BY s.status), '[]'::jsonb)
        FROM (
          SELECT pc.status, count(*)::integer AS total
          FROM public.pedidos_compra pc
          WHERE pc.tenant_id = v_tenant_id
            AND pc.deleted_at IS NULL
            AND (_obra_id IS NULL OR pc.obra_id = _obra_id)
            AND pc.criado_em BETWEEN v_inicio AND v_fim
          GROUP BY pc.status
        ) s
      ),
      'materiais_risco', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'material_id', f.material_id,
          'material_nome', f.material_nome,
          'dias_cobertura', f.dias_cobertura,
          'risco', f.risco,
          'recomendacao', f.recomendacao
        ) ORDER BY CASE f.risco WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END, f.material_nome), '[]'::jsonb)
        FROM public.compute_material_forecast(v_tenant_id, _obra_id) f
      )
    )
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.import_preview_rows(
  _entity_type public.import_entity_type,
  _file_name text,
  _rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id uuid;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_row jsonb;
  v_idx integer := 0;
  v_job_id uuid;
  v_status public.import_job_status;
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'Rows deve ser um array JSON';
  END IF;

  v_tenant_id := public.current_tenant_id(v_actor);

  IF v_actor IS NULL OR NOT public.user_has_permission(v_actor, v_tenant_id, 'users.manage', NULL) THEN
    RAISE EXCEPTION 'Sem permissao para importar';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    v_idx := v_idx + 1;

    IF _entity_type = 'fornecedores' THEN
      IF COALESCE(NULLIF(BTRIM(v_row->>'nome'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'nome', 'message', 'Nome obrigatorio');
      END IF;
      IF COALESCE(NULLIF(BTRIM(v_row->>'cnpj'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'cnpj', 'message', 'CNPJ obrigatorio');
      END IF;

      v_normalized := v_normalized || jsonb_build_object(
        'nome', COALESCE(NULLIF(BTRIM(v_row->>'nome'), ''), ''),
        'cnpj', COALESCE(NULLIF(BTRIM(v_row->>'cnpj'), ''), ''),
        'contatos', NULLIF(BTRIM(COALESCE(v_row->>'contatos', '')), ''),
        'entrega_propria', CASE WHEN lower(COALESCE(v_row->>'entrega_propria', '')) IN ('1', 'true', 'sim', 'yes', 'y') THEN true ELSE false END,
        'prazo_prometido_dias', COALESCE(NULLIF(v_row->>'prazo_prometido_dias', '')::integer, 0),
        'prazo_real_medio_dias', COALESCE(NULLIF(v_row->>'prazo_real_medio_dias', '')::numeric, 0),
        'confiabilidade', COALESCE(NULLIF(v_row->>'confiabilidade', '')::numeric, 1)
      );
    ELSIF _entity_type = 'materiais' THEN
      IF COALESCE(NULLIF(BTRIM(v_row->>'nome'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'nome', 'message', 'Nome obrigatorio');
      END IF;

      v_normalized := v_normalized || jsonb_build_object(
        'nome', COALESCE(NULLIF(BTRIM(v_row->>'nome'), ''), ''),
        'unidade', COALESCE(NULLIF(BTRIM(v_row->>'unidade'), ''), 'un'),
        'estoque_minimo', COALESCE(NULLIF(v_row->>'estoque_minimo', '')::numeric, 0),
        'estoque_seguranca', COALESCE(NULLIF(v_row->>'estoque_seguranca', '')::numeric, 0),
        'criticidade', COALESCE(NULLIF(BTRIM(v_row->>'criticidade'), ''), 'media'),
        'consumo_medio_diario', COALESCE(NULLIF(v_row->>'consumo_medio_diario', '')::numeric, 0),
        'tempo_producao_padrao', COALESCE(NULLIF(v_row->>'tempo_producao_padrao', '')::integer, 0)
      );
    ELSIF _entity_type = 'material_fornecedor' THEN
      IF COALESCE(NULLIF(BTRIM(v_row->>'material_nome'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'material_nome', 'message', 'material_nome obrigatorio');
      END IF;
      IF COALESCE(NULLIF(BTRIM(v_row->>'fornecedor_cnpj'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'fornecedor_cnpj', 'message', 'fornecedor_cnpj obrigatorio');
      END IF;

      v_normalized := v_normalized || jsonb_build_object(
        'material_nome', COALESCE(NULLIF(BTRIM(v_row->>'material_nome'), ''), ''),
        'fornecedor_cnpj', COALESCE(NULLIF(BTRIM(v_row->>'fornecedor_cnpj'), ''), ''),
        'preco_atual', COALESCE(NULLIF(v_row->>'preco_atual', '')::numeric, 0),
        'pedido_minimo', COALESCE(NULLIF(v_row->>'pedido_minimo', '')::numeric, 0),
        'lead_time_dias', COALESCE(NULLIF(v_row->>'lead_time_dias', '')::integer, 0),
        'lead_time_real_dias', COALESCE(NULLIF(v_row->>'lead_time_real_dias', '')::numeric, 0),
        'fornecedor_preferencial', CASE WHEN lower(COALESCE(v_row->>'fornecedor_preferencial', '')) IN ('1', 'true', 'sim', 'yes', 'y') THEN true ELSE false END
      );
    ELSIF _entity_type = 'estoque_inicial' THEN
      IF COALESCE(NULLIF(BTRIM(v_row->>'obra_nome'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'obra_nome', 'message', 'obra_nome obrigatorio');
      END IF;
      IF COALESCE(NULLIF(BTRIM(v_row->>'material_nome'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'material_nome', 'message', 'material_nome obrigatorio');
      END IF;

      v_normalized := v_normalized || jsonb_build_object(
        'obra_nome', COALESCE(NULLIF(BTRIM(v_row->>'obra_nome'), ''), ''),
        'material_nome', COALESCE(NULLIF(BTRIM(v_row->>'material_nome'), ''), ''),
        'saldo', COALESCE(NULLIF(v_row->>'saldo', '')::numeric, 0),
        'motivo', COALESCE(NULLIF(BTRIM(v_row->>'motivo'), ''), 'carga inicial')
      );
    ELSIF _entity_type = 'obras' THEN
      IF COALESCE(NULLIF(BTRIM(v_row->>'name'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'name', 'message', 'name obrigatorio');
      END IF;

      v_normalized := v_normalized || jsonb_build_object(
        'name', COALESCE(NULLIF(BTRIM(v_row->>'name'), ''), ''),
        'description', NULLIF(BTRIM(COALESCE(v_row->>'description', '')), ''),
        'address', NULLIF(BTRIM(COALESCE(v_row->>'address', '')), ''),
        'status', COALESCE(NULLIF(BTRIM(v_row->>'status'), ''), 'ativa')
      );
    ELSE
      -- usuarios
      IF COALESCE(NULLIF(BTRIM(v_row->>'email'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'email', 'message', 'email obrigatorio');
      END IF;
      IF COALESCE(NULLIF(BTRIM(v_row->>'full_name'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'full_name', 'message', 'full_name obrigatorio');
      END IF;
      IF COALESCE(NULLIF(BTRIM(v_row->>'job_title'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'job_title', 'message', 'job_title obrigatorio');
      END IF;
      IF COALESCE(NULLIF(BTRIM(v_row->>'role'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'role', 'message', 'role obrigatorio');
      END IF;
      IF COALESCE(NULLIF(BTRIM(v_row->>'temp_password'), ''), '') = '' THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'temp_password', 'message', 'temp_password obrigatorio');
      END IF;

      v_normalized := v_normalized || jsonb_build_object(
        'email', lower(COALESCE(NULLIF(BTRIM(v_row->>'email'), ''), '')),
        'full_name', COALESCE(NULLIF(BTRIM(v_row->>'full_name'), ''), ''),
        'job_title', COALESCE(NULLIF(BTRIM(v_row->>'job_title'), ''), ''),
        'phone', NULLIF(BTRIM(COALESCE(v_row->>'phone', '')), ''),
        'role', lower(COALESCE(NULLIF(BTRIM(v_row->>'role'), ''), 'operacional')),
        'obra_names', COALESCE(v_row->'obra_names', '[]'::jsonb),
        'temp_password', COALESCE(NULLIF(BTRIM(v_row->>'temp_password'), ''), '')
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    v_status := 'preview_error';
  ELSE
    v_status := 'preview_ready';
  END IF;

  v_preview := (
    SELECT COALESCE(jsonb_agg(x.value), '[]'::jsonb)
    FROM (
      SELECT value
      FROM jsonb_array_elements(v_normalized)
      LIMIT 20
    ) x
  );

  INSERT INTO public.import_jobs (
    tenant_id,
    entity_type,
    status,
    file_name,
    summary,
    errors,
    warnings,
    normalized_rows,
    preview_rows,
    created_by
  ) VALUES (
    v_tenant_id,
    _entity_type,
    v_status,
    COALESCE(NULLIF(BTRIM(_file_name), ''), 'import.xlsx'),
    jsonb_build_object(
      'rows_total', jsonb_array_length(_rows),
      'critical_errors', jsonb_array_length(v_errors),
      'warnings', jsonb_array_length(v_warnings)
    ),
    v_errors,
    v_warnings,
    v_normalized,
    v_preview,
    v_actor
  ) RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'job_id', v_job_id,
    'status', v_status,
    'summary', jsonb_build_object(
      'rows_total', jsonb_array_length(_rows),
      'critical_errors', jsonb_array_length(v_errors),
      'warnings', jsonb_array_length(v_warnings)
    ),
    'errors', v_errors,
    'warnings', v_warnings,
    'preview_rows', v_preview
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.import_commit_job(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.import_jobs;
  v_row jsonb;
  v_count integer := 0;
  v_material_id uuid;
  v_fornecedor_id uuid;
  v_obra_id uuid;
BEGIN
  SELECT * INTO v_job
  FROM public.import_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Import job nao encontrado';
  END IF;

  IF v_actor IS NULL OR NOT public.user_has_permission(v_actor, v_job.tenant_id, 'users.manage', NULL) THEN
    RAISE EXCEPTION 'Sem permissao para confirmar importacao';
  END IF;

  IF v_job.status <> 'preview_ready' THEN
    RAISE EXCEPTION 'Job nao esta pronto para commit';
  END IF;

  IF COALESCE((v_job.summary->>'critical_errors')::integer, 0) > 0 THEN
    RAISE EXCEPTION 'Job possui erros criticos e nao pode ser importado';
  END IF;

  IF v_job.entity_type = 'fornecedores' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_job.normalized_rows)
    LOOP
      UPDATE public.fornecedores
      SET
        nome = v_row->>'nome',
        contatos = v_row->>'contatos',
        entrega_propria = CASE WHEN lower(COALESCE(v_row->>'entrega_propria', '')) IN ('1', 'true', 'sim', 'yes', 'y') THEN true ELSE false END,
        prazo_prometido_dias = COALESCE((v_row->>'prazo_prometido_dias')::integer, 0),
        prazo_real_medio_dias = COALESCE((v_row->>'prazo_real_medio_dias')::numeric, 0),
        confiabilidade = COALESCE((v_row->>'confiabilidade')::numeric, 1),
        atualizado_por = v_actor,
        ultima_atualizacao = now()
      WHERE tenant_id = v_job.tenant_id
        AND cnpj = v_row->>'cnpj';

      IF NOT FOUND THEN
        INSERT INTO public.fornecedores (
          tenant_id,
          nome,
          cnpj,
          contatos,
          entrega_propria,
          prazo_prometido_dias,
          prazo_real_medio_dias,
          confiabilidade,
          atualizado_por,
          ultima_atualizacao
        ) VALUES (
          v_job.tenant_id,
          v_row->>'nome',
          v_row->>'cnpj',
          v_row->>'contatos',
          CASE WHEN lower(COALESCE(v_row->>'entrega_propria', '')) IN ('1', 'true', 'sim', 'yes', 'y') THEN true ELSE false END,
          COALESCE((v_row->>'prazo_prometido_dias')::integer, 0),
          COALESCE((v_row->>'prazo_real_medio_dias')::numeric, 0),
          COALESCE((v_row->>'confiabilidade')::numeric, 1),
          v_actor,
          now()
        );
      END IF;

      v_count := v_count + 1;
    END LOOP;

  ELSIF v_job.entity_type = 'materiais' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_job.normalized_rows)
    LOOP
      UPDATE public.materiais
      SET
        unidade = COALESCE(NULLIF(v_row->>'unidade', ''), 'un'),
        estoque_minimo = COALESCE((v_row->>'estoque_minimo')::numeric, 0),
        estoque_seguranca = COALESCE((v_row->>'estoque_seguranca')::numeric, 0),
        criticidade = COALESCE(NULLIF(v_row->>'criticidade', ''), 'media'),
        consumo_medio_diario = COALESCE((v_row->>'consumo_medio_diario')::numeric, 0),
        tempo_producao_padrao = COALESCE((v_row->>'tempo_producao_padrao')::integer, 0),
        atualizado_por = v_actor,
        ultima_atualizacao = now(),
        updated_at = now()
      WHERE tenant_id = v_job.tenant_id
        AND lower(nome) = lower(v_row->>'nome');

      IF NOT FOUND THEN
        INSERT INTO public.materiais (
          tenant_id,
          nome,
          unidade,
          estoque_minimo,
          estoque_seguranca,
          criticidade,
          consumo_medio_diario,
          tempo_producao_padrao,
          atualizado_por,
          ultima_atualizacao
        ) VALUES (
          v_job.tenant_id,
          v_row->>'nome',
          COALESCE(NULLIF(v_row->>'unidade', ''), 'un'),
          COALESCE((v_row->>'estoque_minimo')::numeric, 0),
          COALESCE((v_row->>'estoque_seguranca')::numeric, 0),
          COALESCE(NULLIF(v_row->>'criticidade', ''), 'media'),
          COALESCE((v_row->>'consumo_medio_diario')::numeric, 0),
          COALESCE((v_row->>'tempo_producao_padrao')::integer, 0),
          v_actor,
          now()
        );
      END IF;

      v_count := v_count + 1;
    END LOOP;

  ELSIF v_job.entity_type = 'material_fornecedor' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_job.normalized_rows)
    LOOP
      SELECT id INTO v_material_id
      FROM public.materiais
      WHERE tenant_id = v_job.tenant_id
        AND lower(nome) = lower(v_row->>'material_nome')
      LIMIT 1;

      IF v_material_id IS NULL THEN
        RAISE EXCEPTION 'Material nao encontrado para vinculo: %', v_row->>'material_nome';
      END IF;

      SELECT id INTO v_fornecedor_id
      FROM public.fornecedores
      WHERE tenant_id = v_job.tenant_id
        AND cnpj = v_row->>'fornecedor_cnpj'
      LIMIT 1;

      IF v_fornecedor_id IS NULL THEN
        RAISE EXCEPTION 'Fornecedor nao encontrado para CNPJ: %', v_row->>'fornecedor_cnpj';
      END IF;

      UPDATE public.material_fornecedor
      SET
        preco_atual = COALESCE((v_row->>'preco_atual')::numeric, 0),
        pedido_minimo = COALESCE((v_row->>'pedido_minimo')::numeric, 0),
        lead_time_dias = COALESCE((v_row->>'lead_time_dias')::integer, 0),
        lead_time_real_dias = COALESCE((v_row->>'lead_time_real_dias')::numeric, 0),
        fornecedor_preferencial = CASE WHEN lower(COALESCE(v_row->>'fornecedor_preferencial', '')) IN ('1', 'true', 'sim', 'yes', 'y') THEN true ELSE false END,
        atualizado_por = v_actor,
        ultima_atualizacao = now()
      WHERE tenant_id = v_job.tenant_id
        AND material_id = v_material_id
        AND fornecedor_id = v_fornecedor_id;

      IF NOT FOUND THEN
        INSERT INTO public.material_fornecedor (
          tenant_id,
          material_id,
          fornecedor_id,
          preco_atual,
          pedido_minimo,
          lead_time_dias,
          lead_time_real_dias,
          fornecedor_preferencial,
          atualizado_por,
          ultima_atualizacao
        ) VALUES (
          v_job.tenant_id,
          v_material_id,
          v_fornecedor_id,
          COALESCE((v_row->>'preco_atual')::numeric, 0),
          COALESCE((v_row->>'pedido_minimo')::numeric, 0),
          COALESCE((v_row->>'lead_time_dias')::integer, 0),
          COALESCE((v_row->>'lead_time_real_dias')::numeric, 0),
          CASE WHEN lower(COALESCE(v_row->>'fornecedor_preferencial', '')) IN ('1', 'true', 'sim', 'yes', 'y') THEN true ELSE false END,
          v_actor,
          now()
        );
      END IF;

      v_count := v_count + 1;
    END LOOP;

  ELSIF v_job.entity_type = 'estoque_inicial' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_job.normalized_rows)
    LOOP
      SELECT id INTO v_obra_id
      FROM public.obras
      WHERE tenant_id = v_job.tenant_id
        AND lower(name) = lower(v_row->>'obra_nome')
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_obra_id IS NULL THEN
        RAISE EXCEPTION 'Obra nao encontrada: %', v_row->>'obra_nome';
      END IF;

      SELECT id INTO v_material_id
      FROM public.materiais
      WHERE tenant_id = v_job.tenant_id
        AND lower(nome) = lower(v_row->>'material_nome')
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_material_id IS NULL THEN
        RAISE EXCEPTION 'Material nao encontrado: %', v_row->>'material_nome';
      END IF;

      PERFORM public.registrar_ajuste_estoque(
        v_obra_id,
        v_material_id,
        'inicial'::public.estoque_ajuste_tipo,
        COALESCE((v_row->>'saldo')::numeric, 0),
        COALESCE(NULLIF(v_row->>'motivo', ''), 'importacao de estoque inicial')
      );

      v_count := v_count + 1;
    END LOOP;

  ELSIF v_job.entity_type = 'obras' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_job.normalized_rows)
    LOOP
      UPDATE public.obras
      SET
        description = v_row->>'description',
        address = v_row->>'address',
        status = COALESCE(NULLIF(v_row->>'status', ''), 'ativa'),
        updated_at = now()
      WHERE tenant_id = v_job.tenant_id
        AND lower(name) = lower(v_row->>'name')
        AND deleted_at IS NULL;

      IF NOT FOUND THEN
        INSERT INTO public.obras (
          tenant_id,
          name,
          description,
          address,
          status
        ) VALUES (
          v_job.tenant_id,
          v_row->>'name',
          v_row->>'description',
          v_row->>'address',
          COALESCE(NULLIF(v_row->>'status', ''), 'ativa')
        );
      END IF;

      v_count := v_count + 1;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Commit de usuarios deve ser executado via edge function admin-user-provision em lote.';
  END IF;

  UPDATE public.import_jobs
  SET
    status = 'committed',
    committed_count = v_count,
    committed_by = v_actor,
    committed_at = now(),
    updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'status', 'committed',
    'committed_count', v_count,
    'entity_type', v_job.entity_type
  );
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.import_jobs
    SET
      status = 'failed',
      summary = COALESCE(summary, '{}'::jsonb) || jsonb_build_object('failure', SQLERRM),
      updated_at = now()
    WHERE id = _job_id;
    RAISE;
END;
$$;

ALTER TABLE public.recomendacoes_compra_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recomendacoes_historico_select" ON public.recomendacoes_compra_historico;
CREATE POLICY "recomendacoes_historico_select"
ON public.recomendacoes_compra_historico
FOR SELECT
USING (public.user_has_permission(auth.uid(), tenant_id, 'estoque.view', obra_id));

DROP POLICY IF EXISTS "import_jobs_manage" ON public.import_jobs;
CREATE POLICY "import_jobs_manage"
ON public.import_jobs
FOR ALL
USING (public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL))
WITH CHECK (public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL));

INSERT INTO public.permission_catalog (key, area, label_pt, label_en, label_es, obra_scoped)
VALUES
  ('import.manage', 'governanca', 'Gerenciar importacao em lote', 'Manage bulk import', 'Gestionar importacion masiva', false)
ON CONFLICT (key) DO UPDATE
SET area = EXCLUDED.area,
    label_pt = EXCLUDED.label_pt,
    label_en = EXCLUDED.label_en,
    label_es = EXCLUDED.label_es,
    obra_scoped = EXCLUDED.obra_scoped,
    is_active = true;

CREATE OR REPLACE FUNCTION public.executar_ciclo_notificacoes_p4(_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base jsonb;
  v_tenant_id uuid;
  v_row record;
  v_rec_created integer := 0;
  v_snapshot jsonb;
BEGIN
  v_tenant_id := COALESCE(_tenant_id, public.current_tenant_id(auth.uid()), public.default_tenant_id());

  IF auth.uid() IS NOT NULL
     AND NOT public.user_has_permission(auth.uid(), v_tenant_id, 'notifications.manage', NULL) THEN
    RAISE EXCEPTION 'Sem permissao para executar ciclo de notificacoes';
  END IF;

  v_base := public.executar_ciclo_notificacoes(v_tenant_id);
  v_snapshot := public.registrar_snapshot_recomendacoes(v_tenant_id, NULL);

  FOR v_row IN
    SELECT *
    FROM public.compute_material_forecast(v_tenant_id, NULL)
    WHERE risco IN ('alto', 'medio')
  LOOP
    BEGIN
      INSERT INTO public.notificacoes (
        tenant_id,
        obra_id,
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
      )
      VALUES (
        v_tenant_id,
        v_row.obra_id,
        v_row.material_id,
        'materiais',
        v_row.material_id,
        'recomendacao_compra',
        CASE WHEN v_row.risco = 'alto' THEN 'critical'::public.notification_severity_type ELSE 'warning'::public.notification_severity_type END,
        'Recomendacao de compra',
        format(
          'Material %s: %s. Cobertura atual: %s dias. Lead time: %s dias.',
          v_row.material_nome,
          v_row.recomendacao,
          COALESCE(v_row.dias_cobertura::text, 'n/a'),
          v_row.lead_time_real_dias::text
        ),
        now() + interval '1 hour',
        now() + interval '1 hour',
        now() + interval '4 hours',
        jsonb_build_object(
          'risco', v_row.risco,
          'recomendacao', v_row.recomendacao,
          'justificativa', v_row.justificativa,
          'data_pedido_ideal', v_row.data_pedido_ideal
        )
      );
      v_rec_created := v_rec_created + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'base', v_base,
    'forecast_notifications_created', v_rec_created,
    'snapshot', v_snapshot
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_material_forecast(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_snapshot_recomendacoes(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_preview_rows(public.import_entity_type, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_commit_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.executar_ciclo_notificacoes_p4(uuid) TO authenticated;






