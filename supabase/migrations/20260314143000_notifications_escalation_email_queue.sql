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

  FOR v_row IN
    SELECT em.obra_id, em.material_id, m.nome AS material_nome
    FROM public.estoque_obra_material em
    JOIN public.materiais m ON m.id = em.material_id
    WHERE em.tenant_id = v_tenant_id
      AND em.atualizado_em <= now() - interval '24 hours'
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

CREATE OR REPLACE FUNCTION public.pending_critical_notification_emails(
  _tenant_id uuid DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS TABLE (
  notificacao_id uuid,
  obra_id uuid,
  pedido_id uuid,
  engineer_user_id uuid,
  engineer_email text,
  titulo text,
  mensagem text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := COALESCE(_tenant_id, public.current_tenant_id(auth.uid()), public.default_tenant_id());

  IF auth.uid() IS NOT NULL
     AND NOT public.user_has_permission(auth.uid(), v_tenant_id, 'notifications.manage', NULL) THEN
    RAISE EXCEPTION 'Sem permissao para listar e-mails criticos';
  END IF;

  RETURN QUERY
  WITH pending AS (
    SELECT n.id, n.obra_id, n.pedido_id, n.titulo, n.mensagem, n.email_critico_em
    FROM public.notificacoes n
    WHERE n.tenant_id = v_tenant_id
      AND n.status = 'escalada'
      AND n.ack_em IS NULL
      AND n.encerrada_em IS NULL
      AND n.email_critico_em IS NOT NULL
      AND n.email_critico_em <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.notificacao_entregas ne
        WHERE ne.notificacao_id = n.id
          AND ne.canal = 'email'
          AND ne.status = 'sent'
      )
    ORDER BY n.email_critico_em ASC
    LIMIT GREATEST(COALESCE(_limit, 50), 1)
  )
  SELECT
    p.id AS notificacao_id,
    p.obra_id,
    p.pedido_id,
    pr.user_id AS engineer_user_id,
    pr.email AS engineer_email,
    p.titulo,
    p.mensagem
  FROM pending p
  JOIN public.user_roles ur
    ON ur.tenant_id = v_tenant_id
   AND ur.role = 'engenheiro'
  JOIN public.profiles pr
    ON pr.user_id = ur.user_id
   AND pr.tenant_id = v_tenant_id
   AND pr.is_active = true
   AND pr.email IS NOT NULL
  WHERE p.obra_id IS NULL
     OR EXISTS (
       SELECT 1
       FROM public.user_obras uo
       WHERE uo.tenant_id = v_tenant_id
         AND uo.user_id = ur.user_id
         AND uo.obra_id = p.obra_id
     )
  ORDER BY p.email_critico_em ASC, pr.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.executar_ciclo_notificacoes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pending_critical_notification_emails(uuid, integer) TO authenticated;
