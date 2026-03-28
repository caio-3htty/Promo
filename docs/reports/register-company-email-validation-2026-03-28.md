# Validacao register_company com envio de e-mail (2026-03-28)

- Deploy aplicado: `account-access-request` em producao (`awkvzbpnihtgceqdwisc`).
- Regra nova ativa: `register_company` exige envio de e-mail; em falha retorna `email_delivery_failed` e executa rollback.

## Evidencias

1. `npm run supabase:test` => PASS
2. `npm run supabase:validate:access` => PASS
3. `npm --prefix promo_APP_Web run ci:verify` => PASS
4. `npm run android:build` => PASS
5. `npm run smoke:web:signup` => FAIL esperado por ambiente de e-mail (Resend em modo restrito)
   - erro observado: `code=email_delivery_failed`

## Teste de rollback (falha de e-mail)

Teste manual controlado de `register_company`:
- resposta: `ok=false`, `code=email_delivery_failed`, `rollbackStatus=completed`
- `search_companies` para o prefixo de teste => `0` resultados
- `auth_user_count` para o e-mail de teste => `0`

Conclusao:
- comportamento de bloqueio em falha de e-mail esta funcionando;
- rollback do cadastro (tenant/usuario) foi confirmado sem residuos no teste manual.
