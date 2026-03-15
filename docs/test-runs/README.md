# Plano Mestre de Testes - Contrato de Execucao

Este diretorio armazena evidencias versionadas por execucao:

- `docs/test-runs/<YYYY-MM-DD>/<run-id>/summary.md`
- `docs/test-runs/<YYYY-MM-DD>/<run-id>/summary.json`
- `docs/test-runs/<YYYY-MM-DD>/<run-id>/wave*/<step>.log`
- `docs/test-runs/<YYYY-MM-DD>/<run-id>/wave3-manual-checklist.md`
- `docs/test-runs/<YYYY-MM-DD>/<run-id>/wave4-manual-checklist.md`
- `docs/test-runs/status-history.md`

## Regra de status
- `PASS`: comando executado com exit code `0`.
- `FAIL`: comando executado com exit code diferente de `0`.
- `MANUAL`: item depende de validacao humana (deploy/rollback).

## Waves e comandos fixos

### Wave 1 - Sanidade automatizada
- `npm run cleanup:full-pass`

### Wave 2 - Integracao Supabase e seguranca
- `npm run supabase:test`
- `npm run supabase:validate:access`
- `npm run smoke:rbac`
- `npm run alerts:dispatch:dry`

### Wave 3 - Regressao critica automatizada
- `npm run wave3:web:persona`
- `npm run wave3:desktop:smoke`
- `npm run wave3:android:functional`

### Wave 4 - Pre-release + rollback drill
- `npm --prefix promo_APP_Web run ci:verify`
- `npm run smoke:rbac`
- `npm run alerts:dispatch:dry`
- checklist manual: `wave4-manual-checklist.md`

## Execucao automatizada
Na raiz `Promo`:

```bash
npm run test:waves:auto
```

Execucao completa (inclui wave3 automatizada):

```bash
npm run test:waves:full
```

Execucao por onda:

```bash
npm run test:waves:wave1
npm run test:waves:wave2
npm run test:waves:wave3
npm run test:waves:wave4
```

Regra oficial de execucao:
- Toda execucao de release deve usar `--run-id`.
- Resultado oficial deve estar em `docs/test-runs/<YYYY-MM-DD>/<run-id>/`.
- Estruturas antigas sem `run-id` devem ser movidas para `docs/test-runs/legacy/`.

## Workflows GitHub
- `master-waves-ci`: gate continuo para `wave1 + wave2 + wave4`.
- `wave3-regression`: regressao critica automatizada por persona/camada.
- `smoke-rbac`, `alerts-dispatch-dry`, `alerts-dispatch-live`: monitoramento com artifact de log por execucao.

## Contrato de ambiente
Variaveis esperadas:
- `SUPABASE_URL` (ou `SUPABASE_PROJECT_REF`)
- `SUPABASE_ANON_KEY` (ou `VITE_SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_PUBLISHABLE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_SECRET_KEY`)
- `RESEND_API_KEY` (obrigatorio apenas para envio live de alertas)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Para Android local, defina tambem:
- `JAVA_HOME`
- `ANDROID_HOME` ou `ANDROID_SDK_ROOT`

Detalhamento completo: `docs/test-runs/env-contract.md`.

Checklist final de gate/rollback: `docs/test-runs/release-approval-checklist.md`.
