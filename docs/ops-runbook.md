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

### Desktop shell Windows (`promo_APP_Windows`)
```bash
npm --prefix promo_APP_Windows ci
npm --prefix promo_APP_Windows run desktop:prepare:web
npm --prefix promo_APP_Windows run desktop:build:win
```

### Desktop shell Linux (`promo_APP_Linux`)
```bash
npm --prefix promo_APP_Linux ci
npm --prefix promo_APP_Linux run desktop:prepare:web
npm --prefix promo_APP_Linux run desktop:build:linux
```
Observacao:
- Em Windows local, use apenas `desktop:prepare:web`.
- Empacotamento oficial `.AppImage/.deb` ocorre no CI Ubuntu.

### Android nativo (`promo_APP_Android`)
```bash
# Linux/macOS
cd promo_APP_Android
./gradlew lintDebug testDebugUnitTest assembleDebug

# Windows
cd promo_APP_Android
gradlew.bat lintDebug testDebugUnitTest assembleDebug
```

Bootstrap local Android:
```bash
# JDK
set JAVA_HOME=C:\Users\seu_usuario\.jdks\jdk-21.0.10+7

# SDK (alternativa 1)
set ANDROID_HOME=C:\Users\seu_usuario\AppData\Local\Android\Sdk

# SDK (alternativa 2)
# promo_APP_Android/local.properties
# sdk.dir=C:\\Users\\seu_usuario\\AppData\\Local\\Android\\Sdk
```

### Owner Windows (`promo_APP_OwnerWindows`)
```bash
npm --prefix promo_APP_OwnerWindows ci
npm --prefix promo_APP_OwnerWindows run build
```

## Operacoes da raiz (workspace)
```bash
npm run env:doctor
npm run supabase:test
npm run smoke:rbac
npm run alerts:dispatch:dry
npm run alerts:dispatch
npm run windows:build
npm run linux:build
npm run android:doctor
npm run android:build
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
