import type { AppRole } from "@/hooks/useAuth";

export const roleLabelMap: Record<AppRole, string> = {
  master: "Master",
  gestor: "Gestor",
  engenheiro: "Engenheiro",
  operacional: "Operacional",
  almoxarife: "Almoxarife",
};

export const canManageCadastros = (role: AppRole | null) =>
  role === "master" || role === "gestor" || role === "operacional";

export const canEditPedidosBase = (role: AppRole | null) =>
  role === "master" || role === "gestor" || role === "operacional";

export const canApprovePedidos = (role: AppRole | null) =>
  role === "master" || role === "gestor" || role === "engenheiro";

export const canReceivePedidos = (role: AppRole | null) =>
  role === "master" || role === "gestor" || role === "almoxarife";

export const canAccessRecebimentoRoute = (role: AppRole | null) =>
  role === "master" || role === "gestor" || role === "almoxarife" || role === "engenheiro";

export const hasObraAccess = (
  role: AppRole | null,
  obraIds: string[],
  obraId: string | undefined,
) => {
  if (!obraId) return false;
  if (role === "master" || role === "gestor") return true;
  return obraIds.includes(obraId);
};

export const hasOperationalAccess = (
  isActive: boolean,
  role: AppRole | null,
  obrasCount: number,
) => isActive && !!role && (role === "master" || role === "gestor" || obrasCount > 0);
