# Relatório Operacional de Pendências e Melhorias

Data: 22/03/2026

## Status de pendências
- Pendências **P1 bloqueantes**: **0**.
- Pendências ativas: melhorias operacionais e governança de release.

## Backlog curto (ação, dono, prazo)

| Prioridade | Ação | Dono sugerido | Prazo alvo |
|---|---|---|---|
| P2 | Publicar PRs dos repos alterados (`Promo`, `promo_APP_Web`, `promo_APP_Android`) com evidências PASS | Engenharia apps | 23/03/2026 |
| P2 | Adicionar gate CI para `smoke:cross-app:write` antes de release backend | DevOps | 24/03/2026 |
| P2 | Fixar baseline local para Node 20+/npm 10+ (ambiente atual executou com Node 18) | Plataforma | 24/03/2026 |
| P3 | Unificar catálogo de mensagens amigáveis Web/Android por código de erro | Frontend + Android | 25/03/2026 |
| P3 | Documentar checklist de deploy Supabase (migration + function + smoke write) no runbook de release | Backend | 25/03/2026 |

## Planejamento de falhas contínuo (conta "do zero")

### Cenários obrigatórios por ciclo
1. Cadastro interno sem empresa selecionada deve bloquear no cliente e no backend.
2. Cadastro interno com `tenantId` inválido deve retornar erro funcional claro.
3. Aprovação sem escopo mínimo para perfil operacional deve falhar com mensagem explícita.
4. Aprovação com edição de usuário/cargo/perfil deve persistir revisão sem expor senha.
5. Login pós-aprovação deve permitir leitura operacional mínima.
6. Rejeição deve manter usuário inativo e sem acesso.

### Gates de aceite
- Gate 1 (Banco/Auth): `supabase:test` + `supabase:validate:access` = PASS.
- Gate 2 (Write isolado): `smoke:cross-app:write` = PASS.
- Gate 3 (Portabilidade): web/windows/linux-prepare/owner/android = PASS.
- Gate 4 (Governança): branch + PR por repo alterado e status git limpo após commits.

## Pontos a melhorar
- Automatizar geração do relatório de validação para reduzir divergência manual.
- Alertar automaticamente quando `review_request` aprovar usuário sem `user_obras`.
- Incluir execução de smoke write em janela diária de monitoramento de produção.
