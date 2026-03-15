# Publication Sync Final (2026-03-15)

## Escopo
Consolidacao pos-publicacao dos 6 repositorios do ecossistema Promo:
- `Promo`
- `promo_APP_Web`
- `promo_APP_Android`
- `promo_APP_Windows`
- `promo_APP_OwnerWindows`
- `promo_APP_Linux`

Sem mudanca funcional de produto e sem alteracao de schema Supabase/RLS.

## Estado de branches
- Todos os repositorios alinhados em `main` e rastreando `origin/main`.
- Todas as branches temporarias `codex/*` removidas localmente e remotamente.
- Verificacao de PR aberto por `refs/pull/*/merge`: `0` nos 6 repositorios.

## Snapshot de commits em `main`
- `Promo`: `7b97a48`
- `promo_APP_Web`: `ed54803`
- `promo_APP_Android`: `b508514`
- `promo_APP_Windows`: `42ed45b`
- `promo_APP_OwnerWindows`: `ba9a1ea`
- `promo_APP_Linux`: `905c7fa`

## CI critica (badge `main`)
- Promo `master-waves-ci`: passing
- Promo `wave3-regression`: passing
- Promo `smoke-rbac`: passing
- Promo `alerts-dispatch-dry`: passing
- Web `web-ci`: passing
- Android `android-native-ci`: passing
- Windows `desktop-ci`: passing
- OwnerWindows `owner-windows-ci`: passing
- Linux `linux-ci`: passing

## Smoke HTTP (producao Vercel)
URL base: `https://promo-eta-nine.vercel.app`

- `/` => `200`
- `/login` => `200`
- `/obras` => `200`
- `/dashboard/1` => `200`
- `/dashboard/1/pedidos` => `200`
- `/dashboard/1/recebimento` => `200`
- `/dashboard/1/estoque` => `200`
- `/usuarios-acessos` => `200`

## Conclusao
Estado publicado consolidado e higienizado para proximo ciclo.
