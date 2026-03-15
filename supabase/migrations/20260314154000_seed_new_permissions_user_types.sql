WITH role_permission_map AS (
  SELECT * FROM (
    VALUES
      -- Master
      ('master'::public.app_role, 'pedidos.plan'::text, 'all_obras'::public.permission_scope_type),
      ('master'::public.app_role, 'orcamento.view'::text, 'all_obras'::public.permission_scope_type),
      ('master'::public.app_role, 'orcamento.manage'::text, 'all_obras'::public.permission_scope_type),
      ('master'::public.app_role, 'notifications.view'::text, 'all_obras'::public.permission_scope_type),
      ('master'::public.app_role, 'notifications.manage'::text, 'all_obras'::public.permission_scope_type),
      ('master'::public.app_role, 'incidentes.view'::text, 'all_obras'::public.permission_scope_type),
      ('master'::public.app_role, 'incidentes.manage'::text, 'all_obras'::public.permission_scope_type),
      ('master'::public.app_role, 'reports.view'::text, 'tenant'::public.permission_scope_type),
      ('master'::public.app_role, 'reports.generate'::text, 'tenant'::public.permission_scope_type),

      -- Gestor
      ('gestor'::public.app_role, 'pedidos.plan'::text, 'all_obras'::public.permission_scope_type),
      ('gestor'::public.app_role, 'orcamento.view'::text, 'all_obras'::public.permission_scope_type),
      ('gestor'::public.app_role, 'orcamento.manage'::text, 'all_obras'::public.permission_scope_type),
      ('gestor'::public.app_role, 'notifications.view'::text, 'all_obras'::public.permission_scope_type),
      ('gestor'::public.app_role, 'notifications.manage'::text, 'all_obras'::public.permission_scope_type),
      ('gestor'::public.app_role, 'incidentes.view'::text, 'all_obras'::public.permission_scope_type),
      ('gestor'::public.app_role, 'incidentes.manage'::text, 'all_obras'::public.permission_scope_type),
      ('gestor'::public.app_role, 'reports.view'::text, 'tenant'::public.permission_scope_type),
      ('gestor'::public.app_role, 'reports.generate'::text, 'tenant'::public.permission_scope_type),

      -- Operacional
      ('operacional'::public.app_role, 'pedidos.plan'::text, 'all_obras'::public.permission_scope_type),
      ('operacional'::public.app_role, 'orcamento.view'::text, 'all_obras'::public.permission_scope_type),
      ('operacional'::public.app_role, 'orcamento.manage'::text, 'all_obras'::public.permission_scope_type),
      ('operacional'::public.app_role, 'notifications.view'::text, 'all_obras'::public.permission_scope_type),
      ('operacional'::public.app_role, 'notifications.manage'::text, 'all_obras'::public.permission_scope_type),
      ('operacional'::public.app_role, 'incidentes.view'::text, 'all_obras'::public.permission_scope_type),
      ('operacional'::public.app_role, 'incidentes.manage'::text, 'all_obras'::public.permission_scope_type),

      -- Engenheiro
      ('engenheiro'::public.app_role, 'notifications.view'::text, 'all_obras'::public.permission_scope_type),
      ('engenheiro'::public.app_role, 'notifications.manage'::text, 'all_obras'::public.permission_scope_type),
      ('engenheiro'::public.app_role, 'incidentes.view'::text, 'all_obras'::public.permission_scope_type),
      ('engenheiro'::public.app_role, 'reports.view'::text, 'tenant'::public.permission_scope_type),

      -- Almoxarife
      ('almoxarife'::public.app_role, 'notifications.view'::text, 'all_obras'::public.permission_scope_type)
  ) AS t(base_role, permission_key, scope_type)
),
resolved AS (
  SELECT
    ut.tenant_id,
    ut.id AS user_type_id,
    rpm.permission_key,
    rpm.scope_type
  FROM public.user_types ut
  JOIN role_permission_map rpm
    ON rpm.base_role = ut.base_role
  JOIN public.permission_catalog pc
    ON pc.key = rpm.permission_key
   AND pc.is_active = true
)
INSERT INTO public.user_type_permissions (
  tenant_id,
  user_type_id,
  permission_key,
  scope_type,
  is_recommended
)
SELECT
  tenant_id,
  user_type_id,
  permission_key,
  scope_type,
  true
FROM resolved
ON CONFLICT (tenant_id, user_type_id, permission_key) DO UPDATE
SET
  scope_type = EXCLUDED.scope_type,
  is_recommended = true;
