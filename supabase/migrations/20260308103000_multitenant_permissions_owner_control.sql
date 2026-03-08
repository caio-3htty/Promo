
-- Multi-tenant + granular permissions + owner control (Prumo)

CREATE SCHEMA IF NOT EXISTS owner_control;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (id, name, slug, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Tenant Padrão',
  'default',
  true
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  is_active = EXCLUDED.is_active;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'permission_scope_type'
  ) THEN
    CREATE TYPE public.permission_scope_type AS ENUM ('tenant', 'all_obras', 'selected_obras');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_language'
  ) THEN
    CREATE TYPE public.app_language AS ENUM ('pt-BR', 'en', 'es');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS preferred_language public.app_language NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'template';

ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.user_obras ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.material_fornecedor ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.pedidos_compra ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.estoque_obra_material ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.user_types ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.profiles
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.obras
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.user_roles ur
SET tenant_id = p.tenant_id
FROM public.profiles p
WHERE p.user_id = ur.user_id
  AND ur.tenant_id IS NULL;

UPDATE public.user_roles
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.user_obras uo
SET tenant_id = o.tenant_id
FROM public.obras o
WHERE o.id = uo.obra_id
  AND uo.tenant_id IS NULL;

UPDATE public.user_obras
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.fornecedores
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.materiais
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.material_fornecedor mf
SET tenant_id = m.tenant_id
FROM public.materiais m
WHERE m.id = mf.material_id
  AND mf.tenant_id IS NULL;

UPDATE public.material_fornecedor
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.pedidos_compra pc
SET tenant_id = o.tenant_id
FROM public.obras o
WHERE o.id = pc.obra_id
  AND pc.tenant_id IS NULL;

UPDATE public.pedidos_compra
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.estoque_obra_material em
SET tenant_id = o.tenant_id
FROM public.obras o
WHERE o.id = em.obra_id
  AND em.tenant_id IS NULL;

UPDATE public.estoque_obra_material
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.user_types
SET tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE tenant_id IS NULL;

