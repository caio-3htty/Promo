# Relatório Técnico de Validação de Falhas

Data: 22/03/2026
Ambiente alvo: produção (com smoke write isolado)

## Resultado executivo
- Status geral: **VERDE**.
- Banco/Auth em produção: **PASS** (login E2E, leitura e sanity de edge function).
- Fluxo interno completo (criar pendente, aprovar, autenticar e obter escopo mínimo): **PASS**.
- Matriz multi-app (web, windows, linux prepare local, owner e android): **PASS**.

## Evidências de execução (22/03/2026)

| Comando | Resultado | Evidência resumida |
|---|---|---|
| `npm run supabase:test` | PASS | connectivity/auth/read OK |
| `npm run supabase:validate:access` | PASS | login real + profile + tenant + edge function OK |
| `npm run smoke:cross-app` | PASS | leitura cross-app OK |
| `npm run smoke:cross-app:write` | PASS | tenant isolado criado/aprovado/logado/limpo com sucesso |
| `npm --prefix promo_APP_Web run lint` | PASS | sem erros |
| `npm --prefix promo_APP_Web run test` | PASS | 2 arquivos, 4 testes PASS |
| `npm --prefix promo_APP_Web run build` | PASS | build Vite concluído |
| `npm --prefix promo_APP_Web run build:embedded` | PASS | build embedded concluído |
| `npm run windows:build` | PASS | instalador `.exe` gerado |
| `npm run linux:build` | PASS | `desktop:prepare:web` local OK |
| `npm run owner:build` | PASS | build owner concluído |
| `node scripts/android-gradle.mjs :feature-pedidos:compileDebugKotlin` | PASS | compileDebugKotlin OK |
| `node scripts/android-gradle.mjs lintDebug testDebugUnitTest assembleDebug` | PASS | pipeline gradle verde |

## Ações executadas para remover causa-raiz
- Publicado `db push` com as migrations:
  - `20260322130000_access_signup_reviewed_obras.sql`
  - `20260322151000_user_signup_phone_validation.sql`
- Deploy em produção das edge functions:
  - `account-access-request`
  - `admin-user-provision`
- Revalidação imediata após deploy com `smoke:cross-app:write` (PASS).

## Evidências de segurança (sem segredos)
- Nenhum log de senha/token foi persistido.
- Dados de smoke write foram isolados em tenant temporário e removidos ao final.

## Conclusão técnica
- O bloqueio de acesso por drift de backend foi resolvido.
- Não há pendência funcional bloqueante aberta nesta rodada de validação.
