# promo_APP_Linux - Relatorio de Limpeza

## Inventario (etapa 0)
- `npx ts-prune -p tsconfig.json`: sem exports orfaos reportados.
- `depcheck`: falsos positivos em `typescript` e `wait-on`.
- `npm run build` e `npm run desktop:prepare:web`: verdes.

## Remover agora
- Sem remocao de codigo/dependencia nesta rodada (modo moderado).

## Revisar manualmente
- `wait-on`: usado no script `desktop:dev`.
- `typescript`: mantido para typecheck e manutencao TS.
- `desktop:build:linux` em Windows falha por privilegio de symlink (`ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`).

## Ajustes de contrato
- Adicionados scripts:
  - `lint`
  - `cleanup:depcheck`
  - `cleanup:analyze`
  - `cleanup:verify` (sem empacotamento Linux final no Windows)

## Gate da etapa
- `npm run cleanup:verify` verde.
- `npm run desktop:build:linux` falha esperada em Windows; validar pacote final em CI Ubuntu.