UPDATE public.audit_log a
SET tenant_id = COALESCE(
  (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = a.target_user_id LIMIT 1),
  (SELECT o.tenant_id FROM public.obras o WHERE o.id = a.obra_id LIMIT 1),
  '11111111-1111-1111-1111-111111111111'::uuid
)
WHERE a.tenant_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.obras ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.user_obras ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.fornecedores ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.materiais ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.material_fornecedor ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.pedidos_compra ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.estoque_obra_material ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.audit_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.user_types ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_tenant_id_fkey') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'obras_tenant_id_fkey') THEN
    ALTER TABLE public.obras ADD CONSTRAINT obras_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_tenant_id_fkey') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_obras_tenant_id_fkey') THEN
    ALTER TABLE public.user_obras ADD CONSTRAINT user_obras_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fornecedores_tenant_id_fkey') THEN
    ALTER TABLE public.fornecedores ADD CONSTRAINT fornecedores_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materiais_tenant_id_fkey') THEN
    ALTER TABLE public.materiais ADD CONSTRAINT materiais_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_fornecedor_tenant_id_fkey') THEN
    ALTER TABLE public.material_fornecedor ADD CONSTRAINT material_fornecedor_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_compra_tenant_id_fkey') THEN
    ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estoque_obra_material_tenant_id_fkey') THEN
    ALTER TABLE public.estoque_obra_material ADD CONSTRAINT estoque_obra_material_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_tenant_id_fkey') THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_types_tenant_id_fkey') THEN
    ALTER TABLE public.user_types ADD CONSTRAINT user_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_obras_tenant_id ON public.obras (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_id ON public.user_roles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_obras_tenant_id ON public.user_obras (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_tenant_id ON public.fornecedores (tenant_id);
CREATE INDEX IF NOT EXISTS idx_materiais_tenant_id ON public.materiais (tenant_id);
CREATE INDEX IF NOT EXISTS idx_material_fornecedor_tenant_id ON public.material_fornecedor (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_tenant_id ON public.pedidos_compra (tenant_id);
CREATE INDEX IF NOT EXISTS idx_estoque_obra_material_tenant_id ON public.estoque_obra_material (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON public.audit_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_types_tenant_id ON public.user_types (tenant_id);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_access_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_mode_check CHECK (access_mode IN ('template', 'custom'));

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  multi_obra_enabled boolean NOT NULL DEFAULT false,
  default_obra_id uuid REFERENCES public.obras(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenant_settings (tenant_id, multi_obra_enabled)
SELECT t.id, false
FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS owner_control.owner_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.permission_catalog (
  key text PRIMARY KEY,
  area text NOT NULL,
  label_pt text NOT NULL,
  label_en text NOT NULL,
  label_es text NOT NULL,
  obra_scoped boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_type_permissions (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_type_id uuid NOT NULL REFERENCES public.user_types(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permission_catalog(key) ON DELETE CASCADE,
  scope_type public.permission_scope_type NOT NULL DEFAULT 'tenant',
  is_recommended boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_type_id, permission_key),
  CHECK (scope_type <> 'selected_obras')
);

CREATE TABLE IF NOT EXISTS public.user_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permission_catalog(key) ON DELETE CASCADE,
  scope_type public.permission_scope_type NOT NULL DEFAULT 'tenant',
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, permission_key, scope_type)
);

CREATE TABLE IF NOT EXISTS public.user_permission_obras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.user_permission_grants(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grant_id, obra_id)
);

CREATE TABLE IF NOT EXISTS owner_control.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_control.tenant_template_versions (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  active_template_version_id uuid NOT NULL REFERENCES owner_control.template_versions(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.default_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.tenants
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1),
    public.default_tenant_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_owner_account(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, owner_control
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM owner_control.owner_accounts oa
    WHERE oa.user_id = _user_id
      AND oa.is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_same_tenant(_tenant_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.tenant_id = _tenant_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND ur.tenant_id = public.current_tenant_id(_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = ANY(_roles)
      AND ur.tenant_id = public.current_tenant_id(_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.tenant_id = public.current_tenant_id(_user_id)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_obra(_user_id uuid, _obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_obras uo
    JOIN public.obras o ON o.id = uo.obra_id
    WHERE uo.user_id = _user_id
      AND uo.obra_id = _obra_id
      AND uo.tenant_id = o.tenant_id
      AND uo.tenant_id = public.current_tenant_id(_user_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.obras o ON o.id = _obra_id
    WHERE ur.user_id = _user_id
      AND ur.tenant_id = o.tenant_id
      AND ur.role IN ('master', 'gestor')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.is_active = true
      AND p.tenant_id = public.current_tenant_id(_user_id)
  )
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

CREATE OR REPLACE FUNCTION public.has_work_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_user_active(_user_id)
    AND (
      public.has_any_role(_user_id, ARRAY['master', 'gestor']::public.app_role[])
      OR EXISTS (
        SELECT 1
        FROM public.user_obras uo
        WHERE uo.user_id = _user_id
          AND uo.tenant_id = public.current_tenant_id(_user_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_permission_grants g
        WHERE g.user_id = _user_id
          AND g.tenant_id = public.current_tenant_id(_user_id)
      )
    )
$$;

ALTER TABLE public.obras ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.user_roles ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.user_obras ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.fornecedores ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.materiais ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.material_fornecedor ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.pedidos_compra ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.estoque_obra_material ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.audit_log ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());
ALTER TABLE public.user_types ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, is_active, tenant_id, preferred_language, access_mode)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    false,
    public.default_tenant_id(),
    'pt-BR',
    'template'
  );
  RETURN NEW;
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
    RAISE EXCEPTION 'Usuario nao autenticado';
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

CREATE OR REPLACE FUNCTION public.sync_role_from_user_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF NEW.user_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT base_role
  INTO v_role
  FROM public.user_types
  WHERE id = NEW.user_type_id
    AND tenant_id = NEW.tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Tipo de usuario invalido ou inativo';
  END IF;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.user_id, NEW.tenant_id, v_role)
  ON CONFLICT (user_id)
  DO UPDATE SET role = EXCLUDED.role, tenant_id = EXCLUDED.tenant_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_on_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.profiles
    WHERE user_id = NEW.user_id
    LIMIT 1;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatorio em user_roles';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_on_user_obras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_obra_tenant
  FROM public.obras
  WHERE id = NEW.obra_id
  LIMIT 1;

  IF v_obra_tenant IS NULL THEN
    RAISE EXCEPTION 'Obra invalida para vinculo';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_obra_tenant);

  IF NEW.tenant_id <> v_obra_tenant THEN
    RAISE EXCEPTION 'Tenant do vinculo deve ser igual ao tenant da obra';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_on_obra_scoped_tables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_obra_tenant
  FROM public.obras
  WHERE id = NEW.obra_id
  LIMIT 1;

  IF v_obra_tenant IS NULL THEN
    RAISE EXCEPTION 'Obra invalida';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_obra_tenant);

  IF NEW.tenant_id <> v_obra_tenant THEN
    RAISE EXCEPTION 'Tenant inconsistente com a obra';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_on_material_fornecedor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material_tenant uuid;
  v_fornecedor_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_material_tenant FROM public.materiais WHERE id = NEW.material_id LIMIT 1;
  SELECT tenant_id INTO v_fornecedor_tenant FROM public.fornecedores WHERE id = NEW.fornecedor_id LIMIT 1;

  IF v_material_tenant IS NULL OR v_fornecedor_tenant IS NULL THEN
    RAISE EXCEPTION 'Material ou fornecedor invalido';
  END IF;

  IF v_material_tenant <> v_fornecedor_tenant THEN
    RAISE EXCEPTION 'Material e fornecedor precisam estar no mesmo tenant';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_material_tenant);

  IF NEW.tenant_id <> v_material_tenant THEN
    RAISE EXCEPTION 'Tenant inconsistente no vinculo material fornecedor';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_tenant_user_roles ON public.user_roles;
CREATE TRIGGER tr_enforce_tenant_user_roles
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_tenant_on_user_roles();

DROP TRIGGER IF EXISTS tr_enforce_tenant_user_obras ON public.user_obras;
CREATE TRIGGER tr_enforce_tenant_user_obras
BEFORE INSERT OR UPDATE ON public.user_obras
FOR EACH ROW
EXECUTE FUNCTION public.enforce_tenant_on_user_obras();

DROP TRIGGER IF EXISTS tr_enforce_tenant_pedidos ON public.pedidos_compra;
CREATE TRIGGER tr_enforce_tenant_pedidos
BEFORE INSERT OR UPDATE ON public.pedidos_compra
FOR EACH ROW
EXECUTE FUNCTION public.enforce_tenant_on_obra_scoped_tables();

DROP TRIGGER IF EXISTS tr_enforce_tenant_estoque ON public.estoque_obra_material;
CREATE TRIGGER tr_enforce_tenant_estoque
BEFORE INSERT OR UPDATE ON public.estoque_obra_material
FOR EACH ROW
EXECUTE FUNCTION public.enforce_tenant_on_obra_scoped_tables();

DROP TRIGGER IF EXISTS tr_enforce_tenant_material_fornecedor ON public.material_fornecedor;
CREATE TRIGGER tr_enforce_tenant_material_fornecedor
BEFORE INSERT OR UPDATE ON public.material_fornecedor
FOR EACH ROW
EXECUTE FUNCTION public.enforce_tenant_on_material_fornecedor();
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Gestores can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Gestores can update all profiles" ON public.profiles;

CREATE POLICY "Profiles select by tenant permission"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Profiles update own or manage"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() = user_id
  OR (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
  )
);

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can delete roles" ON public.user_roles;

CREATE POLICY "Roles select"
ON public.user_roles
FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Roles manage"
ON public.user_roles
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
);

DROP POLICY IF EXISTS "Users can view own assignments" ON public.user_obras;
DROP POLICY IF EXISTS "Gestores can view all assignments" ON public.user_obras;
DROP POLICY IF EXISTS "Gestores can insert assignments" ON public.user_obras;
DROP POLICY IF EXISTS "Gestores can update assignments" ON public.user_obras;
DROP POLICY IF EXISTS "Gestores can delete assignments" ON public.user_obras;

CREATE POLICY "Assignments select"
ON public.user_obras
FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Assignments manage"
ON public.user_obras
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
);

