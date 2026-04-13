# Validacao interna: onboarding + governanca + isolamento + notificacoes (2026-04-13)

- Gerado em: `2026-04-13T20:04:31.526Z`
- Ambiente: producao isolada (smoke write com cleanup)
- Resultado geral: **PASS**

| Etapa | Comando | Status | Duracao | Causa-raiz (se FAIL) |
| --- | --- | --- | ---: | --- |
| Signup web (conta limpa + aprovacao) | `npm run smoke:web:signup` | PASS | 13.4s | - |
| RBAC interno (materiais + estoque + notificacoes) | `npm run smoke:rbac` | PASS | 7.4s | - |
| Isolamento tenant/obra (tabelas criticas) | `npm run smoke:tenant:isolation` | PASS | 9.4s | - |
| Health check de governanca | `npm run governance:health` | PASS | 3.3s | - |
| Alertas dry-run | `npm run alerts:dispatch:dry` | PASS | 3.1s | - |

## Resumo
- PASS: 5
- FAIL: 0

## Pendencias
- Nenhuma pendencia bloqueante neste ciclo.
