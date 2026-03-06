# Smoke Checklist - Modelo Master (Prumo)

## Pre-requisitos
- Migrations aplicadas.
- `supabase/seed.sql` aplicado.
- Master provisionado com `supabase/provision_test_users.sql`.
- Login com a conta master.

## 1) Master e administracao
- Acessar `/usuarios-acessos`.
- Na aba `Tipos de Usuario`:
- criar tipo `Operacao Empresa` com papel base `operacional`;
- criar tipo `Engenharia Empresa` com papel base `engenheiro`;
- editar descricao e status de um tipo.
- Na aba `Usuarios`:
- ativar um usuario;
- atribuir tipo de usuario;
- vincular obra A e obra B;
- salvar e confirmar no log de alteracoes.

## 2) Fluxo sem acesso
- Criar conta nova via signup (sem configuracao).
- Login nessa conta.
- Validar redirecionamento para `/sem-acesso`.

## 3) Validacao de escopo por obra
- Com usuario nao-master vinculado apenas na obra A:
- acessar `/dashboard/:obraA` deve funcionar;
- acessar `/dashboard/:obraB` deve bloquear (`/sem-acesso`).

## 4) Validacao de processos por tipo
- Tipo com papel `operacional`:
- consegue cadastros globais e criar/editar pedido.
- Tipo com papel `engenheiro`:
- consegue aprovar/cancelar pedido e editar `codigo_compra`.
- Tipo com papel `almoxarife`:
- consegue receber pedido e atualizar estoque.
