# Cleanup Full Pass - Ecossistema Promo

Data de execucao: 2026-03-15

Escopo validado:
- `promo_APP_Web`
- `promo_APP_Android`
- `promo_APP_Windows`
- `promo_APP_OwnerWindows`
- `promo_APP_Linux`

## Resultado consolidado

Removido agora:
- Web: dependencias sem uso comprovado `@hookform/resolvers`, `@tailwindcss/typography`, `@testing-library/react`.
- Android: removido `legacy-capacitor/` e referencias associadas em docs/ignore.

Revisar manualmente (nao removido por seguranca):
- Linux: `desktop:build:linux` continua dependente de runner Linux/Ubuntu; em Windows falha por privilegio de symlink.
- depcheck do Web aponta `invalidFiles` para `tsconfig.app.json` e `tsconfig.node.json` (comentarios JSONC). Nao afeta build.

## Gates executados

- Web: `npm run cleanup:verify` (verde).
- Android: `./gradlew lintDebug testDebugUnitTest assembleDebug assembleRelease` (verde, com `JAVA_HOME` e `ANDROID_HOME` definidos).
- Windows: `npm run cleanup:verify` (verde).
- OwnerWindows: `npm run cleanup:verify` (verde).
- Linux: `npm run cleanup:verify` (verde) e `npm run desktop:build:linux` (falha esperada em Windows; validar pacote final no CI Ubuntu).

## Documentos desta pasta
- `web.md`
- `android.md`
- `windows.md`
- `owner-windows.md`
- `linux.md`
- `allowlist.md`
- `hygiene-checklist.md`
