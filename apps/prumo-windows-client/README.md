# prumo-windows-client

Cliente Windows com conexão direta ao Supabase do Prumo.

## Escopo atual
- Login por e-mail/senha.
- Leitura do estado de acesso (`profiles.is_active`, `user_roles`, `user_obras`).
- Lista de obras vinculadas do usuário autenticado.

## Configuração
1. Copie `.env.example` para `.env`.
2. Informe URL e anon key do projeto Supabase.
3. Rode:

```bash
npm install
npm run dev
```
