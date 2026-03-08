# Smoke Checklist - Prumo (Multi-tenant + Permissões Granulares)

## Pré-requisitos
- Migrations aplicadas até `20260308103000_multitenant_permissions_owner_control.sql`.
- `supabase/seed.sql` aplicado.
- Conta master do tenant ativa.
- Contas owner provisionadas em `owner_control.owner_accounts`.

## 1) Isolamento por tenant
- Criar tenant A e tenant B (ou usar ambientes equivalentes).
- No tenant A, criar/editar dados de obras, pedidos e estoque.
- Entrar com usuário do tenant B.
- Validar que nenhuma leitura/escrita do tenant A é possível por UI e API.

## 2) Tenant com 1 obra
- Garantir `tenant_settings.multi_obra_enabled = false` e `default_obra_id` preenchido.
- Login de usuário ativo com acesso à obra padrão.
- Validar redirecionamento automático para `/dashboard/:defaultObraId`.
- Validar que não há bloqueio para módulos permitidos nessa obra.

## 3) Tenant com várias obras
- Garantir `tenant_settings.multi_obra_enabled = true`.
- Vincular usuário somente à obra A.
- Validar acesso à obra A.
- Tentar acessar obra B por URL direta.
- Validar bloqueio em `/sem-acesso`.

## 4) Template recomendado (empresa menor)
- Cenário com até 2 obras ou até 15 usuários ativos.
- Abrir `Usuários e Acessos`.
- Validar aviso de recomendação de template.
- Aplicar template em um usuário e salvar.
- Confirmar acesso operacional conforme template.

## 5) Modo personalizado (custom)
- Em `Usuários e Acessos`, trocar usuário para `Modo de acesso: Personalizado`.
- Conceder apenas `materiais.view` com escopo `all_obras`.
- Salvar.
- Login com essa conta:
- deve visualizar materiais.
- não deve criar/editar material.
- não deve acessar pedidos, recebimento, estoque ou usuários/acessos.

## 6) Escopo `selected_obras`
- No mesmo usuário custom, trocar permissão `pedidos.view` para `selected_obras`.
- Marcar apenas obra A.
- Validar leitura de pedidos em obra A.
- Validar bloqueio em obra B.

## 7) Fluxo de usuário novo sem acesso útil
- Fazer signup de nova conta.
- Não vincular tipo/permissão/obra.
- Login.
- Validar tela `Sem acesso operacional`.

## 8) Owner-control (app do dono)
- Login com conta em `owner_control.owner_accounts`.
- Publicar versão de template via RPC `owner_publish_template_version`.
- Ativar via `owner_activate_template_version`.
- Executar recuperação de soft-delete via `owner_restore_soft_deleted`.
- Executar recuperação de versão crítica via `owner_restore_field_version`.
- Validar que não existe CRUD operacional direto do owner nas tabelas de negócio.

## 9) Auditoria
- Alterar `is_active`, `user_type_id`, vínculo de obra e grants customizados.
- Validar registro correspondente em `audit_log` com `tenant_id`, autor e timestamp.
- Validar log das ações owner (`owner_restore_*`).

## 10) Idiomas
- Alternar idioma para `pt-BR`, `en`, `es` em login/home/dashboard/sem-acesso.
- Validar persistência da escolha no navegador.
- Validar ortografia do `pt-BR` nas telas principais.
