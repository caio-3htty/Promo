# Access Closure Evidence (2026-03-16)

Timestamp (America/Sao_Paulo): 2026-03-16 07:59
Status: PASS

## 1) Recuperacao da conta alvo
- Usuario: `caiofrossoni@gmail.com`
- Auth: senha resetada para valor temporario conhecido + `email_confirmed=true`
- Profile: `is_active=true`, `tenant_id=11111111-1111-1111-1111-111111111111`
- Role: vinculo existente e consistente em `user_roles`

## 2) Validacao signup/login ponta a ponta
- `register_company` com empresa nova: `HTTP 200` (`Conta empresa criada com sucesso.`)
- Login imediato da conta criada: `HTTP 200`
- `register_internal` com empresa existente: `HTTP 200` (request criada, email enviado)
- `register_internal` com empresa inexistente: `HTTP 404` (`Empresa nao encontrada...`)

## 3) Smoke de producao
- `https://promo-eta-nine.vercel.app/login` => `200`
- `https://promo-eta-nine.vercel.app/obras` => `200`
- Login da conta alvo => `200`
- Leitura de obras com token => `200`
- Logout => `204`
- Novo login => `200`

## 4) Gate tecnico
- `npm run supabase:validate:access` => PASS (5/5)
