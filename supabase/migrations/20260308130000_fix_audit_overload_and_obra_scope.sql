-- Fix overloaded audit function ambiguity and enforce obra linkage on obra-scoped permissions.

DROP FUNCTION IF EXISTS public.write_audit_log(text, uuid, text, uuid, uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.write_audit_log(
  _entity_table text,
  _entity_id uuid,
  _action text,
  _target_user_id uuid,
  _obra_id uuid,
  _old_data jsonb,
  _new_data jsonb,
  _tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (
    tenant_id,
    entity_table,
    entity_id,
    action,
    changed_by,
    target_user_id,
    obra_id,
    old_data,
    new_data
  )
  VALUES (
    COALESCE(_tenant_id, public.current_tenant_id(auth.uid()), public.default_tenant_id()),
    _entity_table,
    _entity_id,
    _action,
    auth.uid(),
    _target_user_id,
    _obra_id,
    _old_data,
    _new_data
  );
END;
$$;

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
          AND ur.role IN ('master', 'gestor')
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
