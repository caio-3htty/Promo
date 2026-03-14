# Post-Merge Release Playbook

## Scope
- Workspace root: `Promo`
- Desktop shell: `Promo_APP_Windows` (`prumo-windows-client`)
- Android shell: `Promo_APP_Android` (`prumo-android-client`)

## 1) Merge order
1. `Promo` PR `codex/cleanup-irrelevantes`
2. `Promo_APP_Windows` PR `codex/cleanup-irrelevantes`
3. `Promo_APP_Android` PR `codex/cleanup-irrelevantes`

## 2) Tag strategy
Use a synchronized release family with repository suffix:
- `vYYYY.MM.DD-workspace`
- `vYYYY.MM.DD-desktop-shell`
- `vYYYY.MM.DD-android-shell`

PowerShell example:
```powershell
$D = Get-Date -Format "yyyy.MM.dd"

git -C C:\Users\caio.rossoni\Downloads\Promo checkout main
git -C C:\Users\caio.rossoni\Downloads\Promo pull
git -C C:\Users\caio.rossoni\Downloads\Promo tag "v$D-workspace"
git -C C:\Users\caio.rossoni\Downloads\Promo push origin "v$D-workspace"

git -C C:\Users\caio.rossoni\Downloads\Promo\prumo-windows-client checkout main
git -C C:\Users\caio.rossoni\Downloads\Promo\prumo-windows-client pull
git -C C:\Users\caio.rossoni\Downloads\Promo\prumo-windows-client tag "v$D-desktop-shell"
git -C C:\Users\caio.rossoni\Downloads\Promo\prumo-windows-client push origin "v$D-desktop-shell"

git -C C:\Users\caio.rossoni\Downloads\Promo\prumo-android-client checkout main
git -C C:\Users\caio.rossoni\Downloads\Promo\prumo-android-client pull
git -C C:\Users\caio.rossoni\Downloads\Promo\prumo-android-client tag "v$D-android-shell"
git -C C:\Users\caio.rossoni\Downloads\Promo\prumo-android-client push origin "v$D-android-shell"
```

## 3) Release notes template
Use this per repository release:

```md
## Highlights
- Aggressive cleanup of generated/legacy artifacts.
- Documentation consolidated into canonical runbook/topology references.
- Standardized `clean` scripts for deterministic local cleanup.

## CI/CD
- Desktop release pipeline prepared for Linux packaging dependencies (`fpm`) in CI.
- Android/desktop/web shell flows validated against embedded web build.

## Validation
- Web: `build` + `build:embedded` successful.
- Desktop: `desktop:prepare:web` + `desktop:build:win` successful.
- Android: `android:sync` + `android:build` successful.

## Notes
- Linux desktop packages (`.AppImage`, `.deb`) must be validated on Linux runner artifacts.
```

## 4) Artifact verification checklist
- Desktop Windows release:
  - Expected: `Prumo-Windows-Client-<version>-Setup.exe`
- Desktop Linux release:
  - Expected: `Prumo-Linux-Client-<version>-x86_64.AppImage`
  - Expected: `Prumo-Linux-Client-<version>-amd64.deb`
- Android build:
  - Expected: `android/app/build/outputs/apk/debug/app-debug.apk`

## 5) Actions to run post-merge
- `Promo_APP_Windows`:
  - Run `desktop-release` (workflow_dispatch)
  - Verify all three artifacts uploaded
- `Promo_APP_Android`:
  - Run Android workflow for sync/build validation

## 6) Final smoke gates
- Desktop app launch + login
- Android app launch + login
- Key routes load with same web behavior
- No generated artifacts tracked in Git after release
