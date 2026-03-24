# Backlog Priorizado de Execução - TCC

Data base: 24/03/2026

## Ordem de execução oficial

| Prioridade | Item | Dono técnico | Dependência | Status |
|---|---|---|---|---|
| P1 | RLS + workflow de pedido + estoque com confiabilidade | Backend/Supabase + Web | Nenhuma | Implementado |
| P2 | Motor de alertas com ACK/escalonamento/e-mail | Backend/Supabase + Web | P1 | Implementado |
| P3 | Substituição de material + reposição automática | Backend/Supabase + Web | P1 | Implementado |
| P4 | Fluxo rápido do almoxarife | Web | P1 | Implementado |
| P5 | Relatórios PDF + envio + métricas/logs | Web + Edge Functions | P2/P3 | Implementado |

## Riscos de execução e mitigação
1. Drift de schema entre local e produção.
- Mitigação: rodar `npx supabase db push` + smoke write isolado antes do release.

2. Bloqueio por permissão em novos módulos.
- Mitigação: revisar grants de `notifications.*`, `incidentes.*`, `reports.*` por user type.

3. Adoção de campo (almoxarife não usar).
- Mitigação: validação de tempo real por tarefa e ajuste de UX por observação.

## Checklist de release
- Migration aplicada e funções atualizadas.
- Web build + build embedded aprovados.
- Smoke de banco/auth/alertas/substituição aprovado.
- Relatório PDF gerado e enviado por e-mail com sucesso.
