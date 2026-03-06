-- Perfil de usuario: email e ativacao explicita
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.user_id
  AND (p.email IS NULL OR p.email = '');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key ON public.profiles (email);

-- Atualiza trigger de cadastro para preencher email e deixar inativo por padrao
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    false
  );
  RETURN NEW;
END;
$$;

-- Papel unico por usuario
WITH ranked_roles AS (
  SELECT
    id,
    user_id,
    role,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE role
          WHEN 'gestor' THEN 1
          WHEN 'engenheiro' THEN 2
          WHEN 'operacional' THEN 3
          WHEN 'almoxarife' THEN 4
          ELSE 99
        END,
        id
    ) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles ur
USING ranked_roles rr
WHERE ur.id = rr.id
  AND rr.rn > 1;

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

-- Funcoes auxiliares de RBAC
CREATE OR REPLACE FUNCTION public.current_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
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
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
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
      AND role = ANY(_roles)
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
    FROM public.profiles
    WHERE user_id = _user_id
      AND is_active = true
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
    AND public.has_any_role(_user_id, ARRAY['gestor', 'engenheiro', 'operacional', 'almoxarife']::public.app_role[])
    AND (
      public.has_role(_user_id, 'gestor'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_obras uo
        WHERE uo.user_id = _user_id
      )
    )
$$;

-- Auditoria
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  changed_by uuid,
  target_user_id uuid,
  obra_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestores can view audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Gestores can insert audit logs" ON public.audit_log;

