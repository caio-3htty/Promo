# Governance Onboarding Final - 2026-03-20

## Status
- Resultado final: **APROVADO**
- Escopo: governanca e onboarding web + supabase

## Commits publicados
- Promo (workspace): `3a4a7dd` (inclui `e3b6bb5` no historico imediato)
- promo_APP_Web: `d28b1e4`

## Supabase aplicado
- Migration: `20260320110000_governanca_onboarding_hierarchy.sql` aplicada em `awkvzbpnihtgceqdwisc`.
- Functions publicadas:
  - `account-access-request`
  - `admin-user-provision`

## Evidencias tecnicas
- Web CI verify: `wave-web/ci_verify.log` (PASS)
- Supabase validate access: `wave-supabase/supabase_validate_access.log` (PASS)
- Smoke RBAC: `wave-supabase/smoke_rbac.log` (16/16 PASS)
- Contratos de function: `wave-supabase/function_contracts.json` (PASS)
- Vercel smoke HTTP: `vercel_smoke_http.txt` (`/`, `/login`, `/obras`, `/usuarios-acessos` = 200)

## Observacoes
- `admin-user-provision` exige Bearer JWT no corpo de execucao da function e valida token internamente via `supabase.auth.getUser`.
- Existem arquivos locais nao versionados de utilitario (`scripts/create-chat-zips*.ps1`) mantidos fora deste fechamento.
