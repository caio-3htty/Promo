# Multi-App Split (Prumo)

Este workspace agora possui 4 apps com bootstrap funcional e conexão no mesmo Supabase:

- `apps/prumo-web-client` (app web principal continua na raiz por enquanto)
- `apps/prumo-android-client` (Expo)
- `apps/prumo-windows-client` (React + Vite)
- `apps/prumo-owner-windows` (React + Vite, foco em RPCs owner)
- pacote compartilhado: `packages/prumo-core`

## Contrato mínimo entre apps

- Mesmo Supabase (URL e keys por `.env`).
- Mesma função SQL de autorização: `public.user_has_permission(...)`.
- Mesmo catálogo de permissões.
- Mesmo conjunto de idiomas: `pt-BR`, `en`, `es`.

## Execução rápida

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

## Repositórios separados (passo sugerido)

1. Criar 4 repositórios no GitHub.
2. Copiar cada pasta para seu repositório dedicado.
3. Publicar `packages/prumo-core` como dependência interna ou submódulo.
4. Versionar `@prumo/core` por tag semver.
