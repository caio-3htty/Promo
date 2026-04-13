# Matriz de Paridade — Web x Android x Windows

Data: 2026-04-13

## Rotas e fluxos criticos

| Fluxo | Web | Android | Windows (shell web) | Status |
|---|---|---|---|---|
| Login / logout | Sim | Sim | Sim | OK |
| Sessao persistente | Sim (30d) | Sim (30d) | Sim (30d) | OK |
| Desbloqueio rapido | PIN desktop | Biometria/PIN dispositivo | PIN desktop | OK |
| Obras | Sim | Sim | Sim | OK |
| Dashboard por obra | Sim | Sim | Sim | OK |
| Pedidos | Sim | Sim | Sim | OK |
| Recebimento | Sim | Sim | Sim | OK |
| Estoque | Sim | Sim | Sim | OK |
| Cadastros | Sim | Sim | Sim | OK |
| Usuarios e acessos | Sim | Sim | Sim | OK |
| Alertas/Substituicoes/Relatorios | Sim | Parcial (em backlog nativo) | Sim | Parcial Android |
| Importacao em lote | Sim | Nao (backlog nativo) | Sim | Parcial Android |

## Contrato de sessao unico

- `session_started_at`: registrado no login inicial.
- `last_refresh_at`: atualizado em refresh de contexto/sessao.
- `expires_policy_at`: enforce local por politica de 30 dias.
- `remember_enabled`: ativo por padrao.
- `quick_unlock_enabled`: ativo por padrao (setup inicial de PIN no desktop; biometria/PIN do dispositivo no Android).

## Cenarios de QA para release

1. Login unico e reabertura do app sem pedir senha.
2. Refresh silencioso com sessao valida.
3. Simulacao de sessao expirada por politica e redirecionamento para login.
4. Trocar conta (logout local).
5. Sair de todos os dispositivos (web).
6. Isolamento tenant/obra preservado com sessao restaurada.

