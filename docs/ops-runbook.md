# Ops Runbook (Prumo)

## Build e validacao minima

### Web (`prumo-web-client`)
```bash
npm --prefix prumo-web-client ci
npm --prefix prumo-web-client run build
npm --prefix prumo-web-client run build:embedded
```

### Windows client (`prumo-windows-client`)
```bash
npm --prefix prumo-windows-client ci
npm --prefix prumo-windows-client run desktop:prepare:web
npm --prefix prumo-windows-client run desktop:build:win
```

Linux packaging:
```bash
npm --prefix prumo-windows-client run desktop:build:linux
```

### Android client (`prumo-android-client`)
```bash
npm --prefix prumo-android-client ci
npm --prefix prumo-android-client run android:sync
npm --prefix prumo-android-client run android:build
```

### Owner Windows (`prumo-owner-windows`)
```bash
npm --prefix prumo-owner-windows ci
npm --prefix prumo-owner-windows run build
```

## Smoke e Supabase
```bash
npm run supabase:test
npm run smoke:rbac
```

## Limpeza
```bash
npm run clean
npm run clean:all
```

## Variaveis de ambiente de smoke
- `SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_TENANT_ID`
- credenciais `SMOKE_*` por papel

## Politica de commit
- Nao commitar build artifacts e caches.
- Validar comandos acima antes de release.