DROP POLICY IF EXISTS "Gestores can view all obras" ON public.obras;
DROP POLICY IF EXISTS "Users can view assigned obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores can insert obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores can update obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores can delete obras" ON public.obras;

CREATE POLICY "Obras select by permission"
ON public.obras
FOR SELECT
USING (
  (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'obras.view', id)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Obras manage"
ON public.obras
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'obras.manage', id)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'obras.manage', id)
);

DROP POLICY IF EXISTS "Work users can view fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Gestor e operacional manage fornecedores" ON public.fornecedores;

CREATE POLICY "Fornecedores select"
ON public.fornecedores
FOR SELECT
USING (
  (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'fornecedores.view', NULL)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Fornecedores manage"
ON public.fornecedores
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'fornecedores.manage', NULL)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'fornecedores.manage', NULL)
);

DROP POLICY IF EXISTS "Work users can view materiais" ON public.materiais;
DROP POLICY IF EXISTS "Gestor e operacional manage materiais" ON public.materiais;

CREATE POLICY "Materiais select"
ON public.materiais
FOR SELECT
USING (
  (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'materiais.view', NULL)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Materiais manage"
ON public.materiais
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'materiais.manage', NULL)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'materiais.manage', NULL)
);

DROP POLICY IF EXISTS "Work users can view material_fornecedor" ON public.material_fornecedor;
DROP POLICY IF EXISTS "Gestor e operacional manage material_fornecedor" ON public.material_fornecedor;

