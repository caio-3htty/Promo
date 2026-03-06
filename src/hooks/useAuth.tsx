import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AppRole = "master" | "gestor" | "engenheiro" | "operacional" | "almoxarife";

type AccessProfile = Pick<Tables<"profiles">, "full_name" | "email" | "is_active" | "user_type_id">;
type AccessObra = Pick<Tables<"obras">, "id" | "name" | "description" | "address" | "status">;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  loadingAccess: boolean;
  profile: AccessProfile | null;
  role: AppRole | null;
  roles: AppRole[];
  obras: AccessObra[];
  isActive: boolean;
  hasOperationalAccess: boolean;
  refreshAccess: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  loadingAccess: false,
  profile: null,
  role: null,
  roles: [],
  obras: [],
  isActive: false,
  hasOperationalAccess: false,
  refreshAccess: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [obras, setObras] = useState<AccessObra[]>([]);

  const clearAccess = useCallback(() => {
    setProfile(null);
    setRole(null);
    setObras([]);
    setLoadingAccess(false);
  }, []);

  const loadAccess = useCallback(async (userId?: string) => {
    if (!userId) {
      clearAccess();
      return;
    }

    setLoadingAccess(true);

    const [profileRes, roleRes, obrasRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, is_active, user_type_id")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("obras")
        .select("id, name, description, address, status")
        .is("deleted_at", null)
        .order("name"),
    ]);

    if (profileRes.error) {
      throw profileRes.error;
    }
    if (roleRes.error) {
      throw roleRes.error;
    }
    if (obrasRes.error) {
      throw obrasRes.error;
    }

    setProfile((profileRes.data ?? null) as AccessProfile | null);
    setRole((roleRes.data?.role ?? null) as AppRole | null);
    setObras((obrasRes.data ?? []) as AccessObra[]);
    setLoadingAccess(false);
  }, [clearAccess]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;

    if (!userId) {
      clearAccess();
      return;
    }

    loadAccess(userId).catch(() => {
      clearAccess();
    });
  }, [session?.user?.id, loadAccess, clearAccess]);

  const refreshAccess = useCallback(async () => {
    await loadAccess(session?.user?.id);
  }, [loadAccess, session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearAccess();
  };

  const isActive = !!profile?.is_active;
  const hasOperationalAccess = isActive && !!role && (role === "master" || role === "gestor" || obras.length > 0);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        loadingAccess,
        profile,
        role,
        roles: role ? [role] : [],
        obras,
        isActive,
        hasOperationalAccess,
        refreshAccess,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
