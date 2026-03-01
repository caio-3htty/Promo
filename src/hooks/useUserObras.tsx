import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Obra {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
}

export const useUserObras = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-obras", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("obras")
        .select("*")
        .is("deleted_at", null);
      if (error) throw error;
      return data as Obra[];
    },
    enabled: !!user,
  });
};
