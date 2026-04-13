-- Obra/Home sync + master protection + transactional user type permissions management

-- Helper to detect effective master by role or assigned user_type
CREATE OR REPLACE FUNCTION public.is_user_effective_master(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.tenant_id = _tenant_id
        AND ur.role = 'master'::public.app_role
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.user_types ut ON ut.id = p.user_type_id
      WHERE p.user_id = _user_id
        AND p.tenant_id = _tenant_id
        AND ut.base_role = 'master'::public.app_role
    )
$$;

-- Keep current behavior and add master-account protection for type changes.
CREATE OR REPLACE FUNCTION public.restrict_profile_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id, public.current_tenant_id(v_actor_user_id));
BEGIN
  IF v_actor_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_owner_account(v_actor_user_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_type_id IS DISTINCT FROM OLD.user_type_id THEN
    IF public.has_role(v_actor_user_id, 'master'::public.app_role) AND v_actor_user_id = OLD.user_id THEN
      RAISE EXCEPTION 'Master nao pode alterar o proprio tipo de usuario';
    END IF;

    IF public.is_user_effective_master(OLD.user_id, v_tenant_id) THEN
      RAISE EXCEPTION 'Conta master protegida. Tipo de usuario nao pode ser alterado.';
    END IF;
  END IF;

  IF public.is_user_effective_master(OLD.user_id, v_tenant_id) THEN
    IF COALESCE(NEW.is_active, false) = false THEN
      RAISE EXCEPTION 'Conta master protegida. Nao pode ser inativada.';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Conta master protegida. Tenant nao pode ser alterado.';
    END IF;
  END IF;

  IF NOT public.user_has_permission(v_actor_user_id, v_tenant_id, 'users.manage', NULL) THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Somente gestor/master pode alterar ativacao de usuario';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Somente gestor/master pode alterar email no perfil publico';
    END IF;
    IF NEW.user_type_id IS DISTINCT FROM OLD.user_type_id THEN
      RAISE EXCEPTION 'Somente gestor/master pode alterar tipo de usuario';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Tenant do perfil nao pode ser alterado';
    END IF;
    IF NEW.access_mode IS DISTINCT FROM OLD.access_mode THEN
      RAISE EXCEPTION 'Somente gestor/master pode alterar modo de acesso';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Prevent non-owner role downgrades/removal for master accounts.
CREATE OR REPLACE FUNCTION public.restrict_master_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
BEGIN
  IF v_actor_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF public.is_owner_account(v_actor_user_id) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'master'::public.app_role THEN
      RAISE EXCEPTION 'Conta master protegida. Role master nao pode ser removida.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.role = 'master'::public.app_role THEN
    IF v_actor_user_id = OLD.user_id THEN
      RAISE EXCEPTION 'Master nao pode alterar o proprio tipo de usuario';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Conta master protegida. Role master nao pode ser alterada.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_restrict_master_role_changes ON public.user_roles;
CREATE TRIGGER tr_restrict_master_role_changes
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.restrict_master_role_changes();

-- Prevent removing all obra links from effective master accounts (unless break-glass mode).
CREATE OR REPLACE FUNCTION public.restrict_master_obra_unlink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_target_user_id uuid := COALESCE(OLD.user_id, NEW.user_id);
  v_target_tenant uuid := COALESCE(OLD.tenant_id, NEW.tenant_id);
  v_has_other_links boolean := false;
  v_bypass boolean := COALESCE(current_setting('app.master_protection_bypass', true), 'off') = 'on';
BEGIN
  IF v_bypass THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_actor_user_id IS NOT NULL AND public.is_owner_account(v_actor_user_id) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.is_user_effective_master(v_target_user_id, v_target_tenant) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.user_id = OLD.user_id
     AND NEW.tenant_id = OLD.tenant_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_obras uo
    WHERE uo.user_id = OLD.user_id
      AND uo.tenant_id = OLD.tenant_id
      AND uo.id <> OLD.id
  ) INTO v_has_other_links;

  IF NOT v_has_other_links THEN
    RAISE EXCEPTION 'Conta master protegida. Nao pode ficar sem vinculo de obra.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_restrict_master_obra_unlink ON public.user_obras;
