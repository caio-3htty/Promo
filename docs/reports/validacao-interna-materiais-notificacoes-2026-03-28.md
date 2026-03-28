# Validacao interna: materiais + conta limpa + notificacoes (2026-03-28)

- Gerado em: `2026-03-28T16:31:54.197Z`
- Ambiente: producao isolada (smoke write com cleanup)
- Resultado geral: **PASS**

| Etapa | Comando | Status | Duracao | Causa-raiz (se FAIL) |
| --- | --- | --- | ---: | --- |
| Signup web (conta limpa + aprovacao) | `npm run smoke:web:signup` | PASS | 10.0s | - |
| RBAC interno (materiais + estoque + notificacoes) | `npm run smoke:rbac` | PASS | 7.9s | - |
| Alertas dry-run | `npm run alerts:dispatch:dry` | PASS | 1.7s | - |

## Resumo
- PASS: 3
- FAIL: 0

## Pendencias
- Nenhuma pendencia bloqueante neste ciclo.
