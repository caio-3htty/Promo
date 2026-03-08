# Multi-App Split (Prumo)

Este workspace recebeu o bootstrap de quatro aplicações:

- `apps/prumo-web-client` (código atual na raiz)
- `apps/prumo-android-client`
- `apps/prumo-windows-client`
- `apps/prumo-owner-windows`
- pacote compartilhado: `packages/prumo-core`

## Repositórios separados (passo sugerido)

1. Criar 4 repositórios no GitHub.
2. Copiar cada pasta para seu repositório dedicado.
3. Publicar `packages/prumo-core` como dependência interna ou submódulo.
4. Versionar `@prumo/core` por tag semver.

## Contrato mínimo entre apps

- Mesmo Supabase.
- Mesma função SQL de autorização: `public.user_has_permission(...)`.
- Mesmo catálogo de permissões.
- Mesmo conjunto de idiomas: `pt-BR`, `en`, `es`.
