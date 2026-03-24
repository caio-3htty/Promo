# TCC Gap Matrix - Baseline x Requisito Real

Data base: 24/03/2026

## Resumo executivo
- Estrutura base: pronta e estável (auth, RBAC, CRUDs, deploy, apps shell).
- Gap principal: transformar operação de cadastro em motor de decisão orientado a risco e exceções.
- Status geral por prioridade:
  - P1: **em implementação nesta entrega**
  - P2: **parcial -> consolidado nesta entrega**
  - P3: **parcial -> consolidado nesta entrega**
  - P4: **faltante -> implementado nesta entrega**
  - P5: **parcial -> consolidado nesta entrega**

## Matriz de aderência
| Módulo/Requisito | Estado anterior | Estado desta entrega | Evidência |
|---|---|---|---|
| Segurança por obra/role (RLS) | Parcial | Consolidado | policies + trigger de workflow por permissão |
| Estoque com incerteza (`ultima_atualizacao_estoque`, `atualizado_por`, `confiabilidade`) | Parcial (`atualizado_em`) | Consolidado | migration `20260324110000_*` |
| Pedido com estados reais (`Criado` -> `Entregue`/`Atrasado`) | Antigo (`pendente/aprovado/enviado`) | Consolidado | migration + UI `PedidosCompraManager` |
| Código de compra obrigatório no fechamento | Parcial (apenas recebimento) | Consolidado | trigger `enforce_pedidos_workflow` + UI |
| Alertas como motor de decisão (repetição/escalonamento/ACK/e-mail) | Parcial | Consolidado | `executar_ciclo_notificacoes` + tela `AlertasManager` |
| Substituição de material + reposição futura | Parcial (schema) | Consolidado | RPC `register_material_substitution` + tela |
| UX rápida almoxarife (<30s por operação) | Faltante | Consolidado | tela `AlmoxarifeRapido` |
| Relatórios (PDF + e-mail + métricas) | Parcial | Consolidado | `pedido-report` + tela `RelatoriosPedidos` |

## Critérios de aceite por prioridade
- P1: regra de transição de pedido e fechamento com código de compra obrigatórios.
- P2: alerta abre, repete, escala, permite ACK e encerramento.
- P3: substituição gera registro auditável e pedido de reposição vinculado.
- P4: almoxarife recebe pedido e atualiza estoque por fluxo rápido sem digitação complexa.
- P5: relatório exporta PDF, permite envio por e-mail e exibe métricas operacionais.

## Backlog residual (pós-entrega)
1. Calibração fina de fórmula de confiabilidade por tipo de material/obra.
2. SLA de alerta parametrizável por tenant (24h/12h/etc).
3. Dashboard histórico de tempo de resolução de alertas.
4. Pesquisa com usuários de campo para benchmark de tempo por tarefa.
