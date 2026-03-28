# Validacao Web Completa (2026-03-28)

- Gerado em: 2026-03-28T13:32:57-03:00
- Ambiente: producao isolada (tenant temporario + cleanup)
- Runtime efetivo: v24.14.1 / 11.11.0
- Resultado geral: **PASS**

| Onda | Prioridade | Etapa | Comando | Status | Duracao | Causa-raiz (se FAIL) |
| --- | --- | --- | --- | --- | ---: | --- |
| Onda 1 | P1 | Supabase connectivity/auth/read gate | `npm run supabase:test` | PASS | 2.79s | - |
| Onda 1 | P1 | Supabase login/access validation | `npm run supabase:validate:access` | PASS | 3.15s | - |
| Onda 2 | P1 | Smoke web signup (empresa + interna + cleanup) | `npm run smoke:web:signup` | PASS | 10.53s | - |
| Onda 2 | P1 | Smoke RBAC materiais/estoque/notificacoes | `npm run smoke:rbac` | PASS | 8.01s | - |
| Onda 2 | P1 | Alert dispatch dry-run | `npm run alerts:dispatch:dry` | PASS | 1.7s | - |
| Onda 2 | P1 | Smoke interno consolidado | `npm run smoke:internal:full` | PASS | 20.74s | - |
| Onda 3 | P2 | Web CI verify (lint+test+build+bundle checks) | `npm --prefix promo_APP_Web run ci:verify` | PASS | 36.61s | - |
| Onda 3 | P2 | Web embedded build | `npm --prefix promo_APP_Web run build:embedded` | PASS | 7.23s | - |

## Resumo
- PASS: 8
- FAIL: 0
- Pendencias bloqueantes: nenhuma.

## Criterios de aceite (check)
- Banco/Auth: PASS
- Signup/conta limpa/cleanup: PASS
- RBAC/materiais/notificacoes: PASS
- Regressao tecnica web: PASS