CREATE TRIGGER tr_restrict_master_obra_unlink
BEFORE UPDATE OR DELETE ON public.user_obras
FOR EACH ROW
EXECUTE FUNCTION public.restrict_master_obra_unlink();

-- Preflight before enforcing one master per tenant.
DO $$
BEGIN
  WITH ranked_masters AS (
    SELECT
      ur.user_id,
      ur.tenant_id,
      ROW_NUMBER() OVER (
        PARTITION BY ur.tenant_id
        ORDER BY p.created_at ASC, ur.user_id ASC
      ) AS rn
    FROM public.user_roles ur
    JOIN public.profiles p
      ON p.user_id = ur.user_id
     AND p.tenant_id = ur.tenant_id
    WHERE ur.role = 'master'::public.app_role
  ),
  demoted AS (
    UPDATE public.user_roles ur
    SET role = 'gestor'::public.app_role
    FROM ranked_masters rm
    WHERE ur.user_id = rm.user_id
      AND ur.tenant_id = rm.tenant_id
      AND rm.rn > 1
    RETURNING ur.user_id, ur.tenant_id
  )
  INSERT INTO public.audit_log (
    tenant_id,
    entity_table,
    entity_id,
    action,
    changed_by,
    target_user_id,
    old_data,
    new_data
  )
  SELECT
    d.tenant_id,
    'user_roles',
    d.user_id,
    'master_uniqueness_sanitized',
    NULL,
    d.user_id,
    jsonb_build_object('role', 'master'),
    jsonb_build_object('role', 'gestor')
  FROM demoted d;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_single_master_per_tenant
ON public.user_roles (tenant_id)
WHERE role = 'master'::public.app_role;

-- Ensure obra creator is linked immediately so Home reflects it after refresh.
CREATE OR REPLACE FUNCTION public.link_creator_to_new_obra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_obras (user_id, obra_id, tenant_id)
  VALUES (auth.uid(), NEW.id, NEW.tenant_id)
  ON CONFLICT (user_id, obra_id)
  DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_link_creator_to_new_obra ON public.obras;
CREATE TRIGGER tr_link_creator_to_new_obra
AFTER INSERT ON public.obras
FOR EACH ROW
EXECUTE FUNCTION public.link_creator_to_new_obra();

