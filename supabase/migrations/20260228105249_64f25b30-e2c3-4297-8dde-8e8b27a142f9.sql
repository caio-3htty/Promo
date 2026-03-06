
-- Enum de roles
CREATE TYPE public.app_role AS ENUM ('gestor', 'engenheiro', 'operacional', 'almoxarife');

-- Tabela de perfis
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de roles (separada dos profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Tabela de obras
CREATE TABLE public.obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'ativa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vínculo usuário → obra
CREATE TABLE public.user_obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  obra_id UUID REFERENCES public.obras(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, obra_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_obras ENABLE ROW LEVEL SECURITY;

-- Security definer function para checar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Security definer function para checar se user pertence a uma obra
CREATE OR REPLACE FUNCTION public.user_belongs_to_obra(_user_id UUID, _obra_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_obras
    WHERE user_id = _user_id AND obra_id = _obra_id
  )
$$;

-- Trigger para criar profile automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_obras_updated_at BEFORE UPDATE ON public.obras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== RLS POLICIES =====

-- PROFILES: users can read/update their own profile; gestores can read all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Gestores can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- USER_ROLES: users can see own roles; gestores can manage all
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Gestores can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'gestor'));

-- OBRAS: gestores veem tudo; outros veem só suas obras
CREATE POLICY "Gestores can view all obras" ON public.obras FOR SELECT USING (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Users can view assigned obras" ON public.obras FOR SELECT USING (
  public.user_belongs_to_obra(auth.uid(), id)
);
CREATE POLICY "Gestores can insert obras" ON public.obras FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores can update obras" ON public.obras FOR UPDATE USING (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores can delete obras" ON public.obras FOR DELETE USING (public.has_role(auth.uid(), 'gestor'));

-- USER_OBRAS: gestores gerenciam; users veem suas atribuições
CREATE POLICY "Users can view own assignments" ON public.user_obras FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Gestores can view all assignments" ON public.user_obras FOR SELECT USING (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores can insert assignments" ON public.user_obras FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores can delete assignments" ON public.user_obras FOR DELETE USING (public.has_role(auth.uid(), 'gestor'));
