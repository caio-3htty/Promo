-- Governanca de onboarding: hierarquia de aprovacao/provisionamento e gestor por permissao

ALTER TABLE public.access_signup_requests
  ADD COLUMN IF NOT EXISTS requested_obra_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.user_has_permission(
  _user_id uuid,
  _tenant_id uuid,
  _permission_key text,
  _obra_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      public.is_same_tenant(_tenant_id, _user_id)
      AND public.is_user_active(_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _user_id
          AND ur.tenant_id = _tenant_id
          AND ur.role = 'master'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_permission_grants g
      JOIN public.profiles p ON p.user_id = g.user_id
      WHERE g.user_id = _user_id
        AND g.tenant_id = _tenant_id
        AND p.tenant_id = _tenant_id
        AND p.is_active = true
        AND g.permission_key = _permission_key
        AND (
          (
            g.scope_type IN ('tenant', 'all_obras')
            AND (
              _obra_id IS NULL
              OR public.user_belongs_to_obra(_user_id, _obra_id)
            )
          )
          OR (
            g.scope_type = 'selected_obras'
            AND _obra_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.user_permission_obras go
              WHERE go.grant_id = g.id
                AND go.obra_id = _obra_id
            )
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.user_types ut ON ut.id = p.user_type_id
      JOIN public.user_type_permissions utp
        ON utp.user_type_id = ut.id
       AND utp.tenant_id = ut.tenant_id
      WHERE p.user_id = _user_id
        AND p.tenant_id = _tenant_id
        AND p.is_active = true
        AND ut.tenant_id = _tenant_id
        AND utp.permission_key = _permission_key
        AND (
          (
            utp.scope_type IN ('tenant', 'all_obras')
            AND (
              _obra_id IS NULL
              OR public.user_belongs_to_obra(_user_id, _obra_id)
            )
          )
          OR (
            utp.scope_type = 'selected_obras'
            AND _obra_id IS NOT NULL
            AND public.user_belongs_to_obra(_user_id, _obra_id)
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.actor_allowed_roles(
  _actor_user_id uuid,
  _tenant_id uuid,
  _obra_ids uuid[] DEFAULT NULL
)
RETURNS public.app_role[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role public.app_role;
  v_has_users_manage boolean := false;
  v_has_out_of_scope_obra boolean := false;
BEGIN
  SELECT ur.role
  INTO v_actor_role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id AND p.tenant_id = ur.tenant_id
  WHERE ur.user_id = _actor_user_id
    AND ur.tenant_id = _tenant_id
    AND p.is_active = true
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RETURN ARRAY[]::public.app_role[];
  END IF;

  SELECT public.user_has_permission(_actor_user_id, _tenant_id, 'users.manage', NULL)
  INTO v_has_users_manage;

  IF v_actor_role = 'master' THEN
    RETURN ARRAY['master','gestor','engenheiro','operacional','almoxarife']::public.app_role[];
  END IF;

  IF NOT v_has_users_manage THEN
    RETURN ARRAY[]::public.app_role[];
  END IF;

  IF v_actor_role = 'gestor' THEN
    RETURN ARRAY['gestor','engenheiro','operacional','almoxarife']::public.app_role[];
  END IF;

  IF v_actor_role = 'engenheiro' THEN
    IF _obra_ids IS NULL OR COALESCE(cardinality(_obra_ids), 0) = 0 THEN
      RETURN ARRAY[]::public.app_role[];
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM unnest(_obra_ids) AS req_obra_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.user_obras uo
        WHERE uo.obra_id = req_obra_id
          AND uo.user_id = _actor_user_id
          AND uo.tenant_id = _tenant_id
      )
    )
    INTO v_has_out_of_scope_obra;

    IF NOT v_has_out_of_scope_obra THEN
      RETURN ARRAY['operacional','almoxarife']::public.app_role[];
    END IF;
  END IF;

  RETURN ARRAY[]::public.app_role[];
END;
$$;

CREATE OR REPLACE FUNCTION public.can_assign_role(
  _actor_user_id uuid,
  _tenant_id uuid,
  _target_role public.app_role,
  _obra_ids uuid[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _target_role = ANY(public.actor_allowed_roles(_actor_user_id, _tenant_id, _obra_ids))
$$;

GRANT EXECUTE ON FUNCTION public.actor_allowed_roles(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_assign_role(uuid, uuid, public.app_role, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, uuid, text, uuid) TO authenticated;
