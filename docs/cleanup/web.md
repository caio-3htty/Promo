# promo_APP_Web - Relatorio de Limpeza

## Inventario (etapa 0)
- `npx ts-prune -p tsconfig.json`: sem exports orfaos reportados.
- `depcheck`: apontou apenas `@hookform/resolvers`, `@tailwindcss/typography`, `@testing-library/react` como sem uso.
- `npm run lint`, `npm run test`, `npm run build`: verdes.

## Remover agora (executado)
- Removidas dependencias:
  - `@hookform/resolvers`
  - `@tailwindcss/typography`
  - `@testing-library/react`

## Revisar manualmente
- `depcheck` marca `tsconfig.app.json` e `tsconfig.node.json` como `invalidFiles` por comentarios JSONC.
- `autoprefixer` e `postcss` entram em allowlist por uso indireto em `postcss.config.js`.

## Gate da etapa
- `npm run cleanup:verify` verde (inclui `lint + test + build + bundle:report + bundle:check`).
