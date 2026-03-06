-- Promove caiofrossoni@gmail.com para master ativo
-- e vincula obras A/B para facilitar homologacao

DO $$
DECLARE
  v_email text := 'caiofrossoni@gmail.com';
  v_user_id uuid;
  v_obra_a uuid := '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f101';
  v_obra_b uuid := '8f9d7a0a-1d5c-4d45-b10e-8e5f8a18f102';
BEGIN
  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario % nao encontrado em auth.users', v_email;
  END IF;

  UPDATE public.profiles
  SET is_active = true
  WHERE user_id = v_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'master')
  ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role;

  INSERT INTO public.user_obras (user_id, obra_id)
  VALUES
    (v_user_id, v_obra_a),
    (v_user_id, v_obra_b)
  ON CONFLICT (user_id, obra_id) DO NOTHING;
END
$$;

-- Conferencia rapida
SELECT
  u.id AS user_id,
  u.email,
  p.is_active,
  ur.role,
  array_remove(array_agg(uo.obra_id), NULL) AS obras_vinculadas
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.user_obras uo ON uo.user_id = u.id
WHERE lower(u.email) = lower('caiofrossoni@gmail.com')
GROUP BY u.id, u.email, p.is_active, ur.role;
