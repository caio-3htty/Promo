# Workspace Topology (Prumo)

## Repositorios e responsabilidade
- `Promo` (raiz): orquestracao, docs, scripts de smoke e assets de apoio.
- `prumo-web-client`: app web canonico.
- `prumo-owner-windows`: app desktop owner-control (Electron + Vite).
- `Promo_APP_Windows` (`prumo-windows-client`): shell desktop do web (Electron).
- `Promo_APP_Android` (`prumo-android-client`): shell Android do web (Capacitor).
- `packages/prumo-core`: contratos compartilhados.
- `supabase`: migrations, seeds e configuracao.

## Fonte de verdade da interface
- UI e regras principais residem no `prumo-web-client`.
- Windows e Android embutem o build `embedded` do web.

## CI/CD por app
- Web: `ci.yml` + `deploy-vercel.yml`.
- Windows client: `desktop-ci` + `desktop-release` (`.exe`, `.AppImage`, `.deb`).
- Android client: `android-ci` + `android-build` (APK debug).
- Owner Windows: `ci.yml` + `release.yml` (NSIS).

## Regras de higiene
- Nao commitar artefatos gerados: `dist/`, `release/`, `web-dist/`, `android/app/build/`, `node_modules/`, caches.
- Usar scripts de limpeza (`clean`) antes de abrir PR quando necessario.
