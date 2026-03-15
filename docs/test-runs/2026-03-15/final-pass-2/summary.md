# Resultado Consolidado de Testes

- Waves executadas: wave1, wave2, wave3, wave4
- Resultado: PASS
- Pass: 11
- Fail: 0
- Duracao total: 7m 24s

| Wave | Step | Status | Exit | Duracao(s) | Log |
| --- | --- | --- | --- | ---: | --- |
| wave1 | cleanup_full_pass | PASS | 0 | 300.6 | [wave1/cleanup_full_pass.log](wave1/cleanup_full_pass.log) |
| wave2 | supabase_test | PASS | 0 | 3.6 | [wave2/supabase_test.log](wave2/supabase_test.log) |
| wave2 | supabase_validate_access | PASS | 0 | 3.6 | [wave2/supabase_validate_access.log](wave2/supabase_validate_access.log) |
| wave2 | smoke_rbac | PASS | 0 | 8.9 | [wave2/smoke_rbac.log](wave2/smoke_rbac.log) |
| wave2 | alerts_dispatch_dry | PASS | 0 | 2.6 | [wave2/alerts_dispatch_dry.log](wave2/alerts_dispatch_dry.log) |
| wave3 | wave3_web_persona | PASS | 0 | 23.5 | [wave3/wave3_web_persona.log](wave3/wave3_web_persona.log) |
| wave3 | wave3_desktop_shell | PASS | 0 | 37.1 | [wave3/wave3_desktop_shell.log](wave3/wave3_desktop_shell.log) |
| wave3 | wave3_android_functional | PASS | 0 | 19.8 | [wave3/wave3_android_functional.log](wave3/wave3_android_functional.log) |
| wave4 | web_ci_verify | PASS | 0 | 33.8 | [wave4/web_ci_verify.log](wave4/web_ci_verify.log) |
| wave4 | smoke_rbac_final | PASS | 0 | 8.2 | [wave4/smoke_rbac_final.log](wave4/smoke_rbac_final.log) |
| wave4 | alerts_dispatch_dry_final | PASS | 0 | 2.6 | [wave4/alerts_dispatch_dry_final.log](wave4/alerts_dispatch_dry_final.log) |

## Contrato de ambiente validado
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

## Itens manuais complementares
- wave4-manual-checklist.md (obrigatorio para pre-release e rollback)
- wave3-manual-checklist.md (opcional para auditoria de UX por persona)