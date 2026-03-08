export type PermissionScopeType = "tenant" | "all_obras" | "selected_obras";

export type PermissionKey =
  | "users.manage"
  | "audit.view"
  | "obras.view"
  | "obras.manage"
  | "fornecedores.view"
  | "fornecedores.manage"
  | "materiais.view"
  | "materiais.manage"
  | "material_fornecedor.view"
  | "material_fornecedor.manage"
  | "pedidos.view"
  | "pedidos.create"
  | "pedidos.edit_base"
  | "pedidos.approve"
  | "pedidos.receive"
  | "pedidos.delete"
  | "estoque.view"
  | "estoque.manage";

export const permissionCatalog: PermissionKey[] = [
  "users.manage",
  "audit.view",
  "obras.view",
  "obras.manage",
  "fornecedores.view",
  "fornecedores.manage",
  "materiais.view",
  "materiais.manage",
  "material_fornecedor.view",
  "material_fornecedor.manage",
  "pedidos.view",
  "pedidos.create",
  "pedidos.edit_base",
  "pedidos.approve",
  "pedidos.receive",
  "pedidos.delete",
  "estoque.view",
  "estoque.manage",
];

export type AppLanguage = "pt-BR" | "en" | "es";
export const supportedLanguages: AppLanguage[] = ["pt-BR", "en", "es"];

