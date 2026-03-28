# Validacao pos-correcao do env-doctor (2026-03-28)

- Workspace: `C:\Users\caio.rossoni\Downloads\Promo`
- Gerado em: `2026-03-28T16:10:00Z`
- Runtime usado na execucao desta rodada: `Node 24.14.1` / `npm 11.11.0` (compativel com baseline `>=20` / `>=10`)
- Resultado geral: **PASS**

## Matriz de comandos (PASS/FAIL)

| Comando | Resultado |
| --- | --- |
| `node -v` | PASS |
| `npm -v` | PASS |
| `npm run env:doctor` | PASS |
| `npm run supabase:test` | PASS |
| `npm run supabase:validate:access` | PASS |
| `npm run smoke:web:signup` | PASS |
| `npm run smoke:rbac` | PASS |
| `npm run alerts:dispatch:dry` | PASS |
| `npm --prefix promo_APP_Web run lint` | PASS |
| `npm --prefix promo_APP_Web run test` | PASS |
| `npm --prefix promo_APP_Web run build` | PASS |
| `npm --prefix promo_APP_Web run build:embedded` | PASS |
| `npm run windows:build` | PASS |
| `npm run linux:build` | PASS |
| `npm run owner:build` | PASS |
| `npm run android:build` | PASS |

## Conclusao

- Correcao do gate de ambiente aplicada e validada.
- Nenhuma regressao funcional detectada na matriz completa.
- CI agora usa `.nvmrc` como fonte de versao e executa gate de runtime (`env-doctor --node-only`) antes das etapas principais.
- Observacao operacional local: o Node 18 em `C:\Program Files\nodejs` ainda tem precedencia no PATH global; para baseline imediato foi usado PATH da instalacao user-scope do Node LTS. A correcao permanente exige atualizar/remover a instalacao antiga com elevacao.
