# Checklist Periodico de Code Hygiene

Periodicidade recomendada: quinzenal ou antes de release maior.

## 1. Preparacao
- Criar branch `codex/cleanup-full-pass`.
- Garantir `node >= 20` e `npm >= 10`.
- Android: exportar `JAVA_HOME` e `ANDROID_HOME`.

## 2. Diagnostico por app
- Web: `npm --prefix promo_APP_Web run cleanup:analyze`
- Android: busca de legado + gate Gradle completo
- Windows: `npm --prefix promo_APP_Windows run cleanup:analyze`
- OwnerWindows: `npm --prefix promo_APP_OwnerWindows run cleanup:analyze`
- Linux: `npm --prefix promo_APP_Linux run cleanup:analyze`

## 3. Remocao moderada
- Remover apenas codigo/dependencia com prova de nao-uso.
- Se houver duvida de uso dinamico, mover para allowlist e nao remover.

## 4. Gates obrigatorios
- Web: `npm --prefix promo_APP_Web run cleanup:verify`
- Android: `./gradlew lintDebug testDebugUnitTest assembleDebug assembleRelease`
- Windows: `npm --prefix promo_APP_Windows run cleanup:verify`
- OwnerWindows: `npm --prefix promo_APP_OwnerWindows run cleanup:verify`
- Linux: `npm --prefix promo_APP_Linux run cleanup:verify`
- Linux packaging final: validar `desktop:build:linux` em runner Ubuntu CI.

## 5. Documentacao
- Atualizar `docs/cleanup/*.md` com removidos/agendados/allowlist.
- Atualizar README dos apps se comandos ou contratos mudarem.
