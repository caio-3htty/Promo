# Multi-App Split (Prumo)

Este workspace agora possui 4 apps conectados ao mesmo Supabase:

- `prumo-web-client` (Vite + React)
- `prumo-android-client` (Expo)
- `prumo-windows-client` (React + Vite)
- `prumo-owner-windows` (React + Vite, foco em recuperacao/template)

## Repositorios publicados

- `prumo-web-client`: https://github.com/caio-3htty/prumo-web-client
- `Promo_APP_Android`: https://github.com/caio-3htty/Promo_APP_Android
- `Promo_APP_Windows`: https://github.com/caio-3htty/Promo_APP_Windows
- `prumo-owner-windows`: https://github.com/caio-3htty/prumo-owner-windows

## CI/CD configurado

- `prumo-web-client`
  - `ci.yml`: build + test
  - `deploy-vercel.yml`: deploy de producao na Vercel (secrets necessarios)
- `prumo-android-client`
  - `ci.yml`: typecheck
  - `eas-build-android.yml`: build Android via EAS (workflow manual)
- `prumo-windows-client`
  - `ci.yml`: build web
  - `release.yml`: gera instalador NSIS (`.exe`) no GitHub Actions
- `prumo-owner-windows`
  - `ci.yml`: build web
  - `release.yml`: gera instalador NSIS (`.exe`) no GitHub Actions

## Configuracao minima para funcionar

### Variaveis do GitHub Actions

- `prumo-web-client`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_PUBLISHABLE_KEY`
- `prumo-owner-windows`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- `Promo_APP_Windows`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- `Promo_APP_Android`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

### Secrets do GitHub Actions

- `Promo_APP_Android`
  - `EXPO_TOKEN` (obrigatorio para build EAS real)

## Contrato minimo entre apps

- Mesmo Supabase (URL e keys por `.env`).
- Mesma funcao SQL de autorizacao: `public.user_has_permission(...)`.
- Mesmo catalogo de permissoes.
- Mesmo conjunto de idiomas: `pt-BR`, `en`, `es`.

## Execucao rapida

### Web Client

```bash
cd prumo-web-client
cp .env.example .env
npm install
npm run dev
```

### Owner Windows

```bash
cd prumo-owner-windows
cp .env.example .env
npm install
npm run dev
```

### Windows Client

```bash
cd prumo-windows-client
cp .env.example .env
npm install
npm run dev
```

### Android Client

```bash
cd prumo-android-client
cp .env.example .env
npm install
npm run start
```

### Android EAS (preview)

```bash
# no GitHub Actions (Promo_APP_Android):
# Workflow: android-eas-build
# Input: profile=preview
```
