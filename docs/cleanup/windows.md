# promo_APP_Windows - Relatorio de Limpeza

## Inventario (etapa 0)
- `npx ts-prune -p tsconfig.json`: sem exports orfaos reportados.
- `depcheck`: falsos positivos em `typescript` e `wait-on` (uso por tooling/script).
- `npm run build` e `npm run desktop:build:win`: verdes.

## Remover agora
- Sem remocao de codigo/dependencia nesta rodada (modo moderado).

## Revisar manualmente
- `wait-on`: usado no script `desktop:dev`.
- `typescript`: usado para typecheck (`tsc --noEmit`) e manutencao de configs TS.

## Ajustes de contrato
- Adicionados scripts:
  - `lint`
  - `cleanup:depcheck`
  - `cleanup:analyze`
  - `cleanup:verify`

## Gate da etapa
- `npm run cleanup:verify` verde.
