# Validacao Web Signup - 2026-03-28 (Producao Isolada)

## Resumo executivo
- Escopo validado: cadastro web `Conta empresa` + `Conta interna` (com revisao/edicao), qualidade de dados (`phone`, campos invalidos) e limpeza de residuos.
- Resultado geral: **PARCIALMENTE APROVADO**.
- Gates automatizados: **PASS**.
- Fluxos funcionais:
  - `Conta empresa`: **PASS**
  - `Conta interna` com aprovacao/edicao: **FAIL** (erro `user_type_not_configured`)
  - Qualidade de entrada/normalizacao: **PASS**
- Correcao aplicada no codigo (local): `account-access-request` agora cria/reativa `user_types` e permissoes padrao por `tenant/role`.

## Matriz PASS/FAIL

### 1) Validacao automatizada base
- `npm run supabase:test` -> **PASS**
- `npm run supabase:validate:access` -> **PASS**
- `npm run smoke:cross-app:write` -> **PASS**

### 2) Fluxo funcional de cadastro web (via API real da edge function)
- A1 `register_company` + login + checagem de `profiles/user_roles/access_signup_requests` -> **PASS**
  - Evidencias: `requested_phone` persistido, `tenant_id` preenchido, `role=master`, sem campo de senha no payload auditado.
- B1 `search_companies` + bloqueio sem `tenantId` -> **PASS**
  - Evidencia: retorno com `code=tenant_required`.
- B2 `register_internal` + `review_request(decision=edit)` + login -> **FAIL**
  - Falha: `code=user_type_not_configured`
  - Mensagem: `Nao existe tipo de usuario ativo para o perfil selecionado.`
- C1 entradas invalidas -> **PASS**
  - `phone` com letras -> `invalid_phone_format`
  - `phone` curto -> `phone_length_invalid`
  - `fullName` invalido -> `invalid_full_name_format`
  - `tenant` inexistente -> `tenant_not_found`

## Causa-raiz e correcoes

### Falha principal (P1)
- **Causa-raiz**: tenant novo criado por `register_company` pode nao possuir `user_types` ativos para todos os roles. Na aprovacao de conta interna, `review_request` exige `user_type_id` ativo e falha quando nao encontra.
- **Correcao implementada (local)**:
  - Arquivo: [index.ts](C:/Users/caio.rossoni/Downloads/Promo/supabase/functions/account-access-request/index.ts)
  - Ajustes:
    - `ROLE_DEFAULTS` com tipos/padroes por role.
    - `ensureUserTypePermissions(...)` para semear permissoes recomendadas.
    - `ensureUserTypeForRole(...)` para criar/reativar tipo por `tenant/role`.
    - `register_company` agora prepara baseline de `user_types` e seta `user_type_id` do master.
    - `review_request` passa a usar `ensureUserTypeForRole`.

## Higiene e limpeza
- Durante o smoke funcional, houve conflito de delete de tenant por FK em `audit_log`.
- Limpeza complementar executada com sucesso removendo registros de `audit_log` do tenant temporario.
- Verificacao final de residuos (`smoke-web-*`):
  - `tenants`: vazio
  - `access_signup_requests`: vazio

## Checklist de pendencias e melhoria (priorizado)

### P1 (bloqueante)
- [ ] Deploy da funcao `account-access-request` atualizada em producao.
- [ ] Reexecutar o cenario B2 completo e confirmar `PASS` (aprovacao com edicao + login + `user_type_id` + `user_obras`).

### P2 (confiabilidade operacional)
- [ ] Incluir limpeza de `audit_log` no smoke de signup para evitar residuo/erro 409 de tenant.
- [ ] Consolidar script dedicado `signup-web-smoke` para reproducao unica do fluxo A/B/C.

### P3 (qualidade continua)
- [ ] Adicionar teste automatizado do contrato da edge function para `register_company -> register_internal -> review_request`.
- [ ] Adicionar teste de regressao para codigos de erro de validacao (`invalid_phone_format`, `tenant_required`, etc).

## Conclusao
- O fluxo web esta **majoritariamente correto** e as validacoes de entrada estao funcionando.
- A unica falha funcional relevante identificada foi no caminho de aprovacao interna em tenant novo.
- A correcao ja foi implementada no codigo local e falta apenas aplicar/deploy e revalidar o cenario B2 para fechar 100%.