CREATE POLICY "Gestores can view audit logs"
ON public.audit_log
FOR SELECT
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores can insert audit logs"
ON public.audit_log
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE OR REPLACE FUNCTION public.write_audit_log(
  _entity_table text,
  _entity_id uuid,
  _action text,
  _target_user_id uuid,
  _obra_id uuid,
  _old_data jsonb,
  _new_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (
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
    IF TG_OP = 'UPDATE' AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      PERFORM public.write_audit_log(TG_TABLE_NAME, v_entity_id, 'update', v_target_user_id, NULL, jsonb_build_object('is_active', OLD.is_active), jsonb_build_object('is_active', NEW.is_active));
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

CREATE OR REPLACE FUNCTION public.audit_business_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'material_fornecedor' THEN
    IF TG_OP = 'UPDATE' AND (
      NEW.preco_atual IS DISTINCT FROM OLD.preco_atual
      OR NEW.validade_preco IS DISTINCT FROM OLD.validade_preco
    ) THEN
      PERFORM public.write_audit_log(
        TG_TABLE_NAME,
        NEW.id,
        'update',
        NULL,
        NULL,
        jsonb_build_object('preco_atual', OLD.preco_atual, 'validade_preco', OLD.validade_preco),
        jsonb_build_object('preco_atual', NEW.preco_atual, 'validade_preco', NEW.validade_preco)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'pedidos_compra' THEN
    IF TG_OP = 'UPDATE' AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.codigo_compra IS DISTINCT FROM OLD.codigo_compra
      OR NEW.data_recebimento IS DISTINCT FROM OLD.data_recebimento
    ) THEN
      PERFORM public.write_audit_log(
        TG_TABLE_NAME,
        NEW.id,
        'update',
        NULL,
        NEW.obra_id,
        jsonb_build_object('status', OLD.status, 'codigo_compra', OLD.codigo_compra, 'data_recebimento', OLD.data_recebimento),
        jsonb_build_object('status', NEW.status, 'codigo_compra', NEW.codigo_compra, 'data_recebimento', NEW.data_recebimento)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_user_roles ON public.user_roles;
CREATE TRIGGER tr_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.audit_user_access_changes();

DROP TRIGGER IF EXISTS tr_audit_user_obras ON public.user_obras;
CREATE TRIGGER tr_audit_user_obras
AFTER INSERT OR UPDATE OR DELETE ON public.user_obras
FOR EACH ROW
EXECUTE FUNCTION public.audit_user_access_changes();

DROP TRIGGER IF EXISTS tr_audit_profiles_active ON public.profiles;
CREATE TRIGGER tr_audit_profiles_active
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.audit_user_access_changes();

DROP TRIGGER IF EXISTS tr_audit_material_fornecedor ON public.material_fornecedor;
CREATE TRIGGER tr_audit_material_fornecedor
AFTER UPDATE ON public.material_fornecedor
FOR EACH ROW
EXECUTE FUNCTION public.audit_business_changes();

DROP TRIGGER IF EXISTS tr_audit_pedidos_compra ON public.pedidos_compra;
CREATE TRIGGER tr_audit_pedidos_compra
AFTER UPDATE ON public.pedidos_compra
FOR EACH ROW
EXECUTE FUNCTION public.audit_business_changes();

-- Restricoes de workflow de pedidos de compra por papel
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
    RAISE EXCEPTION 'Usuario nao autenticado';
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

  -- UPDATE
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

DROP TRIGGER IF EXISTS tr_enforce_pedidos_workflow ON public.pedidos_compra;
CREATE TRIGGER tr_enforce_pedidos_workflow
BEFORE INSERT OR UPDATE ON public.pedidos_compra
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pedidos_workflow();

-- Bloqueia alteracao de campos sensiveis de perfil por nao-gestores
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
      RAISE EXCEPTION 'Somente gestor pode alterar ativacao de usuario';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Somente gestor pode alterar email no perfil publico';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_restrict_profile_sensitive_updates ON public.profiles;
CREATE TRIGGER tr_restrict_profile_sensitive_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.restrict_profile_sensitive_updates();

-- RLS: profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Gestores can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Gestores can update all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Gestores can view all profiles"
ON public.profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Gestores can update all profiles"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

-- RLS: user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can update roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Gestores can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores can update roles"
ON public.user_roles
FOR UPDATE
USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores can delete roles"
ON public.user_roles
FOR DELETE
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

-- RLS: user_obras
DROP POLICY IF EXISTS "Users can view own assignments" ON public.user_obras;
DROP POLICY IF EXISTS "Gestores can view all assignments" ON public.user_obras;
DROP POLICY IF EXISTS "Gestores can insert assignments" ON public.user_obras;
DROP POLICY IF EXISTS "Gestores can delete assignments" ON public.user_obras;
DROP POLICY IF EXISTS "Gestores can update assignments" ON public.user_obras;

CREATE POLICY "Users can view own assignments"
ON public.user_obras
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Gestores can view all assignments"
ON public.user_obras
FOR SELECT
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores can insert assignments"
ON public.user_obras
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores can update assignments"
ON public.user_obras
FOR UPDATE
USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores can delete assignments"
ON public.user_obras
FOR DELETE
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

-- RLS: obras
DROP POLICY IF EXISTS "Gestores can view all obras" ON public.obras;
DROP POLICY IF EXISTS "Users can view assigned obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores can insert obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores can update obras" ON public.obras;
DROP POLICY IF EXISTS "Gestores can delete obras" ON public.obras;

CREATE POLICY "Gestores can view all obras"
ON public.obras
FOR SELECT
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
);

CREATE POLICY "Users can view assigned obras"
ON public.obras
FOR SELECT
USING (
  public.has_work_access(auth.uid())
  AND public.user_belongs_to_obra(auth.uid(), id)
);

CREATE POLICY "Gestores can insert obras"
ON public.obras
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
);

CREATE POLICY "Gestores can update obras"
ON public.obras
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
);

CREATE POLICY "Gestores can delete obras"
ON public.obras
FOR DELETE
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
);

-- RLS: fornecedores
DROP POLICY IF EXISTS "Gestores full access fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Authenticated users can view fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Work users can view fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Gestor e operacional manage fornecedores" ON public.fornecedores;

CREATE POLICY "Work users can view fornecedores"
ON public.fornecedores
FOR SELECT
USING (public.has_work_access(auth.uid()));

CREATE POLICY "Gestor e operacional manage fornecedores"
ON public.fornecedores
FOR ALL
USING (
  public.is_user_active(auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['gestor', 'operacional']::public.app_role[])
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['gestor', 'operacional']::public.app_role[])
);

-- RLS: materiais
DROP POLICY IF EXISTS "Gestores full access materiais" ON public.materiais;
DROP POLICY IF EXISTS "Authenticated users can view materiais" ON public.materiais;
DROP POLICY IF EXISTS "Work users can view materiais" ON public.materiais;
DROP POLICY IF EXISTS "Gestor e operacional manage materiais" ON public.materiais;

CREATE POLICY "Work users can view materiais"
ON public.materiais
FOR SELECT
USING (public.has_work_access(auth.uid()));

