# Allowlist de Limpeza

Esta lista evita remocoes incorretas quando a analise estatica sinaliza falso positivo.

## Web (`promo_APP_Web`)
- `autoprefixer`: usado indiretamente via `postcss.config.js`.
- `postcss`: usado indiretamente via `postcss.config.js`.
- `depcheck invalidFiles`: `tsconfig.app.json` e `tsconfig.node.json` usam JSONC (comentarios), nao JSON puro.

## Windows (`promo_APP_Windows`)
- `wait-on`: invocado em `desktop:dev`.
- `typescript`: mantido para `tsc --noEmit` e manutencao de configs TS.

## OwnerWindows (`promo_APP_OwnerWindows`)
- `wait-on`: invocado em `desktop:dev`.
- `typescript`: mantido para `tsc --noEmit` e manutencao de configs TS.

## Linux (`promo_APP_Linux`)
- `wait-on`: invocado em `desktop:dev`.
- `typescript`: mantido para `tsc --noEmit` e manutencao de configs TS.
