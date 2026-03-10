import { useAuth } from "./useAuth";

export interface Obra {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
}

export const useUserObras = () => {
  const { obras, loading, loadingAccess } = useAuth();

  return {
    data: obras as Obra[],
    isLoading: loading || loadingAccess,
  };
};
