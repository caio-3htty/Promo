# Multi-App Split (Prumo)

Este workspace agora possui 4 apps conectados ao mesmo Supabase:

- `apps/prumo-web-client` (Vite + React)
- `apps/prumo-android-client` (Expo)
- `apps/prumo-windows-client` (React + Vite)
- `apps/prumo-owner-windows` (React + Vite, foco em recuperacao/template)

## Repositorios publicados

- `prumo-web-client`: https://github.com/caio-3htty/prumo-web-client
- `prumo-android-client`: https://github.com/caio-3htty/prumo-android-client
- `prumo-windows-client`: https://github.com/caio-3htty/prumo-windows-client
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

## Contrato minimo entre apps

- Mesmo Supabase (URL e keys por `.env`).
- Mesma funcao SQL de autorizacao: `public.user_has_permission(...)`.
- Mesmo catalogo de permissoes.
- Mesmo conjunto de idiomas: `pt-BR`, `en`, `es`.

## Execucao rapida

### Web Client

```bash
cd apps/prumo-web-client
cp .env.example .env
npm install
npm run dev
```

### Owner Windows

```bash
cd apps/prumo-owner-windows
cp .env.example .env
npm install
npm run dev
```

### Windows Client

```bash
cd apps/prumo-windows-client
cp .env.example .env
npm install
npm run dev
```

### Android Client

```bash
cd apps/prumo-android-client
cp .env.example .env
npm install
npm run start
```
