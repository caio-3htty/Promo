# Checklist de Aprovacao Tecnica (Binario)

Status final permitido: `APROVADO` ou `BLOQUEADO`.

## Gates obrigatorios
- [x] Wave1 verde (sanidade automatizada).
- [x] Wave2 verde (Supabase + RBAC + alerts dry-run).
- [x] Wave3 verde (web persona, desktop shell smoke, android funcional minima).
- [x] Wave4 verde (gate web + smoke final + alerts dry-run final).
- [x] Workflows desktop (Windows, OwnerWindows, Linux) verdes no GitHub Actions.

## Seguranca e configuracao
- [x] Nenhum segredo versionado no Git.
- [x] Segredo critico ausente gera falha explicita em workflow.
- [x] Contrato de env revisado (`docs/test-runs/env-contract.md`).

## Rollback drill
- [x] Build estavel anterior identificada.
- [x] Redeploy de rollback executado em teste.
- [x] Tempo de recuperacao registrado.
- [x] Evidencia anexada (link de deploy e log).

## Evidencias locais
- Pass 1: `docs/test-runs/2026-03-15/final-pass-1/summary.md`
- Pass 2: `docs/test-runs/2026-03-15/final-pass-2/summary.md`
- Historico: `docs/test-runs/status-history.md`

## Links de CI remoto (executado)
- Promo `master-waves-ci`: https://github.com/caio-3htty/Promo/actions/runs/23118687075
- Promo `wave3-regression`: https://github.com/caio-3htty/Promo/actions/runs/23118687335
- Promo `smoke-rbac`: https://github.com/caio-3htty/Promo/actions/runs/23118687571
- Promo `alerts-dispatch-dry`: https://github.com/caio-3htty/Promo/actions/runs/23118687933
- Web `web-ci`: https://github.com/caio-3htty/promo_APP_Web/actions/runs/23117691480
- Web `web-deploy-vercel`: https://github.com/caio-3htty/promo_APP_Web/actions/runs/23117691490
- Android `android-native-ci`: https://github.com/caio-3htty/promo_APP_Android/actions/runs/23117736718
- Windows `desktop-ci`: https://github.com/caio-3htty/promo_APP_Windows/actions/runs/23117901314
- OwnerWindows `owner-windows-ci`: https://github.com/caio-3htty/promo_APP_OwnerWindows/actions/runs/23117737051
- Linux `linux-ci`: https://github.com/caio-3htty/promo_APP_Linux/actions/runs/23117902402

## Validacao Vercel web
- Producao: https://promo-eta-nine.vercel.app (rotas principais responderam HTTP 200).
- Deploy de producao (main): https://github.com/caio-3htty/promo_APP_Web/actions/runs/23117691490

## Evidencias rollback drill (Vercel)
- Rollback para build anterior: https://github.com/caio-3htty/promo_APP_Web/actions/runs/22829281080 (success, ~62s)
- Restore para build estavel atual: https://github.com/caio-3htty/promo_APP_Web/actions/runs/23117691490 (success, ~62s)
- Tempo total de recuperacao observado: ~124s

## Registro de decisao
- Data: 2026-03-15
- Release candidate: final-hardening-2026-03-15
- Responsavel tecnico: Codex + Caio Rossoni
- Resultado final: `APROVADO`
- Riscos residuais:
  - Manter monitoramento continuo de RBAC/smoke e custo de build desktop em cada release.
