# prumo-owner-windows

Aplicativo exclusivo do dono (Windows) para governança central.

## Escopo
- Login no Supabase.
- Publicar e ativar versões de template (`owner_publish_template_version`, `owner_activate_template_version`).
- Restaurar soft-delete (`owner_restore_soft_deleted`).
- Restaurar versão de campo crítico (`owner_restore_field_version`).
- Sem CRUD operacional direto das tabelas de negócio.

## Configuração
1. Copie `.env.example` para `.env`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Instale dependências e rode:

```bash
npm install
npm run dev
```

## Variáveis de ambiente
Veja `apps/prumo-owner-windows/.env.example`.
