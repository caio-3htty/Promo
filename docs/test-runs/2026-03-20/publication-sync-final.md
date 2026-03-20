# Publicacao Git - Sync Final (2026-03-20)

Gerado em: 2026-03-20 18:17:53 -03:00

## Resultado
- Status final: **APROVADO**
- Objetivo: consolidar estado publicado dos 6 repositorios sem alterar produto.

## Snapshot de sincronizacao
- `Promo`: `main...origin/main`
- `promo_APP_Web`: `main...origin/main`
- `promo_APP_Android`: `main...origin/main`
- `promo_APP_Windows`: `main...origin/main`
- `promo_APP_OwnerWindows`: `main...origin/main`
- `promo_APP_Linux`: `main...origin/main`

## Higiene local no workspace `Promo`
- Scripts locais nao publicados:
  - `scripts/create-chat-zips.ps1`
  - `scripts/create-chat-zips-lite.ps1`
- Tratamento aplicado: exclusao local em `.git/info/exclude` (nao versionada).
- Confirmacao: `git status -sb` limpo no `Promo` apos exclusao local.

## Remotos oficiais
- `Promo`: `https://github.com/caio-3htty/Promo.git`
- `promo_APP_Web`: `https://github.com/caio-3htty/promo_APP_Web.git`
- `promo_APP_Android`: `https://github.com/caio-3htty/promo_APP_Android.git`
- `promo_APP_Windows`: `https://github.com/caio-3htty/promo_APP_Windows.git`
- `promo_APP_OwnerWindows`: `https://github.com/caio-3htty/promo_APP_OwnerWindows.git`
- `promo_APP_Linux`: `https://github.com/caio-3htty/promo_APP_Linux.git`
