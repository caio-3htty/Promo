-- Suporte a usuario master e tipos de usuario da empresa

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'master';

-- Master passa em qualquer verificacao de role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR role = 'master'::public.app_role)
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
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = ANY(_roles)
        OR role = 'master'::public.app_role
      )
  )
$$;

-- Tipos de usuario customizaveis por empresa
CREATE TABLE IF NOT EXISTS public.user_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  base_role public.app_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Work users can view user types" ON public.user_types;
DROP POLICY IF EXISTS "Admins can manage user types" ON public.user_types;

CREATE POLICY "Work users can view user types"
ON public.user_types
FOR SELECT
USING (public.has_work_access(auth.uid()));

CREATE POLICY "Admins can manage user types"
ON public.user_types
FOR ALL
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
);

DROP TRIGGER IF EXISTS tr_update_user_types_updated_at ON public.user_types;
CREATE TRIGGER tr_update_user_types_updated_at
BEFORE UPDATE ON public.user_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_type_id uuid REFERENCES public.user_types(id);

-- Restringe mudancas sensiveis de perfil para nao-admins
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

  IF NOT public.has_role(auth.uid(), 'gestor'::public.app_role) THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Somente admin pode alterar ativacao de usuario';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Somente admin pode alterar email no perfil publico';
    END IF;
    IF NEW.user_type_id IS DISTINCT FROM OLD.user_type_id THEN
      RAISE EXCEPTION 'Somente admin pode alterar tipo de usuario';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Sincroniza role base ao alterar tipo de usuario
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
    AND is_active = true
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Tipo de usuario invalido ou inativo';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, v_role)
  ON CONFLICT (user_id)
  DO UPDATE SET role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_role_from_user_type ON public.profiles;
CREATE TRIGGER tr_sync_role_from_user_type
BEFORE INSERT OR UPDATE OF user_type_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_role_from_user_type();

-- Amplia auditoria de profiles para capturar tipo de usuario
CREATE OR REPLACE FUNCTION public.audit_user_access_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id uuid;
  v_target_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_target_user_id := OLD.user_id;
    PERFORM public.write_audit_log(TG_TABLE_NAME, v_entity_id, lower(TG_OP), v_target_user_id, NULL, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;

  v_entity_id := NEW.id;
  v_target_user_id := NEW.user_id;

  IF TG_TABLE_NAME = 'profiles' THEN
    IF TG_OP = 'UPDATE' AND (
      NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.user_type_id IS DISTINCT FROM OLD.user_type_id
    ) THEN
      PERFORM public.write_audit_log(
        TG_TABLE_NAME,
        v_entity_id,
        'update',
        v_target_user_id,
        NULL,
        jsonb_build_object(
          'is_active', OLD.is_active,
          'user_type_id', OLD.user_type_id
        ),
        jsonb_build_object(
          'is_active', NEW.is_active,
          'user_type_id', NEW.user_type_id
        )
      );
    END IF;
  ELSE
    PERFORM public.write_audit_log(
      TG_TABLE_NAME,
      v_entity_id,
      lower(TG_OP),
      v_target_user_id,
      CASE
        WHEN TG_TABLE_NAME = 'user_obras' THEN NEW.obra_id
        ELSE NULL
      END,
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      to_jsonb(NEW)
    );
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.user_types (name, description, base_role, is_active)
VALUES
  ('Master', 'Administrador master da empresa', 'master', true),
  ('Gestor', 'Gestao geral', 'gestor', true),
  ('Engenheiro', 'Acompanha e aprova pedidos', 'engenheiro', true),
  ('Operacional', 'Opera cadastros e pedidos', 'operacional', true),
  ('Almoxarife', 'Recebimento e estoque', 'almoxarife', true)
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  base_role = EXCLUDED.base_role,
  is_active = EXCLUDED.is_active;

-- Backfill: associa tipo default pelo role atual
UPDATE public.profiles p
SET user_type_id = ut.id
FROM public.user_roles ur
JOIN public.user_types ut
  ON ut.base_role = ur.role
WHERE p.user_id = ur.user_id
  AND p.user_type_id IS NULL;
