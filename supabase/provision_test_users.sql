-- Bootstrap com usuario master unico
-- 1) Crie a conta via signup/login (ou Dashboard Auth)
-- 2) Ajuste o e-mail abaixo
-- 3) Rode no SQL Editor do Supabase

DO $$
DECLARE
  v_email_master text := 'caiofrossoni@gmail.com';
  v_user_master uuid;
  v_obra_a uuid := '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f101';
  v_obra_b uuid := '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f102';
BEGIN
  SELECT id INTO v_user_master
  FROM auth.users
  WHERE lower(email) = lower(v_email_master);

  IF v_user_master IS NULL THEN
    RAISE EXCEPTION 'E-mail % nao existe em auth.users. Crie a conta primeiro.', v_email_master;
  END IF;

  UPDATE public.profiles
  SET is_active = true
  WHERE user_id = v_user_master;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_master, 'master')
  ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role;

  INSERT INTO public.user_obras (user_id, obra_id)
  VALUES
    (v_user_master, v_obra_a),
    (v_user_master, v_obra_b)
  ON CONFLICT (user_id, obra_id) DO NOTHING;
END
$$;
