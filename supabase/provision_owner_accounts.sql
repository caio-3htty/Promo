-- Provisiona contas do app owner (dono) no schema owner_control
-- 1) Crie as contas no Auth primeiro
-- 2) Ajuste os e-mails abaixo
-- 3) Execute no SQL Editor

DO $$
DECLARE
  v_email_primary text := 'caiofrossoni@gmail.com';
  v_email_backup text := 'backup-owner@exemplo.com';
  v_primary_id uuid;
  v_backup_id uuid;
BEGIN
  SELECT id INTO v_primary_id
  FROM auth.users
  WHERE lower(email) = lower(v_email_primary)
  LIMIT 1;

  IF v_primary_id IS NULL THEN
    RAISE EXCEPTION 'Conta owner principal não encontrada: %', v_email_primary;
  END IF;

  SELECT id INTO v_backup_id
  FROM auth.users
  WHERE lower(email) = lower(v_email_backup)
  LIMIT 1;

  IF v_backup_id IS NULL THEN
    RAISE EXCEPTION 'Conta owner contingência não encontrada: %', v_email_backup;
  END IF;

  INSERT INTO owner_control.owner_accounts (user_id, is_active, created_by)
  VALUES
    (v_primary_id, true, v_primary_id),
    (v_backup_id, true, v_primary_id)
  ON CONFLICT (user_id) DO UPDATE
  SET
    is_active = EXCLUDED.is_active,
    created_by = EXCLUDED.created_by;
END
$$;
