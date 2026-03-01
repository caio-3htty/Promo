import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "gestor" | "engenheiro" | "operacional" | "almoxarife";

export const useUserRoles = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-roles", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data?.map((r) => r.role) ?? []) as AppRole[];
    },
    enabled: !!user,
  });
};

export const useIsGestor = () => {
  const { data: roles } = useUserRoles();
  return roles?.includes("gestor") ?? false;
};
