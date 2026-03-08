-- Provision owner/master access for primary account in this environment.

DO $$
DECLARE
  v_email text := 'caiofrossoni@gmail.com';
  v_user_id uuid;
  v_tenant_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_master_type_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Owner account not found in auth.users for email: %', v_email;
    RETURN;
  END IF;

  SELECT id INTO v_master_type_id
  FROM public.user_types
  WHERE tenant_id = v_tenant_id
    AND name = 'Master'
  LIMIT 1;

  IF v_master_type_id IS NULL THEN
    INSERT INTO public.user_types (tenant_id, name, description, base_role, is_active, created_by)
    VALUES (v_tenant_id, 'Master', 'Administrador master da empresa', 'master', true, v_user_id)
    RETURNING id INTO v_master_type_id;
  END IF;

  UPDATE public.profiles
  SET
    full_name = CASE WHEN coalesce(full_name, '') = '' THEN 'Caio Frossoni' ELSE full_name END,
    email = v_email,
    is_active = true,
    tenant_id = v_tenant_id,
    user_type_id = v_master_type_id,
    access_mode = 'custom',
    preferred_language = 'pt-BR'
  WHERE user_id = v_user_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (v_user_id, v_tenant_id, 'master')
  ON CONFLICT (user_id)
  DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    role = EXCLUDED.role;

  INSERT INTO owner_control.owner_accounts (user_id, is_active, created_by)
  VALUES (v_user_id, true, v_user_id)
  ON CONFLICT (user_id)
  DO UPDATE SET
    is_active = EXCLUDED.is_active,
    created_by = EXCLUDED.created_by;

  INSERT INTO public.user_obras (user_id, obra_id, tenant_id)
  SELECT v_user_id, o.id, o.tenant_id
  FROM public.obras o
  WHERE o.tenant_id = v_tenant_id
    AND o.deleted_at IS NULL
  ON CONFLICT (user_id, obra_id)
  DO UPDATE SET tenant_id = EXCLUDED.tenant_id;
END
$$;