CREATE POLICY "Material fornecedor select"
ON public.material_fornecedor
FOR SELECT
USING (
  (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'material_fornecedor.view', NULL)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Material fornecedor manage"
ON public.material_fornecedor
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'material_fornecedor.manage', NULL)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'material_fornecedor.manage', NULL)
);
DROP POLICY IF EXISTS "Users can view pedidos da obra" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Gestor e operacional insert pedidos" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Roles allowed update pedidos" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Gestores can delete pedidos" ON public.pedidos_compra;

CREATE POLICY "Pedidos select"
ON public.pedidos_compra
FOR SELECT
USING (
  (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'pedidos.view', obra_id)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Pedidos insert"
ON public.pedidos_compra
FOR INSERT
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'pedidos.create', obra_id)
);

CREATE POLICY "Pedidos update"
ON public.pedidos_compra
FOR UPDATE
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND (
    public.user_has_permission(auth.uid(), tenant_id, 'pedidos.edit_base', obra_id)
    OR public.user_has_permission(auth.uid(), tenant_id, 'pedidos.approve', obra_id)
    OR public.user_has_permission(auth.uid(), tenant_id, 'pedidos.receive', obra_id)
  )
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND (
    public.user_has_permission(auth.uid(), tenant_id, 'pedidos.edit_base', obra_id)
    OR public.user_has_permission(auth.uid(), tenant_id, 'pedidos.approve', obra_id)
    OR public.user_has_permission(auth.uid(), tenant_id, 'pedidos.receive', obra_id)
  )
);

CREATE POLICY "Pedidos delete"
ON public.pedidos_compra
FOR DELETE
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'pedidos.delete', obra_id)
);

DROP POLICY IF EXISTS "Users can view estoque da obra" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Gestor e almoxarife insert estoque" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Gestor e almoxarife update estoque" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Gestores can delete estoque" ON public.estoque_obra_material;

CREATE POLICY "Estoque select"
ON public.estoque_obra_material
FOR SELECT
USING (
  (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'estoque.view', obra_id)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Estoque manage"
ON public.estoque_obra_material
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'estoque.manage', obra_id)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'estoque.manage', obra_id)
);

DROP POLICY IF EXISTS "Work users can view user types" ON public.user_types;
DROP POLICY IF EXISTS "Admins can manage user types" ON public.user_types;

CREATE POLICY "User types select"
ON public.user_types
FOR SELECT
USING (
  (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "User types manage"
ON public.user_types
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
);

ALTER TABLE public.user_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_control.owner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_control.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_control.tenant_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permission catalog select" ON public.permission_catalog;
CREATE POLICY "Permission catalog select"
ON public.permission_catalog
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permission catalog manage owner" ON public.permission_catalog;
CREATE POLICY "Permission catalog manage owner"
ON public.permission_catalog
FOR ALL
USING (public.is_owner_account(auth.uid()))
WITH CHECK (public.is_owner_account(auth.uid()));

DROP POLICY IF EXISTS "Permission grants select" ON public.user_permission_grants;
CREATE POLICY "Permission grants select"
ON public.user_permission_grants
FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
  )
  OR public.is_owner_account(auth.uid())
);

DROP POLICY IF EXISTS "Permission grants manage" ON public.user_permission_grants;
CREATE POLICY "Permission grants manage"
ON public.user_permission_grants
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
);

