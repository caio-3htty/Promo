# Ops Runbook (Promo)

## Pre-check obrigatorio (sempre primeiro)
```bash
npm run env:doctor
```

Se falhar por Node/npm:
```bash
winget install CoreyButler.NVMforWindows
nvm install 20
nvm use 20
npm i -g npm@10
npm run env:doctor
```
Observacoes:
- reinicie o terminal apos instalacao/upgrade do Node.
- se o shell continuar usando `C:\\Program Files\\nodejs` com Node 18, atualize/remova a instalacao antiga (elevacao) ou aplique o PATH sugerido pelo `env:doctor`.

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
npm run supabase:validate:access
npm run smoke:web:signup
npm run smoke:cross-app
npm run smoke:cross-app:write
npm run smoke:rbac
npm run smoke:internal:full
npm run alerts:dispatch:dry
npm run alerts:dispatch
npm run windows:build
npm run linux:build
npm run android:doctor
npm run android:build
```

## Variaveis de ambiente de smoke
- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_TENANT_ID`
- `VALIDATION_LOGIN_EMAIL`
- `VALIDATION_LOGIN_PASSWORD`
- credenciais `SMOKE_*` por papel
- `RESEND_API_KEY` (para disparo real de e-mail critico)
- `RESEND_FROM_EMAIL`
- `CRITICAL_ALERT_FALLBACK_EMAIL` (opcional)

Pre-requisito de cadastro:
- `register_company` e `register_internal` exigem envio de e-mail; sem `RESEND_API_KEY` o cadastro e bloqueado.

## Diagnostico de banco e login
- `npm run supabase:test`: valida `connectivity`, `auth` e `read` com saida estruturada.
- `npm run supabase:validate:access`: valida login real, profile/tenant, leitura minima e sanity da edge function `account-access-request`.
- `npm run smoke:web:signup`: valida cadastro web de conta empresa + conta interna (com revisao/edicao), inclui check de tenant novo sem dados operacionais no inicio e cleanup isolado.
- `npm run smoke:cross-app`: roda os checks de leitura (sem escrita).
- `npm run smoke:cross-app:write`: roda leitura + smoke write isolado (tenant temporario com limpeza automatica).
- `npm run smoke:internal:full`: orquestra `smoke:web:signup` + `smoke:rbac` + `alerts:dispatch:dry` e gera relatorio unico em `docs/reports/`.
- Erros esperados mapeados:
  - credencial invalida,
  - usuario sem profile/tenant,
  - usuario inativo,
  - problema de chave/ambiente.

## Publicacao da edge function (manual)
Para publicar alteracoes em `account-access-request` em producao:
```bash
npx supabase@2.84.4 functions deploy account-access-request --project-ref <SUPABASE_PROJECT_REF>
```
Requisitos:
- `SUPABASE_ACCESS_TOKEN` configurado no ambiente (ou `supabase login` previamente executado).
- Em ambientes com Node 18 pode haver warnings de engine; deploy pode prosseguir.

## Politica de commit
- Nao commitar build artifacts e caches.
- Validar comandos acima antes de release.
