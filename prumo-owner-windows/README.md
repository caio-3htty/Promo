# Prumo Owner Windows

Aplicativo desktop exclusivo do dono do Prumo.

## Escopo
- Login no Supabase.
- Publicar/ativar versoes de template via RPC.
- Recuperacao de dados (soft-delete e versao de campo) via RPC.
- Sem CRUD operacional direto.

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
- `owner-windows-ci`: valida build web.
- `owner-windows-release`: gera instalador NSIS e publica artefato no workflow.
