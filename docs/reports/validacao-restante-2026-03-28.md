# Validacao Restante - 2026-03-28

## Escopo
- Workspace: `C:\Users\caio.rossoni\Downloads\Promo`
- Ambiente alvo: producao isolada para smokes de escrita
- Janela de execucao: 2026-03-28 10:18 a 10:25 (America/Sao_Paulo)

## Ambiente
- Node: `18.18.1`
- npm: `9.8.1`
- Android doctor: `PASS`
- Observacao: baseline oficial continua Node `>=20` e npm `>=10`.

## Matriz de comandos (PASS/FAIL)
| Onda | Comando | Resultado | Evidencia curta |
|---|---|---|---|
| Pre-check | `npm run env:doctor` | FAIL | Falha de baseline: Node 18/npm 9 abaixo do contrato |
| Pre-check | `npm run android:doctor` | PASS | Ambiente Android validado |
| Banco/Auth | `npm run supabase:test` | PASS | connectivity/auth/read PASS |
| Banco/Auth | `npm run supabase:validate:access` | PASS | login + profile + obras + edge function PASS |
| Banco/Auth | `npm run smoke:web:signup` | PASS | 4/4 cenarios PASS + cleanup PASS |
| Banco/Auth | `npm run smoke:cross-app:write` | PASS | PASS com tenant isolado e limpeza |
| Banco/Auth | `npm run smoke:rbac` | PASS | 16/16 checks PASS |
| Banco/Auth | `npm run alerts:dispatch:dry` | PASS | dry run sem erro |
| Web | `npm --prefix promo_APP_Web run lint` | PASS | eslint sem falhas |
| Web | `npm --prefix promo_APP_Web run test` | PASS | 4 testes PASS |
| Web | `npm --prefix promo_APP_Web run build` | PASS | build prod concluido |
| Web | `npm --prefix promo_APP_Web run build:embedded` | PASS | build embedded concluido |
| Desktop | `npm run windows:build` | PASS | setup `.exe` gerado |
| Linux local | `npm run linux:build` | PASS | `desktop:prepare:web` concluido |
| Owner | `npm run owner:build` | PASS | build concluido |
| Android | `npm run android:build` | PASS | pipeline completo verde (exit code 0) |

## Causas-raiz e correcoes aplicadas na validacao
- Nenhuma falha funcional P1/P2 encontrada nesta rodada.
- Falha residual de tooling (`env:doctor`) permanece por versoes locais fora do baseline.
  - Causa-raiz: maquina local ainda com Node 18/npm 9.
  - Status: nao bloqueou execucao funcional dos testes desta rodada, mas continua pendencia operacional.
  - Acao recomendada: atualizar para Node 20+ e npm 10+ para alinhamento total do contrato.

## Commits e higiene Git
Snapshot coletado ao final dos testes, antes do commit deste relatorio.

| Repo | Commit (snapshot) | Git status |
|---|---|---|
| Promo | `0b45e51` | clean |
| promo_APP_Web | `f132d13` | clean |
| promo_APP_Windows | `42ed45b` | clean |
| promo_APP_Linux | `905c7fa` | clean |
| promo_APP_OwnerWindows | `ba9a1ea` | clean |
| promo_APP_Android | `cdcb842` | clean |

## Pendencias finais (priorizadas)
- P3: atualizar runtime local para Node `>=20` e npm `>=10` para eliminar FAIL do `env:doctor`.
- P1/P2: zero bloqueantes.

## Conclusao
- Validacao funcional restante concluida com sucesso.
- Todos os gates funcionais (banco/auth/smokes/rbac/alertas/web/desktop/linux local/owner/android) ficaram `PASS`.
- Unica pendencia aberta e de baseline de tooling local.
