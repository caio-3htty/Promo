# promo_APP_Android - Relatorio de Limpeza

## Inventario (etapa 0)
- Busca de referencias `legacy-capacitor`: ocorrencias apenas em `.gitignore` e `README.md`.
- Nenhuma referencia de build/runtime em `settings.gradle.kts` e modulos `app/core/data/feature-*`.

## Remover agora (executado)
- Pasta `legacy-capacitor/` removida integralmente.
- Limpeza de referencias residuais:
  - `.gitignore` (regras de legado removidas)
  - `README.md` (documentacao atualizada para fluxo 100% Kotlin)

## Revisar manualmente
- Nenhuma pendencia de codigo morto identificada nos modulos ativos.

## Gate da etapa
- `./gradlew lintDebug testDebugUnitTest assembleDebug assembleRelease` verde.
- Ambiente usado no gate:
  - `JAVA_HOME=C:\\Users\\caio.rossoni\\.jdks\\jdk-21.0.10+7`
  - `ANDROID_HOME=C:\\Users\\caio.rossoni\\AppData\\Local\\Android\\Sdk`
