# Prumo Windows Client

Cliente desktop Windows do Prumo.

## Stack
- React + Vite
- Supabase JS
- Electron (empacotamento desktop)

## Requisitos
- Node.js 20+
- npm 10+

## Rodar local (web)
```bash
npm install
cp .env.example .env
npm run dev
```

## Rodar local (desktop)
```bash
npm run desktop:dev
```

## Gerar instalador Windows (.exe)
```bash
npm run desktop:build
```
Artefatos em `release/`.

## Variaveis de ambiente
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## GitHub Actions
- `windows-ci`: valida build web.
- `windows-release`: gera instalador NSIS e publica artefato no workflow.

# Promo_APP_Windows