DROP POLICY IF EXISTS "Permission grant obras select" ON public.user_permission_obras;
CREATE POLICY "Permission grant obras select"
ON public.user_permission_obras
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_permission_grants g
    WHERE g.id = user_permission_obras.grant_id
      AND (
        g.user_id = auth.uid()
        OR (
          public.is_same_tenant(g.tenant_id, auth.uid())
          AND public.user_has_permission(auth.uid(), g.tenant_id, 'users.manage', NULL)
        )
        OR public.is_owner_account(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "Permission grant obras manage" ON public.user_permission_obras;
CREATE POLICY "Permission grant obras manage"
ON public.user_permission_obras
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.user_permission_grants g
    WHERE g.id = user_permission_obras.grant_id
      AND public.is_same_tenant(g.tenant_id, auth.uid())
      AND public.user_has_permission(auth.uid(), g.tenant_id, 'users.manage', NULL)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permission_grants g
    WHERE g.id = user_permission_obras.grant_id
      AND public.is_same_tenant(g.tenant_id, auth.uid())
      AND public.user_has_permission(auth.uid(), g.tenant_id, 'users.manage', NULL)
  )
);
DROP POLICY IF EXISTS "Tenant settings select" ON public.tenant_settings;
CREATE POLICY "Tenant settings select"
ON public.tenant_settings
FOR SELECT
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  OR public.is_owner_account(auth.uid())
);

DROP POLICY IF EXISTS "Tenant settings manage" ON public.tenant_settings;
CREATE POLICY "Tenant settings manage"
ON public.tenant_settings
FOR ALL
USING (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
)
WITH CHECK (
  public.is_same_tenant(tenant_id, auth.uid())
  AND public.user_has_permission(auth.uid(), tenant_id, 'users.manage', NULL)
);

DROP POLICY IF EXISTS "Tenants select" ON public.tenants;
CREATE POLICY "Tenants select"
ON public.tenants
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.tenant_id = tenants.id
  )
  OR public.is_owner_account(auth.uid())
);

DROP POLICY IF EXISTS "Tenants manage owner" ON public.tenants;
CREATE POLICY "Tenants manage owner"
ON public.tenants
FOR ALL
USING (public.is_owner_account(auth.uid()))
WITH CHECK (public.is_owner_account(auth.uid()));

DROP POLICY IF EXISTS "Audit log select" ON public.audit_log;
DROP POLICY IF EXISTS "Gestores can view audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Gestores can insert audit logs" ON public.audit_log;

CREATE POLICY "Audit log select"
ON public.audit_log
FOR SELECT
USING (
  (
    public.is_same_tenant(tenant_id, auth.uid())
    AND public.user_has_permission(auth.uid(), tenant_id, 'audit.view', obra_id)
  )
  OR public.is_owner_account(auth.uid())
);

CREATE POLICY "Audit log insert"
ON public.audit_log
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Owner accounts select owner" ON owner_control.owner_accounts;
CREATE POLICY "Owner accounts select owner"
ON owner_control.owner_accounts
FOR SELECT
USING (public.is_owner_account(auth.uid()));

DROP POLICY IF EXISTS "Owner accounts manage owner" ON owner_control.owner_accounts;
CREATE POLICY "Owner accounts manage owner"
ON owner_control.owner_accounts
FOR ALL
USING (public.is_owner_account(auth.uid()))
WITH CHECK (public.is_owner_account(auth.uid()));

DROP POLICY IF EXISTS "Template versions select owner" ON owner_control.template_versions;
CREATE POLICY "Template versions select owner"
ON owner_control.template_versions
FOR SELECT
USING (public.is_owner_account(auth.uid()));

DROP POLICY IF EXISTS "Template versions manage owner" ON owner_control.template_versions;
CREATE POLICY "Template versions manage owner"
ON owner_control.template_versions
FOR ALL
USING (public.is_owner_account(auth.uid()))
WITH CHECK (public.is_owner_account(auth.uid()));

DROP POLICY IF EXISTS "Tenant template versions select owner" ON owner_control.tenant_template_versions;
CREATE POLICY "Tenant template versions select owner"
ON owner_control.tenant_template_versions
FOR SELECT
USING (public.is_owner_account(auth.uid()));

DROP POLICY IF EXISTS "Tenant template versions manage owner" ON owner_control.tenant_template_versions;
CREATE POLICY "Tenant template versions manage owner"
ON owner_control.tenant_template_versions
FOR ALL
USING (public.is_owner_account(auth.uid()))
WITH CHECK (public.is_owner_account(auth.uid()));

