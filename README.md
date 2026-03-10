# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Access model (Prumo)

- Auth: Supabase (signup aberto controlado)
- RBAC: papel unico em `public.user_roles` (`master`, `gestor`, `engenheiro`, `operacional`, `almoxarife`)
- Tipos da empresa: `public.user_types` (cada tipo mapeia para um papel base)
- Escopo por obra: `public.user_obras`
- Ativacao de usuario e tipo: `public.profiles.is_active`, `public.profiles.user_type_id`
- Auditoria: `public.audit_log`

### Multi-tenant + granular permissions (new)

- Tenant isolation: `public.tenants`, `tenant_id` nas tabelas de acesso e operacao.
- Configuracao por tenant: `public.tenant_settings` (`multi_obra_enabled`, `default_obra_id`).
- Permissoes granulares:
- `public.permission_catalog`
- `public.user_permission_grants`
- `public.user_permission_obras`
- `public.user_type_permissions`
- RPCs owner-control (`owner_control`):
- `owner_publish_template_version`
- `owner_activate_template_version`
- `owner_restore_soft_deleted`
- `owner_restore_field_version`

### Multi-app workspace bootstrap

- `prumo-web-client`
- `prumo-android-client`
- `prumo-windows-client`
- `prumo-owner-windows`
- `packages/prumo-core`

### Main routes

- `/obras`
- `/dashboard/:obraId`
- `/dashboard/:obraId/pedidos`
- `/dashboard/:obraId/recebimento`
- `/dashboard/:obraId/estoque`
- `/cadastros/fornecedores`
- `/cadastros/materiais`
- `/cadastros/material-fornecedor`
- `/usuarios-acessos` (somente master)

### Demo seed

Execute `supabase/seed.sql` after migrations to load:

- 3 obras
- 3 fornecedores
- 3 materiais
- 3 vinculos material x fornecedor
- 3 pedidos de compra

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
