# Ops Runbook (Promo)

## Build e validacao minima por app

### Web (`promo_APP_Web`)
```bash
npm --prefix promo_APP_Web ci
npm --prefix promo_APP_Web run lint
npm --prefix promo_APP_Web run test
npm --prefix promo_APP_Web run build
npm --prefix promo_APP_Web run build:embedded
```

### Desktop shell Windows/Linux (`promo_APP_Windows`)
```bash
npm --prefix promo_APP_Windows ci
npm --prefix promo_APP_Windows run desktop:prepare:web
npm --prefix promo_APP_Windows run desktop:build:win
npm --prefix promo_APP_Windows run desktop:build:linux
```

### Android shell (`promo_APP_Android`)
```bash
npm --prefix promo_APP_Android ci
npm --prefix promo_APP_Android run android:sync
npm --prefix promo_APP_Android run android:build
```

### Owner Windows (`promo_APP_OwnerWindows`)
```bash
npm --prefix promo_APP_OwnerWindows ci
npm --prefix promo_APP_OwnerWindows run build
```

## Operacoes da raiz (workspace)
```bash
npm run supabase:test
npm run smoke:rbac
npm run alerts:dispatch:dry
npm run alerts:dispatch
npm run linux:build
```

## Variaveis de ambiente de smoke
- `SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_TENANT_ID`
- credenciais `SMOKE_*` por papel
- `RESEND_API_KEY` (para disparo real de e-mail critico)
- `RESEND_FROM_EMAIL`
- `CRITICAL_ALERT_FALLBACK_EMAIL` (opcional)

## Politica de commit
- Nao commitar build artifacts e caches.
- Validar comandos acima antes de release.