CREATE OR REPLACE FUNCTION owner_control.owner_publish_template_version(
  _version_name text,
  _payload jsonb,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, owner_control
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_owner_account(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao owner';
  END IF;

  INSERT INTO owner_control.template_versions (
    version_name,
    payload,
    notes,
    published_by
  )
  VALUES (
    _version_name,
    _payload,
    _notes,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION owner_control.owner_activate_template_version(
  _version_id uuid,
  _tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, owner_control
AS $$
BEGIN
  IF NOT public.is_owner_account(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao owner';
  END IF;

  UPDATE owner_control.template_versions
  SET is_active = false,
      updated_at = now()
  WHERE id <> _version_id;

  UPDATE owner_control.template_versions
  SET is_active = true,
      updated_at = now()
  WHERE id = _version_id;

  IF _tenant_id IS NULL THEN
    INSERT INTO owner_control.tenant_template_versions (tenant_id, active_template_version_id, updated_at)
    SELECT t.id, _version_id, now()
    FROM public.tenants t
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      active_template_version_id = EXCLUDED.active_template_version_id,
      updated_at = now();
  ELSE
    INSERT INTO owner_control.tenant_template_versions (tenant_id, active_template_version_id, updated_at)
    VALUES (_tenant_id, _version_id, now())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      active_template_version_id = EXCLUDED.active_template_version_id,
      updated_at = now();
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION owner_control.owner_restore_soft_deleted(
  _entity_table text,
  _entity_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, owner_control
AS $$
DECLARE
  v_payload jsonb;
  v_tenant_id uuid;
BEGIN
  IF NOT public.is_owner_account(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao owner';
  END IF;

  CASE _entity_table
    WHEN 'obras' THEN
      UPDATE public.obras
      SET deleted_at = NULL
      WHERE id = _entity_id
      RETURNING tenant_id, to_jsonb(obras.*) INTO v_tenant_id, v_payload;
    WHEN 'fornecedores' THEN
      UPDATE public.fornecedores
      SET deleted_at = NULL
      WHERE id = _entity_id
      RETURNING tenant_id, to_jsonb(fornecedores.*) INTO v_tenant_id, v_payload;
    WHEN 'materiais' THEN
      UPDATE public.materiais
      SET deleted_at = NULL
      WHERE id = _entity_id
      RETURNING tenant_id, to_jsonb(materiais.*) INTO v_tenant_id, v_payload;
    WHEN 'material_fornecedor' THEN
      UPDATE public.material_fornecedor
      SET deleted_at = NULL
      WHERE id = _entity_id
      RETURNING tenant_id, to_jsonb(material_fornecedor.*) INTO v_tenant_id, v_payload;
    WHEN 'pedidos_compra' THEN
      UPDATE public.pedidos_compra
      SET deleted_at = NULL
      WHERE id = _entity_id
      RETURNING tenant_id, to_jsonb(pedidos_compra.*) INTO v_tenant_id, v_payload;
    ELSE
      RAISE EXCEPTION 'Entidade nao suportada para restauracao: %', _entity_table;
  END CASE;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Registro nao encontrado para restauracao';
  END IF;

  PERFORM public.write_audit_log(
    _entity_table,
    _entity_id,
    'owner_restore_soft_delete',
    NULL,
    NULL,
    NULL,
    jsonb_build_object('reason', _reason, 'payload', v_payload),
    v_tenant_id
  );

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION owner_control.owner_restore_field_version(
  _entity_table text,
  _entity_id uuid,
  _audit_log_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, owner_control
AS $$
DECLARE
  v_old_data jsonb;
  v_tenant_id uuid;
  v_payload jsonb;
BEGIN
  IF NOT public.is_owner_account(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao owner';
  END IF;

  SELECT old_data, tenant_id
  INTO v_old_data, v_tenant_id
  FROM public.audit_log
  WHERE id = _audit_log_id
    AND entity_table = _entity_table
    AND entity_id = _entity_id
  LIMIT 1;

  IF v_old_data IS NULL THEN
    RAISE EXCEPTION 'Versao de auditoria invalida';
  END IF;

  CASE _entity_table
    WHEN 'pedidos_compra' THEN
      UPDATE public.pedidos_compra
      SET
        status = COALESCE(v_old_data->>'status', status),
        codigo_compra = COALESCE(v_old_data->>'codigo_compra', codigo_compra),
        data_recebimento = COALESCE((v_old_data->>'data_recebimento')::timestamptz, data_recebimento)
      WHERE id = _entity_id
      RETURNING to_jsonb(pedidos_compra.*) INTO v_payload;
    WHEN 'material_fornecedor' THEN
      UPDATE public.material_fornecedor
      SET
        preco_atual = COALESCE((v_old_data->>'preco_atual')::numeric, preco_atual),
        validade_preco = COALESCE((v_old_data->>'validade_preco')::date, validade_preco)
      WHERE id = _entity_id
      RETURNING to_jsonb(material_fornecedor.*) INTO v_payload;
    ELSE
      RAISE EXCEPTION 'Entidade nao suportada para restaurar versao: %', _entity_table;
  END CASE;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Registro nao encontrado para restaurar versao';
  END IF;

  PERFORM public.write_audit_log(
    _entity_table,
    _entity_id,
    'owner_restore_field_version',
    NULL,
    NULL,
    v_old_data,
    jsonb_build_object('reason', _reason, 'payload', v_payload),
    v_tenant_id
  );

  RETURN v_payload;
END;
$$;

GRANT USAGE ON SCHEMA owner_control TO authenticated;
GRANT EXECUTE ON FUNCTION owner_control.owner_publish_template_version(text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION owner_control.owner_activate_template_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION owner_control.owner_restore_soft_deleted(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION owner_control.owner_restore_field_version(text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, uuid, text, uuid) TO authenticated;

INSERT INTO public.permission_catalog (key, area, label_pt, label_en, label_es, obra_scoped)
VALUES
  ('users.manage', 'governanca', 'Gerenciar usuários', 'Manage users', 'Gestionar usuarios', false),
  ('audit.view', 'governanca', 'Visualizar auditoria', 'View audit logs', 'Ver auditoría', false),
  ('obras.view', 'obras', 'Visualizar obras', 'View projects', 'Ver obras', true),
  ('obras.manage', 'obras', 'Gerenciar obras', 'Manage projects', 'Gestionar obras', false),
  ('fornecedores.view', 'cadastros', 'Visualizar fornecedores', 'View suppliers', 'Ver proveedores', false),
  ('fornecedores.manage', 'cadastros', 'Gerenciar fornecedores', 'Manage suppliers', 'Gestionar proveedores', false),
  ('materiais.view', 'cadastros', 'Visualizar materiais', 'View materials', 'Ver materiales', false),
  ('materiais.manage', 'cadastros', 'Gerenciar materiais', 'Manage materials', 'Gestionar materiales', false),
  ('material_fornecedor.view', 'cadastros', 'Visualizar relação material fornecedor', 'View material supplier links', 'Ver vínculos material proveedor', false),
  ('material_fornecedor.manage', 'cadastros', 'Gerenciar relação material fornecedor', 'Manage material supplier links', 'Gestionar vínculos material proveedor', false),
  ('pedidos.view', 'compras', 'Visualizar pedidos', 'View purchase orders', 'Ver pedidos de compra', true),
  ('pedidos.create', 'compras', 'Criar pedidos', 'Create purchase orders', 'Crear pedidos de compra', true),
  ('pedidos.edit_base', 'compras', 'Editar dados base do pedido', 'Edit purchase order base data', 'Editar datos base del pedido', true),
  ('pedidos.approve', 'compras', 'Aprovar ou cancelar pedidos', 'Approve or cancel purchase orders', 'Aprobar o cancelar pedidos', true),
  ('pedidos.receive', 'compras', 'Marcar recebimento de pedidos', 'Mark purchase order receipt', 'Marcar recepción de pedidos', true),
  ('pedidos.delete', 'compras', 'Excluir pedidos', 'Delete purchase orders', 'Eliminar pedidos', true),
  ('estoque.view', 'almoxarifado', 'Visualizar estoque', 'View stock', 'Ver inventario', true),
  ('estoque.manage', 'almoxarifado', 'Gerenciar estoque', 'Manage stock', 'Gestionar inventario', true)
ON CONFLICT (key) DO UPDATE
SET
  area = EXCLUDED.area,
  label_pt = EXCLUDED.label_pt,
  label_en = EXCLUDED.label_en,
  label_es = EXCLUDED.label_es,
  obra_scoped = EXCLUDED.obra_scoped,
  is_active = true;

ALTER TABLE public.user_types DROP CONSTRAINT IF EXISTS user_types_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_types_tenant_name_key ON public.user_types (tenant_id, name);
INSERT INTO public.user_type_permissions (tenant_id, user_type_id, permission_key, scope_type, is_recommended)
SELECT ut.tenant_id, ut.id, pc.key,
  CASE WHEN pc.obra_scoped THEN 'all_obras'::public.permission_scope_type ELSE 'tenant'::public.permission_scope_type END,
  true
FROM public.user_types ut
JOIN public.permission_catalog pc ON 1=1
WHERE ut.base_role = 'master'
ON CONFLICT (tenant_id, user_type_id, permission_key) DO NOTHING;

INSERT INTO public.user_type_permissions (tenant_id, user_type_id, permission_key, scope_type, is_recommended)
SELECT ut.tenant_id, ut.id, pc.key,
  CASE WHEN pc.obra_scoped THEN 'all_obras'::public.permission_scope_type ELSE 'tenant'::public.permission_scope_type END,
  true
FROM public.user_types ut
JOIN public.permission_catalog pc ON pc.key IN (
  'users.manage', 'audit.view', 'obras.view', 'obras.manage',
  'fornecedores.view', 'fornecedores.manage',
  'materiais.view', 'materiais.manage',
  'material_fornecedor.view', 'material_fornecedor.manage',
  'pedidos.view', 'pedidos.create', 'pedidos.edit_base', 'pedidos.approve', 'pedidos.receive', 'pedidos.delete',
  'estoque.view', 'estoque.manage'
)
WHERE ut.base_role = 'gestor'
ON CONFLICT (tenant_id, user_type_id, permission_key) DO NOTHING;

INSERT INTO public.user_type_permissions (tenant_id, user_type_id, permission_key, scope_type, is_recommended)
SELECT ut.tenant_id, ut.id, pc.key,
  CASE WHEN pc.obra_scoped THEN 'all_obras'::public.permission_scope_type ELSE 'tenant'::public.permission_scope_type END,
  true
FROM public.user_types ut
JOIN public.permission_catalog pc ON pc.key IN (
  'obras.view', 'fornecedores.view', 'fornecedores.manage', 'materiais.view', 'materiais.manage',
  'material_fornecedor.view', 'material_fornecedor.manage', 'pedidos.view', 'pedidos.create', 'pedidos.edit_base'
)
WHERE ut.base_role = 'operacional'
ON CONFLICT (tenant_id, user_type_id, permission_key) DO NOTHING;

INSERT INTO public.user_type_permissions (tenant_id, user_type_id, permission_key, scope_type, is_recommended)
SELECT ut.tenant_id, ut.id, pc.key,
  CASE WHEN pc.obra_scoped THEN 'all_obras'::public.permission_scope_type ELSE 'tenant'::public.permission_scope_type END,
  true
FROM public.user_types ut
JOIN public.permission_catalog pc ON pc.key IN (
  'obras.view', 'pedidos.view', 'pedidos.approve', 'estoque.view'
)
WHERE ut.base_role = 'engenheiro'
ON CONFLICT (tenant_id, user_type_id, permission_key) DO NOTHING;

INSERT INTO public.user_type_permissions (tenant_id, user_type_id, permission_key, scope_type, is_recommended)
SELECT ut.tenant_id, ut.id, pc.key,
  CASE WHEN pc.obra_scoped THEN 'all_obras'::public.permission_scope_type ELSE 'tenant'::public.permission_scope_type END,
  true
FROM public.user_types ut
JOIN public.permission_catalog pc ON pc.key IN (
  'obras.view', 'pedidos.view', 'pedidos.receive', 'estoque.view', 'estoque.manage'
)
WHERE ut.base_role = 'almoxarife'
ON CONFLICT (tenant_id, user_type_id, permission_key) DO NOTHING;

UPDATE public.tenant_settings ts
SET
  multi_obra_enabled = sub.active_obras > 1,
  default_obra_id = CASE WHEN sub.active_obras = 1 THEN sub.single_obra_id ELSE NULL END,
  updated_at = now()
FROM (
  SELECT
    o.tenant_id,
    COUNT(*) FILTER (WHERE o.deleted_at IS NULL) AS active_obras,
    (ARRAY_AGG(o.id ORDER BY o.id) FILTER (WHERE o.deleted_at IS NULL))[1] AS single_obra_id
  FROM public.obras o
  GROUP BY o.tenant_id
) sub
WHERE ts.tenant_id = sub.tenant_id;

