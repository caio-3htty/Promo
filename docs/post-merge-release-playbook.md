# Post-Merge Release Playbook

## Scope
- Workspace root: `Promo`
- Web app: `promo_APP_Web`
- Desktop shell: `promo_APP_Windows`
- Android shell: `promo_APP_Android`
- Owner app: `promo_APP_OwnerWindows`

## Merge order
1. `Promo` (`codex/publish-standardization`)
2. `promo_APP_Web` (`codex/publish-standardization`)
3. `promo_APP_Windows` (`codex/publish-standardization`)
4. `promo_APP_Android` (`codex/publish-standardization`)
5. `promo_APP_OwnerWindows` (`codex/publish-standardization`)

## Tag strategy
Use synchronized tags by repository role:
- `vYYYY.MM.DD-workspace`
- `vYYYY.MM.DD-web`
- `vYYYY.MM.DD-desktop-shell`
- `vYYYY.MM.DD-android-shell`
- `vYYYY.MM.DD-owner-windows`

## Artifact verification
- Web deploy healthy
- Windows installer generated
- Android APK generated
- Owner Windows installer generated
- Nenhum artefato gerado versionado em Git
