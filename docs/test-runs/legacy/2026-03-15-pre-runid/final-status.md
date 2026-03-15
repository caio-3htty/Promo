# Status Final - 2026-03-15

Resultado geral: **BLOQUEADO**

## Passou
- Wave 1 (`cleanup:full-pass`): PASS
- Wave 4 gate web (`promo_APP_Web ci:verify`): PASS

## Falhou (bloqueio de ambiente)
- `supabase:test`: faltam `SUPABASE_URL` e `SUPABASE_ANON_KEY`
- `supabase:validate:access`: faltam `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VALIDATION_LOGIN_EMAIL`, `VALIDATION_LOGIN_PASSWORD`
- `smoke:rbac`: faltam `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_TENANT_ID` e credenciais smoke (`SMOKE_*`)
- `alerts:dispatch:dry`: faltam `SUPABASE_PROJECT_REF` e `SUPABASE_SERVICE_ROLE_KEY`

## Proximo passo para destravar
1. Exportar variaveis obrigatorias no ambiente (ou `.env` local fora do git).
2. Reexecutar:
   - `npm run test:waves:wave2`
   - `npm run test:waves:wave4`
3. Preencher checklists manuais:
   - `wave3-manual-checklist.md`
   - `wave4-manual-checklist.md`
