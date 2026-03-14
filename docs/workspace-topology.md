# Workspace Topology (Promo)

## Repositorios e responsabilidade
- `Promo` (raiz): orquestracao, docs, scripts de smoke e ativos Supabase compartilhados.
- `promo_APP_Web`: app web canonico.
- `promo_APP_OwnerWindows`: app desktop owner-control (Electron + Vite).
- `promo_APP_Windows`: shell desktop do web (Electron) para Windows e Linux.
- `promo_APP_Android`: shell Android do web (Capacitor).
- `packages/prumo-core`: contratos compartilhados no workspace.
- `supabase`: migrations, funcoes Edge e configuracao.

## Fonte de verdade da interface
- UI e regras principais residem no `promo_APP_Web`.
- `promo_APP_Windows` (Windows/Linux) e `promo_APP_Android` embutem o build `embedded` do web.

## CI/CD
- Cada `promo_APP_*` possui seu proprio workflow de CI/release no respectivo repositorio.
- `Promo` mantem apenas workflows de governanca operacional (smoke RBAC e dispatch de alertas).

## Regras de higiene
- Nao commitar artefatos gerados: `dist/`, `release/`, `web-dist/`, `android/app/build/`, `node_modules/`, caches.
- Manter `.env` fora do Git. Apenas `.env.example` e variaveis nos provedores de secret.
