# Promo Workspace

Workspace de orquestracao do ecossistema Promo.

## Mapa oficial de repositorios
| Nome local | Repositorio GitHub | Finalidade |
| --- | --- | --- |
| `Promo` | `Promo` | Workspace, docs, scripts de operacao e assets compartilhados |
| `promo_APP_Web` | `promo_APP_Web` | App web principal |
| `promo_APP_Android` | `promo_APP_Android` | App Android nativo (Kotlin/Gradle) |
| `promo_APP_Windows` | `promo_APP_Windows` | Shell desktop dedicado para Windows |
| `promo_APP_Linux` | `promo_APP_Linux` | Shell desktop dedicado para Linux |
| `promo_APP_OwnerWindows` | `promo_APP_OwnerWindows` | App owner-control desktop |

## Status de publicacao (2026-03-15)
- Publicacao consolidada em `main` nos 6 repositorios do ecossistema.
- Politica de branch: `main` como branch oficial; `codex/*` apenas temporarias por ciclo e removidas apos merge/fechamento.
- Checklist minimo para novos releases: sem PR aberto, CI critica verde em `main`, smoke de producao e evidencias em `docs/test-runs/`.
- Snapshot de fechamento: `docs/test-runs/2026-03-15/publication-sync-final.md`.

## Requisitos
- Node.js 20+
- npm 10+

```bash
nvm use
```

## Fluxo operacional da raiz
```bash
npm run env:doctor
npm run supabase:test
npm run supabase:validate:access
npm run smoke:rbac
npm run alerts:dispatch:dry
npm run windows:build
npm run linux:build
npm run android:doctor
npm run android:build
```

## Conexao Supabase (padrao fixo no codigo)
- Scripts da raiz usam `scripts/lib/env-resolver.mjs` e carregam automaticamente `.env`/`.env.local` da raiz e dos apps.
- Se `SUPABASE_URL` nao existir, a URL e derivada de `SUPABASE_PROJECT_REF` (default `awkvzbpnihtgceqdwisc`).
- Alias aceitos: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`.
- Segredos continuam fora do Git (apenas em `.env` local/Secrets de CI/Vercel/Supabase).

## Limpeza
```bash
npm run clean
npm run clean:all
```

Fluxo canonico:
- `npm run clean`: limpa apenas artefatos locais da raiz.
- `npm run clean:all`: limpa raiz + apps detectados no workspace (web, windows, linux, owner e android nativo), com skip automatico para pastas ausentes.

## Code Hygiene Pass
```bash
npm run cleanup:web
npm run cleanup:android
npm run cleanup:windows
npm run cleanup:owner
npm run cleanup:linux
```

Execucao completa:
```bash
npm run cleanup:full-pass
```

Relatorios e allowlists: `docs/cleanup/`.

## Master Test Waves
```bash
npm run test:waves:auto
```

Ondas individuais:
```bash
npm run test:waves:wave1
npm run test:waves:wave2
npm run test:waves:wave3
npm run test:waves:wave4
```

Execucao completa (inclui wave3 automatizada):
```bash
npm run test:waves:full
```

Evidencias: `docs/test-runs/<YYYY-MM-DD>/<run-id>/`.

## Leituras recomendadas
- `docs/workspace-topology.md`
- `docs/ops-runbook.md`
- `docs/web-release-checklist.md`
- `docs/cleanup/README.md`
- `docs/test-runs/README.md`
- `docs/test-runs/env-contract.md`
- `docs/test-runs/release-approval-checklist.md`
