# Resultado Consolidado de Testes

- Waves executadas: wave2
- Resultado: PASS
- Pass: 4
- Fail: 0
- Duracao total: 0m 19s

| Wave | Step | Status | Exit | Duracao(s) | Log |
| --- | --- | --- | --- | ---: | --- |
| wave2 | supabase_test | PASS | 0 | 3.6 | [wave2/supabase_test.log](wave2/supabase_test.log) |
| wave2 | supabase_validate_access | PASS | 0 | 3.6 | [wave2/supabase_validate_access.log](wave2/supabase_validate_access.log) |
| wave2 | smoke_rbac | PASS | 0 | 8.4 | [wave2/smoke_rbac.log](wave2/smoke_rbac.log) |
| wave2 | alerts_dispatch_dry | PASS | 0 | 3.2 | [wave2/alerts_dispatch_dry.log](wave2/alerts_dispatch_dry.log) |

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