# prumo-owner-windows

Aplicativo exclusivo do dono (Windows).

## Funções permitidas
- Consulta global multi-tenant
- Publicar/ativar versões de template
- Recuperação (soft delete e versão de campos críticos)

## Restrições
- Sem CRUD operacional direto nos dados do cliente.
- Acesso apenas para contas em `owner_control.owner_accounts`.

