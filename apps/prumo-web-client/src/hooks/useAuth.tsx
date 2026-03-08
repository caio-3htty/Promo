import { useState, useEffect, createContext, useContext, type ReactNode, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "master" | "gestor" | "engenheiro" | "operacional" | "almoxarife";
export type PermissionScopeType = "tenant" | "all_obras" | "selected_obras";
export type AppLanguage = "pt-BR" | "en" | "es";
export type AccessMode = "template" | "custom";

type AccessProfile = {
  full_name: string;
  email: string | null;
  is_active: boolean;
  user_type_id: string | null;
  tenant_id: string;
  preferred_language: AppLanguage;
  access_mode: AccessMode;
};

type AccessObra = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
};

type EffectivePermission = {
  permissionKey: string;
  scopeType: PermissionScopeType;
  obraIds: string[];
  source: "template" | "custom";
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  loadingAccess: boolean;
  profile: AccessProfile | null;
  role: AppRole | null;
  roles: AppRole[];
  obras: AccessObra[];
  permissions: EffectivePermission[];
  tenantId: string | null;
  isActive: boolean;
  hasOperationalAccess: boolean;
  multiObraEnabled: boolean;
  defaultObraId: string | null;
  preferredLanguage: AppLanguage;
  refreshAccess: () => Promise<void>;
  signOut: () => Promise<void>;
  can: (permissionKey: string, obraId?: string | null) => boolean;
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
  permissions: [],
  tenantId: null,
  isActive: false,
  hasOperationalAccess: false,
  multiObraEnabled: true,
  defaultObraId: null,
  preferredLanguage: "pt-BR",
  refreshAccess: async () => {},
  signOut: async () => {},
  can: () => false,
});

const hasPermissionGrant = (
  list: EffectivePermission[],
  permissionKey: string,
  obraId?: string | null,
) => {
  return list.some((item) => {
    if (item.permissionKey !== permissionKey) {
      return false;
    }

    if (item.scopeType === "tenant" || item.scopeType === "all_obras") {
      return true;
    }

    return !!obraId && item.obraIds.includes(obraId);
  });
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [obras, setObras] = useState<AccessObra[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<EffectivePermission[]>([]);
  const [multiObraEnabled, setMultiObraEnabled] = useState(true);
  const [defaultObraId, setDefaultObraId] = useState<string | null>(null);

  const clearAccess = useCallback(() => {
    setProfile(null);
    setRole(null);
    setObras([]);
    setPermissions([]);
    setTenantId(null);
    setMultiObraEnabled(true);
    setDefaultObraId(null);
    setLoadingAccess(false);
  }, []);

  const loadAccess = useCallback(async (userId?: string) => {
    if (!userId) {
      clearAccess();
      return;
    }

    setLoadingAccess(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;
    const profileRes = await supabase
      .from("profiles")
      .select("full_name, email, is_active, user_type_id, tenant_id, preferred_language, access_mode")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileRes.error) {
      throw profileRes.error;
    }

    const profileData = (profileRes.data ?? null) as AccessProfile | null;

    if (!profileData?.tenant_id) {
      clearAccess();
      return;
    }

    const currentTenantId = profileData.tenant_id;

    const [roleRes, obrasRes, tenantSettingsRes, grantsRes, templateRes] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("tenant_id", currentTenantId)
        .maybeSingle(),
      supabase
        .from("obras")
        .select("id, name, description, address, status")
        .eq("tenant_id", currentTenantId)
        .is("deleted_at", null)
        .order("name"),
      supabaseAny
        .from("tenant_settings")
        .select("multi_obra_enabled, default_obra_id")
        .eq("tenant_id", currentTenantId)
        .maybeSingle(),
      supabaseAny
        .from("user_permission_grants")
        .select("id, permission_key, scope_type")
        .eq("tenant_id", currentTenantId)
        .eq("user_id", userId),
      profileData.user_type_id
        ? supabaseAny
            .from("user_type_permissions")
            .select("permission_key, scope_type")
            .eq("tenant_id", currentTenantId)
            .eq("user_type_id", profileData.user_type_id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (roleRes.error) throw roleRes.error;
    if (obrasRes.error) throw obrasRes.error;
    if (tenantSettingsRes.error) throw tenantSettingsRes.error;
    if (grantsRes.error) throw grantsRes.error;
    if (templateRes.error) throw templateRes.error;

    const grants = (grantsRes.data ?? []) as Array<{
      id: string;
      permission_key: string;
      scope_type: PermissionScopeType;
    }>;

    const grantIds = grants.map((grant) => grant.id);
    const grantObrasRes = grantIds.length
      ? await supabaseAny.from("user_permission_obras").select("grant_id, obra_id").in("grant_id", grantIds)
      : { data: [], error: null };

    if (grantObrasRes.error) {
      throw grantObrasRes.error;
    }

    const grantObras = (grantObrasRes.data ?? []) as Array<{ grant_id: string; obra_id: string }>;
    const obraIdsByGrant = grantObras.reduce<Record<string, string[]>>((acc, row) => {
      if (!acc[row.grant_id]) acc[row.grant_id] = [];
      acc[row.grant_id].push(row.obra_id);
      return acc;
    }, {});

    const customPermissions: EffectivePermission[] = grants.map((grant) => ({
      permissionKey: grant.permission_key,
      scopeType: grant.scope_type,
      obraIds: obraIdsByGrant[grant.id] ?? [],
      source: "custom",
    }));

    const templatePermissions: EffectivePermission[] = ((templateRes.data ?? []) as Array<{
      permission_key: string;
      scope_type: PermissionScopeType;
    }>).map((item) => ({
      permissionKey: item.permission_key,
      scopeType: item.scope_type,
      obraIds: [],
      source: "template",
    }));

    setProfile(profileData);
    setTenantId(currentTenantId);
    setRole((roleRes.data?.role ?? null) as AppRole | null);
    setObras((obrasRes.data ?? []) as AccessObra[]);
    setPermissions([...customPermissions, ...templatePermissions]);
    setMultiObraEnabled(
      Boolean(
        tenantSettingsRes.data?.multi_obra_enabled ??
          ((obrasRes.data ?? []).length > 1),
      ),
    );
    setDefaultObraId(
      (tenantSettingsRes.data?.default_obra_id as string | null) ??
        (((obrasRes.data ?? []).length === 1 ? (obrasRes.data ?? [])[0]?.id : null) ?? null),
    );
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
  }, [session?.user?.id, clearAccess, loadAccess]);

  const refreshAccess = useCallback(async () => {
    await loadAccess(session?.user?.id);
  }, [loadAccess, session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearAccess();
  };

  const isActive = !!profile?.is_active;

  const can = useCallback((permissionKey: string, obraId?: string | null) => {
    if (!isActive || !tenantId) return false;
    if (role === "master" || role === "gestor") return true;
    return hasPermissionGrant(permissions, permissionKey, obraId);
  }, [isActive, tenantId, role, permissions]);

  const hasOperationalAccess =
    isActive &&
    (!!role || permissions.length > 0) &&
    (
      role === "master" ||
      role === "gestor" ||
      obras.length > 0 ||
      can("obras.view")
    );

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
        permissions,
        tenantId,
        isActive,
        hasOperationalAccess,
        multiObraEnabled,
        defaultObraId,
        preferredLanguage: profile?.preferred_language ?? "pt-BR",
        refreshAccess,
        signOut,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
