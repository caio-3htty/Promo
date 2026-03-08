-- Allow trusted DB operations (migrations/seed/service context) when auth.uid() is null.

CREATE OR REPLACE FUNCTION public.enforce_pedidos_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_obra_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_user_active(auth.uid()) THEN
    RAISE EXCEPTION 'Usuario inativo';
  END IF;

  IF public.has_role(auth.uid(), 'gestor'::public.app_role) THEN
    RETURN NEW;
  END IF;

  SELECT role
  INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario sem papel';
  END IF;

  v_obra_id := COALESCE(NEW.obra_id, OLD.obra_id);
  IF NOT public.user_belongs_to_obra(auth.uid(), v_obra_id) THEN
    RAISE EXCEPTION 'Usuario sem vinculo com a obra';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_role <> 'operacional' THEN
      RAISE EXCEPTION 'Somente operacional pode criar pedido';
    END IF;
    NEW.status := 'pendente';
    NEW.data_recebimento := NULL;
    NEW.recebido_por := NULL;
    RETURN NEW;
  END IF;

  IF v_role = 'operacional' THEN
    IF OLD.status IN ('cancelado', 'entregue') THEN
      RAISE EXCEPTION 'Operacional nao pode alterar pedido cancelado/entregue';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'Operacional nao pode aprovar/cancelar/entregar pedido';
    END IF;
    IF NEW.data_recebimento IS DISTINCT FROM OLD.data_recebimento
      OR NEW.recebido_por IS DISTINCT FROM OLD.recebido_por THEN
      RAISE EXCEPTION 'Operacional nao pode registrar recebimento';
    END IF;
    RETURN NEW;
  END IF;

  IF v_role = 'engenheiro' THEN
    IF NEW.obra_id IS DISTINCT FROM OLD.obra_id
      OR NEW.material_id IS DISTINCT FROM OLD.material_id
      OR NEW.fornecedor_id IS DISTINCT FROM OLD.fornecedor_id
      OR NEW.quantidade IS DISTINCT FROM OLD.quantidade
      OR NEW.preco_unit IS DISTINCT FROM OLD.preco_unit
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.data_recebimento IS DISTINCT FROM OLD.data_recebimento
      OR NEW.recebido_por IS DISTINCT FROM OLD.recebido_por
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Engenheiro so pode alterar status e codigo do pedido';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
      AND NEW.status NOT IN ('aprovado', 'cancelado') THEN
      RAISE EXCEPTION 'Status invalido para engenheiro';
    END IF;
    RETURN NEW;
  END IF;

  IF v_role = 'almoxarife' THEN
    IF NEW.obra_id IS DISTINCT FROM OLD.obra_id
      OR NEW.material_id IS DISTINCT FROM OLD.material_id
      OR NEW.fornecedor_id IS DISTINCT FROM OLD.fornecedor_id
      OR NEW.quantidade IS DISTINCT FROM OLD.quantidade
      OR NEW.preco_unit IS DISTINCT FROM OLD.preco_unit
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Almoxarife so pode registrar recebimento/codigo';
    END IF;

    IF NEW.status <> 'entregue' THEN
      RAISE EXCEPTION 'Almoxarife deve marcar pedido como entregue';
    END IF;

    NEW.data_recebimento := COALESCE(NEW.data_recebimento, now());
    NEW.recebido_por := COALESCE(NEW.recebido_por, auth.uid());
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Papel sem permissao de alteracao de pedido';
END;
$$;

CREATE OR REPLACE FUNCTION public.restrict_profile_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.user_has_permission(auth.uid(), OLD.tenant_id, 'users.manage', NULL) THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Somente gestor/master pode alterar ativacao de usuario';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Somente gestor/master pode alterar email no perfil publico';
    END IF;
    IF NEW.user_type_id IS DISTINCT FROM OLD.user_type_id THEN
      RAISE EXCEPTION 'Somente gestor/master pode alterar tipo de usuario';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
