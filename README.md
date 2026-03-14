# Prumo Workspace

Workspace de orquestracao do ecossistema Prumo.

## Leitura rapida
- Topologia, repositorios e responsabilidades: `docs/workspace-topology.md`
- Runbook de build/release/smoke: `docs/ops-runbook.md`
- Smoke funcional de homologacao: `docs/smoke-checklist-homologacao.md`

## Requisitos
- Node.js 20+
- npm 10+

```bash
nvm use
```

## Comandos de orquestracao
```bash
npm run web:dev
npm run web:lint
npm run web:test
npm run web:build

npm run owner:build
npm run windows:build
npm run android:doctor

npm run supabase:test
npm run smoke:rbac
```

## Limpeza
```bash
npm run clean
npm run clean:all
```
