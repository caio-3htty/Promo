# Web Release Checklist (Promo 2026)

## 1) Preparacao
- Confirmar branch com migrations versionadas em `supabase/migrations`.
- Confirmar variaveis do app web (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Confirmar variaveis das Edge Functions (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`).

## 2) Quality Gate (`promo_APP_Web`)
- Confirmar workflow ativo no repositorio web.
- `npm --prefix promo_APP_Web run lint`
- `npm --prefix promo_APP_Web run test`
- `npm --prefix promo_APP_Web run build`

## 3) Banco e seguranca
- Aplicar migrations em homologacao.
- Validar RLS por obra: usuario obra A sem acesso a obra B (exceto gestor/master).
- Validar permissoes: `pedidos.plan`, `notifications.*`, `incidentes.*`, `reports.*`, `orcamento.*`.

## 4) Smoke homologacao (workspace `Promo`)
- `npm run smoke:rbac`
- `npm run alerts:dispatch:dry`
- `npm run alerts:dispatch` (com `RESEND_API_KEY` configurada)
- Confirmar workflows na raiz:
  - `.github/workflows/alerts-dispatch-dry.yml`
  - `.github/workflows/smoke-rbac.yml`
  - `.github/workflows/alerts-dispatch-live.yml`
- Fluxos criticos:
  - almoxarife rapido
  - alertas + ACK
  - substituicao + reposicao
  - PDF por pedido

## 5) Deploy
- Deploy do repositorio `promo_APP_Web` na Vercel.
- Validar rotas:
  - `/alertas`
  - `/dashboard/:obraId/pedidos-planejamento`
  - `/dashboard/:obraId/substituicoes`
  - `/dashboard/:obraId/almoxarife-rapido`

## 6) Rollback
- Reverter deploy Vercel para build anterior.
- Se necessario, desabilitar gatilhos de notificacao por update de permissao (sem apagar dados).
- Registrar incidente e causa raiz no `docs/ops-runbook.md`.
