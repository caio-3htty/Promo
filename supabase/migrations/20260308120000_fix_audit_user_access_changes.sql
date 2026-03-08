-- Fix audit function to support tables that do not have obra_id (e.g. profiles).

CREATE OR REPLACE FUNCTION public.audit_user_access_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id uuid;
  v_target_user_id uuid;
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_target_user_id := COALESCE(OLD.user_id, NULL);
    v_tenant_id := COALESCE(OLD.tenant_id, public.default_tenant_id());
    PERFORM public.write_audit_log(TG_TABLE_NAME, v_entity_id, lower(TG_OP), v_target_user_id, NULL, to_jsonb(OLD), NULL, v_tenant_id);
    RETURN OLD;
  END IF;

  v_entity_id := NEW.id;
  v_target_user_id := COALESCE(NEW.user_id, NULL);
  v_tenant_id := COALESCE(NEW.tenant_id, public.default_tenant_id());

  IF TG_TABLE_NAME = 'profiles' THEN
    IF TG_OP = 'UPDATE' AND (
      NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.user_type_id IS DISTINCT FROM OLD.user_type_id
      OR NEW.access_mode IS DISTINCT FROM OLD.access_mode
    ) THEN
      PERFORM public.write_audit_log(
        TG_TABLE_NAME,
        v_entity_id,
        'update',
        v_target_user_id,
        NULL,
        jsonb_build_object(
          'is_active', OLD.is_active,
          'user_type_id', OLD.user_type_id,
          'access_mode', OLD.access_mode
        ),
        jsonb_build_object(
          'is_active', NEW.is_active,
          'user_type_id', NEW.user_type_id,
          'access_mode', NEW.access_mode
        ),
        v_tenant_id
      );
    END IF;
  ELSE
    PERFORM public.write_audit_log(
      TG_TABLE_NAME,
      v_entity_id,
      lower(TG_OP),
      v_target_user_id,
      CASE
        WHEN TG_TABLE_NAME = 'user_obras' THEN NULLIF(to_jsonb(NEW)->>'obra_id', '')::uuid
        ELSE NULL
      END,
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      to_jsonb(NEW),
      v_tenant_id
    );
  END IF;

  RETURN NEW;
END;
$$;