CREATE POLICY "Gestor e operacional manage materiais"
ON public.materiais
FOR ALL
USING (
  public.is_user_active(auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['gestor', 'operacional']::public.app_role[])
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['gestor', 'operacional']::public.app_role[])
);

-- RLS: material_fornecedor
DROP POLICY IF EXISTS "Authenticated users can view material_fornecedor" ON public.material_fornecedor;
DROP POLICY IF EXISTS "Gestores full access material_fornecedor" ON public.material_fornecedor;
DROP POLICY IF EXISTS "Work users can view material_fornecedor" ON public.material_fornecedor;
DROP POLICY IF EXISTS "Gestor e operacional manage material_fornecedor" ON public.material_fornecedor;

CREATE POLICY "Work users can view material_fornecedor"
ON public.material_fornecedor
FOR SELECT
USING (public.has_work_access(auth.uid()));

CREATE POLICY "Gestor e operacional manage material_fornecedor"
ON public.material_fornecedor
FOR ALL
USING (
  public.is_user_active(auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['gestor', 'operacional']::public.app_role[])
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['gestor', 'operacional']::public.app_role[])
);

-- RLS: pedidos_compra
DROP POLICY IF EXISTS "Authenticated users can view pedidos_compra" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Gestores full access pedidos_compra" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Almoxarifes can update pedidos_compra" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Users can view pedidos da obra" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Gestor e operacional insert pedidos" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Roles allowed update pedidos" ON public.pedidos_compra;
DROP POLICY IF EXISTS "Gestores can delete pedidos" ON public.pedidos_compra;

CREATE POLICY "Users can view pedidos da obra"
ON public.pedidos_compra
FOR SELECT
USING (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR (
      public.user_belongs_to_obra(auth.uid(), obra_id)
      AND public.has_any_role(auth.uid(), ARRAY['engenheiro', 'operacional', 'almoxarife']::public.app_role[])
    )
  )
);

CREATE POLICY "Gestor e operacional insert pedidos"
ON public.pedidos_compra
FOR INSERT
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'operacional'::public.app_role)
      AND public.user_belongs_to_obra(auth.uid(), obra_id)
    )
  )
);

CREATE POLICY "Roles allowed update pedidos"
ON public.pedidos_compra
FOR UPDATE
USING (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR (
      public.user_belongs_to_obra(auth.uid(), obra_id)
      AND public.has_any_role(auth.uid(), ARRAY['operacional', 'engenheiro', 'almoxarife']::public.app_role[])
    )
  )
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR (
      public.user_belongs_to_obra(auth.uid(), obra_id)
      AND public.has_any_role(auth.uid(), ARRAY['operacional', 'engenheiro', 'almoxarife']::public.app_role[])
    )
  )
);

CREATE POLICY "Gestores can delete pedidos"
ON public.pedidos_compra
FOR DELETE
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
);

-- RLS: estoque_obra_material
DROP POLICY IF EXISTS "Authenticated users can view estoque" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Gestores full access estoque" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Almoxarifes can update estoque" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Almoxarifes can insert estoque" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Users can view estoque da obra" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Gestor e almoxarife insert estoque" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Gestor e almoxarife update estoque" ON public.estoque_obra_material;
DROP POLICY IF EXISTS "Gestores can delete estoque" ON public.estoque_obra_material;

CREATE POLICY "Users can view estoque da obra"
ON public.estoque_obra_material
FOR SELECT
USING (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.user_belongs_to_obra(auth.uid(), obra_id)
  )
);

CREATE POLICY "Gestor e almoxarife insert estoque"
ON public.estoque_obra_material
FOR INSERT
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'almoxarife'::public.app_role)
      AND public.user_belongs_to_obra(auth.uid(), obra_id)
    )
  )
);

CREATE POLICY "Gestor e almoxarife update estoque"
ON public.estoque_obra_material
FOR UPDATE
USING (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'almoxarife'::public.app_role)
      AND public.user_belongs_to_obra(auth.uid(), obra_id)
    )
  )
)
WITH CHECK (
  public.is_user_active(auth.uid())
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'almoxarife'::public.app_role)
      AND public.user_belongs_to_obra(auth.uid(), obra_id)
    )
  )
);

CREATE POLICY "Gestores can delete estoque"
ON public.estoque_obra_material
FOR DELETE
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  AND public.is_user_active(auth.uid())
);
