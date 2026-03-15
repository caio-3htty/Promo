# Contrato de Ambiente por Contexto

## Aliases aceitos (resolver unico)
- `SUPABASE_URL` <= `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` <= `VITE_SUPABASE_PUBLISHABLE_KEY` | `VITE_SUPABASE_ANON_KEY` | `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` <= `SUPABASE_SECRET_KEY`
- `SUPABASE_PROJECT_REF` <= extraido de `SUPABASE_URL` (fallback default do workspace)

## Local (dev/test)

Obrigatorias:
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (ou alias)
- `VALIDATION_LOGIN_EMAIL`
- `VALIDATION_LOGIN_PASSWORD`

Condicionais:
- `SUPABASE_URL` ou `SUPABASE_PROJECT_REF`
- `JAVA_HOME`, `ANDROID_HOME`/`ANDROID_SDK_ROOT` quando rodar ondas com Android
- `promo_APP_Android/local.properties` com `sdk.dir=<ANDROID_HOME>` para garantir descoberta do SDK no Gradle

Opcionais:
- `SUPABASE_TENANT_ID` (auto-discovery habilitado)
- `SMOKE_DEFAULT_PASSWORD`, `SMOKE_EMAIL_PREFIX`, `SMOKE_*`
- `RESEND_API_KEY` (necessario apenas para `alerts:dispatch` live)

## CI (automacao)

Obrigatorias por job:
- Smoke RBAC: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, (`SUPABASE_URL` ou `SUPABASE_PROJECT_REF`)
- Alerts dry-run: `SUPABASE_SERVICE_ROLE_KEY`, (`SUPABASE_URL` ou `SUPABASE_PROJECT_REF`)
- Alerts live: `SUPABASE_SERVICE_ROLE_KEY`, (`SUPABASE_URL` ou `SUPABASE_PROJECT_REF`), `RESEND_API_KEY`
- Web build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Android build: `JAVA_HOME` + Android SDK provisionado no runner

Regra:
- segredo critico ausente => job `FAIL` explicito.
- `skip` apenas para passo opcional declarado (nunca silencioso).

## Release

Obrigatorias:
- Mesmo conjunto da CI do fluxo usado no release.
- Segredos sempre no provider (GitHub/Vercel/Supabase), nunca versionados.

Checklist:
- `.env` fora do Git.
- `.env.example` atualizado.
- comandos de validacao rodando com o mesmo contrato acima.
