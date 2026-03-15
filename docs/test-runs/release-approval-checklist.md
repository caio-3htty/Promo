# Checklist de Aprovacao Tecnica (Binario)

Status final permitido: `APROVADO` ou `BLOQUEADO`.

## Gates obrigatorios
- [x] Wave1 verde (sanidade automatizada).
- [x] Wave2 verde (Supabase + RBAC + alerts dry-run).
- [x] Wave3 verde (web persona, desktop shell smoke, android funcional minima).
- [x] Wave4 verde (gate web + smoke final + alerts dry-run final).
- [ ] Workflows desktop (Windows, OwnerWindows, Linux) verdes no GitHub Actions.

## Seguranca e configuracao
- [x] Nenhum segredo versionado no Git.
- [x] Segredo critico ausente gera falha explicita em workflow.
- [x] Contrato de env revisado (`docs/test-runs/env-contract.md`).

## Rollback drill
- [ ] Build estavel anterior identificada.
- [ ] Redeploy de rollback executado em teste.
- [ ] Tempo de recuperacao registrado.
- [ ] Evidencia anexada (link de deploy e log).

## Evidencias locais
- Pass 1: `docs/test-runs/2026-03-15/final-pass-1/summary.md`
- Pass 2: `docs/test-runs/2026-03-15/final-pass-2/summary.md`
- Historico: `docs/test-runs/status-history.md`

## Links de CI remoto (pendente execucao)
- Promo: https://github.com/caio-3htty/Promo/actions
- Windows: https://github.com/caio-3htty/promo_APP_Windows/actions
- OwnerWindows: https://github.com/caio-3htty/promo_APP_OwnerWindows/actions
- Linux: https://github.com/caio-3htty/promo_APP_Linux/actions

## Registro de decisao
- Data: 2026-03-15
- Release candidate: final-hardening-2026-03-15
- Responsavel tecnico: Codex + Caio Rossoni
- Resultado final: `BLOQUEADO`
- Riscos residuais:
  - Falta validacao remota dos workflows no GitHub Actions nesta maquina (sem `gh` configurado para disparo).
  - Falta executar e anexar rollback drill para fechar aceite binario.
