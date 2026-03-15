# Promo Workspace

Workspace de orquestracao do ecossistema Promo.

## Mapa oficial de repositorios
| Nome local | Repositorio GitHub | Finalidade |
| --- | --- | --- |
| `Promo` | `Promo` | Workspace, docs, scripts de operacao e assets compartilhados |
| `promo_APP_Web` | `promo_APP_Web` | App web principal |
| `promo_APP_Android` | `promo_APP_Android` | App Android nativo (Kotlin/Gradle) |
| `promo_APP_Windows` | `promo_APP_Windows` | Shell desktop dedicado para Windows |
| `promo_APP_Linux` | `promo_APP_Linux` | Shell desktop dedicado para Linux |
| `promo_APP_OwnerWindows` | `promo_APP_OwnerWindows` | App owner-control desktop |

## Requisitos
- Node.js 20+
- npm 10+

```bash
nvm use
```

## Fluxo operacional da raiz
```bash
npm run env:doctor
npm run supabase:test
npm run supabase:validate:access
npm run smoke:rbac
npm run alerts:dispatch:dry
npm run windows:build
npm run linux:build
npm run android:doctor
npm run android:build
```

## Limpeza
```bash
npm run clean
npm run clean:all
```

## Leituras recomendadas
- `docs/workspace-topology.md`
- `docs/ops-runbook.md`
- `docs/web-release-checklist.md`