-- Atomic admin upsert for user_type + selected permissions.
CREATE OR REPLACE FUNCTION public.admin_upsert_user_type_with_permissions(
  _tenant_id uuid,
  _name text,
  _description text DEFAULT NULL,
  _base_role public.app_role DEFAULT 'operacional'::public.app_role,
  _is_active boolean DEFAULT true,
  _permissions jsonb DEFAULT '[]'::jsonb,
  _id uuid DEFAULT NULL
)
RETURNS TABLE(user_type_id uuid, permission_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_name text;
  v_type_id uuid;
  v_allowed_roles public.app_role[];
  v_permission_count integer := 0;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatorio';
  END IF;

  IF NOT public.is_same_tenant(_tenant_id, v_actor_user_id) THEN
    RAISE EXCEPTION 'Tenant invalido para operacao';
  END IF;

  IF NOT public.user_has_permission(v_actor_user_id, _tenant_id, 'users.manage', NULL) THEN
    RAISE EXCEPTION 'Sem permissao para gerenciar tipos de usuario';
  END IF;

  SELECT public.actor_allowed_roles(v_actor_user_id, _tenant_id, NULL) INTO v_allowed_roles;
  IF NOT (_base_role = ANY(v_allowed_roles)) THEN
    RAISE EXCEPTION 'Papel base nao permitido para seu nivel.';
  END IF;

  v_name := BTRIM(COALESCE(_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Nome do tipo e obrigatorio';
  END IF;

  IF jsonb_typeof(COALESCE(_permissions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Permissoes invalidas';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_admin_user_type_permissions (
    permission_key text PRIMARY KEY,
    scope_type public.permission_scope_type
  ) ON COMMIT DROP;

  TRUNCATE TABLE tmp_admin_user_type_permissions;

  INSERT INTO tmp_admin_user_type_permissions (permission_key, scope_type)
  SELECT
    incoming.permission_key,
    CASE incoming.scope_type
      WHEN 'tenant' THEN 'tenant'::public.permission_scope_type
      WHEN 'all_obras' THEN 'all_obras'::public.permission_scope_type
      ELSE NULL::public.permission_scope_type
    END AS scope_type
  FROM (
    SELECT DISTINCT
      NULLIF(BTRIM(item->>'permission_key'), '') AS permission_key,
      COALESCE(NULLIF(BTRIM(item->>'scope_type'), ''), 'tenant') AS scope_type
    FROM jsonb_array_elements(COALESCE(_permissions, '[]'::jsonb)) AS item
  ) incoming
  WHERE incoming.permission_key IS NOT NULL;

  IF EXISTS (SELECT 1 FROM tmp_admin_user_type_permissions WHERE scope_type IS NULL) THEN
    RAISE EXCEPTION 'Escopo de permissao invalido. Use tenant ou all_obras.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_admin_user_type_permissions tp
    LEFT JOIN public.permission_catalog pc
      ON pc.key = tp.permission_key
     AND pc.is_active = true
    WHERE pc.key IS NULL
  ) THEN
    RAISE EXCEPTION 'Payload contem permissao invalida ou inativa.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_admin_user_type_permissions tp
    JOIN public.permission_catalog pc ON pc.key = tp.permission_key
    WHERE pc.obra_scoped = false
      AND tp.scope_type <> 'tenant'::public.permission_scope_type
  ) THEN
    RAISE EXCEPTION 'Permissoes nao vinculadas a obra devem usar escopo tenant.';
  END IF;

  SELECT COUNT(*) INTO v_permission_count FROM tmp_admin_user_type_permissions;
  IF v_permission_count = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma permissao para o tipo de usuario.';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.user_types (
      tenant_id,
      name,
      description,
      base_role,
      is_active,
      created_by
    )
    VALUES (
      _tenant_id,
      v_name,
      NULLIF(BTRIM(COALESCE(_description, '')), ''),
      _base_role,
      _is_active,
      v_actor_user_id
    )
    RETURNING id INTO v_type_id;
  ELSE
    UPDATE public.user_types
    SET
      name = v_name,
      description = NULLIF(BTRIM(COALESCE(_description, '')), ''),
      base_role = _base_role,
      is_active = _is_active
    WHERE id = _id
      AND tenant_id = _tenant_id
    RETURNING id INTO v_type_id;

    IF v_type_id IS NULL THEN
      RAISE EXCEPTION 'Tipo de usuario nao encontrado para atualizacao.';
    END IF;
  END IF;

  DELETE FROM public.user_type_permissions
  WHERE tenant_id = _tenant_id
    AND user_type_id = v_type_id;

  INSERT INTO public.user_type_permissions (
    tenant_id,
    user_type_id,
    permission_key,
    scope_type,
    is_recommended
  )
  SELECT
    _tenant_id,
    v_type_id,
    permission_key,
    scope_type,
    false
  FROM tmp_admin_user_type_permissions;

  RETURN QUERY
  SELECT v_type_id, v_permission_count;
END;
$$;

-- Revert delegated access changes with master sovereignty asymmetry.
CREATE OR REPLACE FUNCTION public.admin_revert_access_change(_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_actor_tenant uuid;
  v_actor_role public.app_role;
  v_audit record;
  v_target_role text;
  v_old_role text;
  v_old_obra_id uuid;
  v_old_user_id uuid;
  v_old_tenant_id uuid;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;

  SELECT
    al.id,
    al.tenant_id,
    al.entity_table,
    al.entity_id,
    al.action,
    al.changed_by,
    al.target_user_id,
    al.obra_id,
    al.old_data,
    al.new_data
  INTO v_audit
  FROM public.audit_log al
  WHERE al.id = _audit_id
  LIMIT 1;

  IF v_audit.id IS NULL THEN
    RAISE EXCEPTION 'Registro de auditoria nao encontrado';
  END IF;

  v_actor_tenant := public.current_tenant_id(v_actor_user_id);
  IF v_audit.tenant_id IS DISTINCT FROM v_actor_tenant THEN
    RAISE EXCEPTION 'Registro fora do tenant atual';
  END IF;

  IF NOT public.user_has_permission(v_actor_user_id, v_actor_tenant, 'users.manage', NULL) THEN
    RAISE EXCEPTION 'Sem permissao para reverter alteracao administrativa';
  END IF;

  SELECT ur.role
  INTO v_actor_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_actor_user_id
    AND ur.tenant_id = v_actor_tenant
  LIMIT 1;

  v_target_role := COALESCE(v_audit.new_data->>'role', v_audit.old_data->>'role', NULL);
  IF v_actor_role IS DISTINCT FROM 'master'::public.app_role
     AND (v_target_role = 'master' OR v_audit.action ILIKE 'master_%') THEN
    RAISE EXCEPTION 'Somente master pode reverter eventos soberanos';
  END IF;

  IF v_audit.entity_table = 'user_roles' THEN
    v_old_role := v_audit.old_data->>'role';
    IF v_audit.action = 'insert' THEN
      DELETE FROM public.user_roles
      WHERE user_id = COALESCE(v_audit.target_user_id, v_audit.entity_id)
        AND tenant_id = v_actor_tenant;
    ELSIF v_audit.action = 'delete' THEN
      IF v_old_role IS NULL THEN
        RAISE EXCEPTION 'Sem snapshot de role para reverter';
      END IF;
      INSERT INTO public.user_roles (user_id, tenant_id, role)
      VALUES (
        COALESCE(v_audit.target_user_id, v_audit.entity_id),
        v_actor_tenant,
        v_old_role::public.app_role
      )
      ON CONFLICT (user_id)
      DO UPDATE SET role = EXCLUDED.role, tenant_id = EXCLUDED.tenant_id;
    ELSE
      IF v_old_role IS NULL THEN
        RAISE EXCEPTION 'Sem snapshot de role para reverter';
      END IF;
      UPDATE public.user_roles
      SET role = v_old_role::public.app_role
      WHERE user_id = COALESCE(v_audit.target_user_id, v_audit.entity_id)
        AND tenant_id = v_actor_tenant;
    END IF;
  ELSIF v_audit.entity_table = 'user_obras' THEN
    v_old_obra_id := COALESCE((v_audit.old_data->>'obra_id')::uuid, v_audit.obra_id);
    v_old_user_id := COALESCE((v_audit.old_data->>'user_id')::uuid, v_audit.target_user_id);
    v_old_tenant_id := COALESCE((v_audit.old_data->>'tenant_id')::uuid, v_actor_tenant);

    IF v_old_obra_id IS NULL OR v_old_user_id IS NULL THEN
      RAISE EXCEPTION 'Snapshot insuficiente para reverter vinculo de obra';
    END IF;

    IF v_audit.action = 'insert' THEN
      DELETE FROM public.user_obras
      WHERE user_id = COALESCE((v_audit.new_data->>'user_id')::uuid, v_old_user_id)
        AND obra_id = COALESCE((v_audit.new_data->>'obra_id')::uuid, v_old_obra_id)
        AND tenant_id = COALESCE((v_audit.new_data->>'tenant_id')::uuid, v_old_tenant_id);
    ELSE
      INSERT INTO public.user_obras (user_id, obra_id, tenant_id)
      VALUES (v_old_user_id, v_old_obra_id, v_old_tenant_id)
      ON CONFLICT (user_id, obra_id)
      DO UPDATE SET tenant_id = EXCLUDED.tenant_id;
    END IF;
  ELSIF v_audit.entity_table = 'profiles' THEN
    UPDATE public.profiles
    SET
      is_active = COALESCE((v_audit.old_data->>'is_active')::boolean, is_active),
      user_type_id = COALESCE((v_audit.old_data->>'user_type_id')::uuid, user_type_id),
      access_mode = COALESCE(v_audit.old_data->>'access_mode', access_mode)
    WHERE user_id = COALESCE(v_audit.target_user_id, v_audit.entity_id)
      AND tenant_id = v_actor_tenant;
  ELSE
    RAISE EXCEPTION 'Entidade nao suportada para reversao: %', v_audit.entity_table;
  END IF;

  PERFORM public.write_audit_log(
    v_audit.entity_table,
    v_audit.entity_id,
    'admin_revert_access_change',
    v_audit.target_user_id,
    v_audit.obra_id,
    v_audit.new_data,
    v_audit.old_data,
    v_actor_tenant
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reverted_audit_id', v_audit.id,
    'entity_table', v_audit.entity_table,
    'action', v_audit.action
  );
END;
$$;

-- Break-glass master recovery (owner only).
CREATE OR REPLACE FUNCTION public.admin_master_recovery(_target_user_id uuid, _tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_master_type_id uuid;
  v_linked_obras integer := 0;
BEGIN
  IF v_actor_user_id IS NULL OR NOT public.is_owner_account(v_actor_user_id) THEN
    RAISE EXCEPTION 'Sem permissao de break-glass';
  END IF;

  IF _target_user_id IS NULL OR _tenant_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id e tenant_id obrigatorios';
  END IF;

  PERFORM set_config('app.master_protection_bypass', 'on', true);

  SELECT ut.id
  INTO v_master_type_id
  FROM public.user_types ut
  WHERE ut.tenant_id = _tenant_id
    AND ut.base_role = 'master'::public.app_role
    AND ut.is_active = true
  ORDER BY ut.created_at ASC
  LIMIT 1;

  UPDATE public.profiles
  SET
    tenant_id = _tenant_id,
    is_active = true,
    user_type_id = COALESCE(v_master_type_id, user_type_id),
    updated_at = now()
  WHERE user_id = _target_user_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_target_user_id, _tenant_id, 'master'::public.app_role)
  ON CONFLICT (user_id)
  DO UPDATE SET role = EXCLUDED.role, tenant_id = EXCLUDED.tenant_id;

  INSERT INTO public.user_obras (user_id, obra_id, tenant_id)
  SELECT _target_user_id, o.id, _tenant_id
  FROM public.obras o
  WHERE o.tenant_id = _tenant_id
  ON CONFLICT (user_id, obra_id)
  DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  GET DIAGNOSTICS v_linked_obras = ROW_COUNT;

  INSERT INTO public.audit_log (
    tenant_id,
    entity_table,
    entity_id,
    action,
    changed_by,
    target_user_id,
    old_data,
    new_data
  ) VALUES (
    _tenant_id,
    'profiles',
    _target_user_id,
    'master_recovery_hotfix',
    v_actor_user_id,
    _target_user_id,
    NULL,
    jsonb_build_object(
      'role', 'master',
      'is_active', true,
      'linked_obras', v_linked_obras
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'target_user_id', _target_user_id,
    'tenant_id', _tenant_id,
    'linked_obras', v_linked_obras
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_user_type_with_permissions(uuid, text, text, public.app_role, boolean, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revert_access_change(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_master_recovery(uuid, uuid) TO authenticated;
