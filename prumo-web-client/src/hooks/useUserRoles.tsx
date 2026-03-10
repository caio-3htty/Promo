import { useAuth } from "./useAuth";

export type AppRole = "master" | "gestor" | "engenheiro" | "operacional" | "almoxarife";

export const useUserRoles = () => {
  const { roles, loading, loadingAccess } = useAuth();

  return {
    data: roles,
    isLoading: loading || loadingAccess,
  };
};

export const useIsGestor = () => {
  const { role } = useAuth();
  return role === "master" || role === "gestor";
};
