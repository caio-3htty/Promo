# Validacao Web Signup - Pos-hotfix (2026-03-28)

## Resumo
- Objetivo do ciclo: corrigir `user_type_not_configured` no fluxo de `Conta interna` e fechar higiene do cleanup.
- Resultado final: **APROVADO**.
- Publicacao da funcao: **realizada em producao** (`project-ref: awkvzbpnihtgceqdwisc`).
- Script dedicado de validacao criado e executado com sucesso.

## Evidencias de execucao

### Deploy
- Comando executado:
  - `npx supabase@2.84.4 functions deploy account-access-request --project-ref awkvzbpnihtgceqdwisc`
- Resultado:
  - `Deployed Functions on project awkvzbpnihtgceqdwisc: account-access-request`

### Gates base
- `npm run supabase:test` -> PASS
- `npm run supabase:validate:access` -> PASS
- `npm run smoke:cross-app:write` -> PASS

### Smoke dedicado signup web
- Comando: `npm run smoke:web:signup`
- Prefixo isolado: `smoke-web-1774702483136-15`
- Resultado geral: `ok=true`

Matriz de cenarios:
- A1 `register_company + login + profile/role/audit` -> PASS
- B1 `search_companies + bloqueio sem tenantId` -> PASS
- B2 `register_internal + review(edit) + login + scope` -> PASS
- C1 `validacao de campos/codigos` -> PASS

Cleanup:
- Todos os passos em PASS, incluindo:
  - `delete_audit_log_by_tenant`
  - `delete_user_type_permissions_by_tenant`
  - `delete_user_types_by_tenant`
  - `delete_tenant`
  - `confirm_no_signup_residue`
  - `confirm_no_tenant_residue`

Verificacao final de residuos:
- `tenants` com prefixo `smoke-web-*`: vazio
- `access_signup_requests` com prefixo `smoke-web-*`: vazio

## Correcao aplicada
- Arquivo: [index.ts](C:/Users/caio.rossoni/Downloads/Promo/supabase/functions/account-access-request/index.ts)
- Mudancas:
  - provisionamento garantido de `user_types` por `tenant/role`;
  - semeadura de permissoes recomendadas em `user_type_permissions`;
  - baseline criado no `register_company`;
  - `review_request` usando resolucao garantida (elimina `user_type_not_configured` em tenant novo).

## Artefatos atualizados
- Script: [smoke-web-signup.mjs](C:/Users/caio.rossoni/Downloads/Promo/scripts/smoke-web-signup.mjs)
- Runbook: [ops-runbook.md](C:/Users/caio.rossoni/Downloads/Promo/docs/ops-runbook.md)

## Conclusao
- O fluxo de cadastro web solicitado (conta empresa + conta interna com aprovacao/edicao + qualidade de dados) esta validado em producao isolada e aprovado.
