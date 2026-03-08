import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/PageShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { roleLabelMap } from "@/lib/rbac";

type CompanyUserType = {
  id: string;
  name: string;
  description: string | null;
  base_role: AppRole;
  is_active: boolean;
};

type EditableUser = {
  user_id: string;
  tenant_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  user_type_id: string | null;
  access_mode: "template" | "custom";
  role: AppRole | null;
  obraIds: string[];
  grants: Array<{
    permission_key: string;
    scope_type: "tenant" | "all_obras" | "selected_obras";
    obraIds: string[];
  }>;
};

type PermissionCatalogItem = {
  key: string;
  area: string;
  label_pt: string;
  obra_scoped: boolean;
  is_active: boolean;
};

type TypeForm = {
  name: string;
  description: string;
  base_role: AppRole;
  is_active: boolean;
};

const defaultTypeForm: TypeForm = {
  name: "",
  description: "",
  base_role: "operacional",
  is_active: true,
};

const baseRoleOptions: Array<{ value: AppRole; label: string }> = [
  { value: "master", label: "Master" },
  { value: "gestor", label: "Gestor" },
  { value: "engenheiro", label: "Engenheiro" },
  { value: "operacional", label: "Operacional" },
  { value: "almoxarife", label: "Almoxarife" },
];

const UsuariosAcessos = () => {
  const queryClient = useQueryClient();
  const { user, refreshAccess } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const [drafts, setDrafts] = useState<Record<string, EditableUser>>({});
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<CompanyUserType | null>(null);
  const [typeForm, setTypeForm] = useState<TypeForm>(defaultTypeForm);

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-users-profiles"],
    queryFn: async () => {
      const { data, error } = await supabaseAny
        .from("profiles")
        .select("id, user_id, tenant_id, full_name, email, is_active, user_type_id, access_mode")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        user_id: string;
        tenant_id: string;
        full_name: string;
        email: string | null;
        is_active: boolean;
        user_type_id: string | null;
        access_mode: "template" | "custom";
      }>;
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["admin-users-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("id, user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: userTypes = [] } = useQuery({
    queryKey: ["admin-user-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_types")
        .select("id, name, description, base_role, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CompanyUserType[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["admin-users-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_obras")
        .select("id, user_id, obra_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["admin-obras-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: permissionCatalog = [] } = useQuery({
    queryKey: ["admin-permission-catalog"],
    queryFn: async () => {
      const { data, error } = await supabaseAny
        .from("permission_catalog")
        .select("key, area, label_pt, obra_scoped, is_active")
        .eq("is_active", true)
        .order("area")
        .order("key");
      if (error) throw error;
      return (data ?? []) as PermissionCatalogItem[];
    },
  });

  const { data: permissionGrants = [] } = useQuery({
    queryKey: ["admin-users-permission-grants"],
    queryFn: async () => {
      const { data: grantsData, error: grantsError } = await supabaseAny
        .from("user_permission_grants")
        .select("id, user_id, permission_key, scope_type");
      if (grantsError) throw grantsError;

      const grants = (grantsData ?? []) as Array<{
        id: string;
        user_id: string;
        permission_key: string;
        scope_type: "tenant" | "all_obras" | "selected_obras";
      }>;

      if (grants.length === 0) return [];

      const ids = grants.map((grant) => grant.id);
      const { data: grantObrasData, error: grantObrasError } = await supabaseAny
        .from("user_permission_obras")
        .select("grant_id, obra_id")
        .in("grant_id", ids);
      if (grantObrasError) throw grantObrasError;

      const grantObras = (grantObrasData ?? []) as Array<{ grant_id: string; obra_id: string }>;
      const obraIdsByGrant = grantObras.reduce<Record<string, string[]>>((acc, item) => {
        if (!acc[item.grant_id]) acc[item.grant_id] = [];
        acc[item.grant_id].push(item.obra_id);
        return acc;
      }, {});

      return grants.map((grant) => ({
        user_id: grant.user_id,
        permission_key: grant.permission_key,
        scope_type: grant.scope_type,
        obraIds: obraIdsByGrant[grant.id] ?? [],
      }));
    },
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, entity_table, action, changed_by, target_user_id, obra_id, old_data, new_data, created_at")
        .in("entity_table", ["user_roles", "user_obras", "profiles", "user_types"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const roleByUserId = useMemo(() => {
    return roles.reduce<Record<string, AppRole>>((acc, item) => {
      acc[item.user_id] = item.role as AppRole;
      return acc;
    }, {});
  }, [roles]);

  const typeById = useMemo(() => {
    return userTypes.reduce<Record<string, CompanyUserType>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [userTypes]);

  const obraIdsByUserId = useMemo(() => {
    return assignments.reduce<Record<string, string[]>>((acc, item) => {
      if (!acc[item.user_id]) acc[item.user_id] = [];
      acc[item.user_id].push(item.obra_id);
      return acc;
    }, {});
  }, [assignments]);

  const grantsByUserId = useMemo(() => {
    return permissionGrants.reduce<
      Record<
        string,
        Array<{
          permission_key: string;
          scope_type: "tenant" | "all_obras" | "selected_obras";
          obraIds: string[];
        }>
      >
    >((acc, item) => {
      if (!acc[item.user_id]) acc[item.user_id] = [];
      acc[item.user_id].push({
        permission_key: item.permission_key,
        scope_type: item.scope_type,
        obraIds: item.obraIds,
      });
      return acc;
    }, {});
  }, [permissionGrants]);

  const nameByUserId = useMemo(() => {
    return profiles.reduce<Record<string, string>>((acc, profile) => {
      acc[profile.user_id] = profile.full_name || profile.email || profile.user_id;
      return acc;
    }, {});
  }, [profiles]);

  const users = useMemo(() => {
    return profiles.map((profile) => {
      const fallback: EditableUser = {
        user_id: profile.user_id,
        tenant_id: profile.tenant_id,
        full_name: profile.full_name || "(sem nome)",
        email: profile.email,
        is_active: profile.is_active,
        user_type_id: profile.user_type_id,
        access_mode: (profile.access_mode ?? "template") as "template" | "custom",
        role: roleByUserId[profile.user_id] ?? null,
        obraIds: obraIdsByUserId[profile.user_id] ?? [],
        grants: grantsByUserId[profile.user_id] ?? [],
      };
      return drafts[profile.user_id] ?? fallback;
    });
  }, [profiles, drafts, roleByUserId, obraIdsByUserId, grantsByUserId]);

  const activeUsersCount = useMemo(
    () => users.filter((item) => item.is_active).length,
    [users],
  );
  const isSmallCompany = useMemo(
    () => obras.length <= 2 || activeUsersCount <= 15,
    [obras.length, activeUsersCount],
  );

  const updateDraft = (userId: string, updater: (current: EditableUser) => EditableUser) => {
    setDrafts((current) => {
      const base = current[userId] ?? users.find((row) => row.user_id === userId);
      if (!base) return current;
      return {
        ...current,
        [userId]: updater(base),
      };
    });
  };

  const upsertGrant = (
    current: EditableUser,
    permissionKey: string,
    checked: boolean,
    obraScoped: boolean,
  ): EditableUser => {
    const hasGrant = current.grants.some((item) => item.permission_key === permissionKey);
    if (!checked && hasGrant) {
      return {
        ...current,
        grants: current.grants.filter((item) => item.permission_key !== permissionKey),
      };
    }
    if (!checked) return current;
    if (hasGrant) return current;

    return {
      ...current,
      grants: [
        ...current.grants,
        {
          permission_key: permissionKey,
          scope_type: obraScoped ? "all_obras" : "tenant",
          obraIds: [],
        },
      ],
    };
  };

  const saveUser = useMutation({
    mutationFn: async (payload: EditableUser) => {
      const { error: profileError } = await supabaseAny
        .from("profiles")
        .update({
          is_active: payload.is_active,
          user_type_id: payload.user_type_id,
          access_mode: payload.access_mode,
        })
        .eq("user_id", payload.user_id);
      if (profileError) throw profileError;

      const selectedType = payload.user_type_id ? typeById[payload.user_type_id] : null;
      const roleToPersist: AppRole | null = selectedType?.base_role ?? payload.role ?? null;

      if (roleToPersist) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .upsert({ user_id: payload.user_id, role: roleToPersist }, { onConflict: "user_id" });
        if (roleError) throw roleError;
      } else {
        const { error: roleDeleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", payload.user_id);
        if (roleDeleteError) throw roleDeleteError;
      }

      const currentObraIds = obraIdsByUserId[payload.user_id] ?? [];
      const toAdd = payload.obraIds.filter((obraId) => !currentObraIds.includes(obraId));
      const toRemove = currentObraIds.filter((obraId) => !payload.obraIds.includes(obraId));

      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from("user_obras")
          .delete()
          .eq("user_id", payload.user_id)
          .in("obra_id", toRemove);
        if (removeError) throw removeError;
      }

      if (toAdd.length > 0) {
        const rows = toAdd.map((obraId) => ({ user_id: payload.user_id, obra_id: obraId }));
        const { error: addError } = await supabase.from("user_obras").insert(rows);
        if (addError) throw addError;
      }

      const { data: existingGrantsData, error: existingGrantsError } = await supabaseAny
        .from("user_permission_grants")
        .select("id")
        .eq("user_id", payload.user_id);
      if (existingGrantsError) throw existingGrantsError;

      const existingGrantIds = ((existingGrantsData ?? []) as Array<{ id: string }>).map((item) => item.id);
      if (existingGrantIds.length > 0) {
        const { error: deleteGrantObrasError } = await supabaseAny
          .from("user_permission_obras")
          .delete()
          .in("grant_id", existingGrantIds);
        if (deleteGrantObrasError) throw deleteGrantObrasError;
      }

      const { error: deleteGrantsError } = await supabaseAny
        .from("user_permission_grants")
        .delete()
        .eq("user_id", payload.user_id);
      if (deleteGrantsError) throw deleteGrantsError;

      if (payload.access_mode === "custom" && payload.grants.length > 0) {
        for (const grant of payload.grants) {
          const { data: insertedGrant, error: insertGrantError } = await supabaseAny
            .from("user_permission_grants")
            .insert({
              tenant_id: payload.tenant_id,
              user_id: payload.user_id,
              permission_key: grant.permission_key,
              scope_type: grant.scope_type,
              granted_by: user?.id ?? null,
            })
            .select("id")
            .single();
          if (insertGrantError) throw insertGrantError;

          if (grant.scope_type === "selected_obras" && grant.obraIds.length > 0) {
            const rows = grant.obraIds.map((obraId) => ({
              grant_id: insertedGrant.id,
              obra_id: obraId,
            }));
            const { error: insertGrantObrasError } = await supabaseAny
              .from("user_permission_obras")
              .insert(rows);
            if (insertGrantObrasError) throw insertGrantObrasError;
          }
        }
      }
    },
    onSuccess: async (_result, payload) => {
      toast.success("Usuario atualizado");
      setDrafts((current) => {
        const next = { ...current };
        delete next[payload.user_id];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users-assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users-permission-grants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] }),
      ]);

      if (user?.id === payload.user_id) {
        await refreshAccess();
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const upsertUserType = useMutation({
    mutationFn: async (payload: TypeForm & { id?: string }) => {
      const values = {
        name: payload.name.trim(),
        description: payload.description.trim() || null,
        base_role: payload.base_role,
        is_active: payload.is_active,
        created_by: user?.id ?? null,
      };

      if (payload.id) {
        const { error } = await supabase.from("user_types").update(values).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_types").insert(values);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(editingType ? "Tipo atualizado" : "Tipo criado");
      setTypeDialogOpen(false);
      setEditingType(null);
      setTypeForm(defaultTypeForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-user-types"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users-roles"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openCreateType = () => {
    setEditingType(null);
    setTypeForm(defaultTypeForm);
    setTypeDialogOpen(true);
  };

  const openEditType = (type: CompanyUserType) => {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      description: type.description ?? "",
      base_role: type.base_role,
      is_active: type.is_active,
    });
    setTypeDialogOpen(true);
  };

  const saveType = () => {
    if (!typeForm.name.trim()) {
      toast.error("Nome do tipo e obrigatorio");
      return;
    }

    upsertUserType.mutate({
      ...typeForm,
      ...(editingType ? { id: editingType.id } : {}),
    });
  };

  return (
    <PageShell title="Usuarios e Acessos">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Administracao de Usuarios</h2>
          <p className="text-sm text-muted-foreground">
            Usuario master gerencia usuarios, tipos da empresa e vinculos de obra.
          </p>
        </div>
        <Badge variant="secondary">{users.length} usuarios</Badge>
      </div>

      <Tabs defaultValue="usuarios" className="space-y-6">
        <TabsList>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="tipos">Tipos de Usuario</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          {isSmallCompany && (
            <Alert>
              <AlertTitle>Template recomendado para empresa menor</AlertTitle>
              <AlertDescription>
                Detectamos até 2 obras ativas ou até 15 usuários ativos. O fluxo recomendado é usar templates prontos e
                ajustar somente exceções.
              </AlertDescription>
            </Alert>
          )}

          {loadingProfiles ? (
            <p className="text-muted-foreground">Carregando usuarios...</p>
          ) : (
            users.map((row) => {
              const selectedType = row.user_type_id ? typeById[row.user_type_id] : null;
              const effectiveRole = selectedType?.base_role ?? row.role;
              const grantsByKey = row.grants.reduce<Record<string, EditableUser["grants"][number]>>((acc, item) => {
                acc[item.permission_key] = item;
                return acc;
              }, {});

              return (
                <Card key={row.user_id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{row.full_name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{row.email ?? row.user_id}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Ativo</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.is_active}
                            onCheckedChange={(checked) =>
                              updateDraft(row.user_id, (current) => ({ ...current, is_active: checked }))
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {row.is_active ? "ativo" : "inativo"}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Tipo de usuario</Label>
                        <Select
                          value={row.user_type_id ?? "none"}
                          onValueChange={(value) =>
                            updateDraft(row.user_id, (current) => ({
                              ...current,
                              user_type_id: value === "none" ? null : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem tipo</SelectItem>
                            {userTypes.map((userType) => (
                              <SelectItem key={userType.id} value={userType.id}>
                                {userType.name} ({roleLabelMap[userType.base_role]})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Resumo</Label>
                        <p className="text-sm text-muted-foreground">
                          {effectiveRole ? roleLabelMap[effectiveRole] : "Sem papel"} - {row.obraIds.length} obra(s)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Modo de acesso</Label>
                        <Select
                          value={row.access_mode}
                          onValueChange={(value) =>
                            updateDraft(row.user_id, (current) => ({
                              ...current,
                              access_mode: value as "template" | "custom",
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="template">Template recomendado</SelectItem>
                            <SelectItem value="custom">Personalizado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Obras vinculadas</Label>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {obras.map((obra) => {
                          const checked = row.obraIds.includes(obra.id);
                          return (
                            <label
                              key={obra.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(nextChecked) =>
                                  updateDraft(row.user_id, (current) => {
                                    const obraSet = new Set(current.obraIds);
                                    if (nextChecked) obraSet.add(obra.id);
                                    else obraSet.delete(obra.id);

                                    return {
                                      ...current,
                                      obraIds: Array.from(obraSet),
                                    };
                                  })
                                }
                              />
                              <span className="text-sm">{obra.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {row.access_mode === "custom" && (
                      <div className="space-y-3 rounded-md border border-border p-3">
                        <Label>Permissões personalizadas</Label>
                        <div className="space-y-3">
                          {permissionCatalog.map((permission) => {
                            const grant = grantsByKey[permission.key];
                            const checked = !!grant;
                            return (
                              <div key={permission.key} className="rounded-md border border-border p-3">
                                <div className="flex flex-wrap items-center gap-3">
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(nextChecked) =>
                                        updateDraft(row.user_id, (current) =>
                                          upsertGrant(current, permission.key, Boolean(nextChecked), permission.obra_scoped),
                                        )
                                      }
                                    />
                                    <span className="text-sm font-medium">{permission.label_pt}</span>
                                  </label>
                                  <Badge variant="outline">{permission.area}</Badge>
                                </div>

                                {checked && grant && (
                                  <div className="mt-3 space-y-2">
                                    <Label>Escopo</Label>
                                    <Select
                                      value={grant.scope_type}
                                      onValueChange={(value) =>
                                        updateDraft(row.user_id, (current) => ({
                                          ...current,
                                          grants: current.grants.map((item) =>
                                            item.permission_key === permission.key
                                              ? {
                                                  ...item,
                                                  scope_type: value as "tenant" | "all_obras" | "selected_obras",
                                                  obraIds: value === "selected_obras" ? item.obraIds : [],
                                                }
                                              : item,
                                          ),
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="max-w-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="tenant">Tenant inteiro</SelectItem>
                                        {permission.obra_scoped && <SelectItem value="all_obras">Todas as obras</SelectItem>}
                                        {permission.obra_scoped && <SelectItem value="selected_obras">Obras selecionadas</SelectItem>}
                                      </SelectContent>
                                    </Select>

                                    {grant.scope_type === "selected_obras" && (
                                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {obras.map((obra) => {
                                          const selected = grant.obraIds.includes(obra.id);
                                          return (
                                            <label
                                              key={`${permission.key}-${obra.id}`}
                                              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2"
                                            >
                                              <Checkbox
                                                checked={selected}
                                                onCheckedChange={(nextChecked) =>
                                                  updateDraft(row.user_id, (current) => ({
                                                    ...current,
                                                    grants: current.grants.map((item) => {
                                                      if (item.permission_key !== permission.key) return item;
                                                      const obraSet = new Set(item.obraIds);
                                                      if (nextChecked) obraSet.add(obra.id);
                                                      else obraSet.delete(obra.id);
                                                      return { ...item, obraIds: Array.from(obraSet) };
                                                    }),
                                                  }))
                                                }
                                              />
                                              <span className="text-sm">{obra.name}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button onClick={() => saveUser.mutate(row)} disabled={saveUser.isPending}>
                        Salvar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          <div className="mt-8">
            <h3 className="mb-3 text-lg font-semibold">Log de alteracoes (acesso)</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left">Quando</th>
                    <th className="px-4 py-3 text-left">Entidade</th>
                    <th className="px-4 py-3 text-left">Acao</th>
                    <th className="px-4 py-3 text-left">Alvo</th>
                    <th className="px-4 py-3 text-left">Autor</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.id} className="border-t border-border">
                      <td className="px-4 py-3">{new Date(entry.created_at).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3">{entry.entity_table}</td>
                      <td className="px-4 py-3">{entry.action}</td>
                      <td className="px-4 py-3">
                        {nameByUserId[entry.target_user_id ?? ""] ?? entry.target_user_id ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {nameByUserId[entry.changed_by ?? ""] ?? entry.changed_by ?? "-"}
                      </td>
                    </tr>
                  ))}
                  {auditLog.length === 0 && (
                    <tr>
                      <td className="px-4 py-3 text-muted-foreground" colSpan={5}>
                        Nenhuma alteracao registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tipos" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Tipos de Usuario da Empresa</h3>
              <p className="text-sm text-muted-foreground">
                Cada tipo define um papel base de permissao no sistema.
              </p>
            </div>
            <Button onClick={openCreateType}>
              <Plus className="mr-1 h-4 w-4" />
              Novo Tipo
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {userTypes.map((userType) => (
              <Card key={userType.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{userType.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{userType.description || "Sem descricao"}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{roleLabelMap[userType.base_role]}</Badge>
                    <Badge variant={userType.is_active ? "default" : "outline"}>
                      {userType.is_active ? "ativo" : "inativo"}
                    </Badge>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEditType(userType)}>
                      <Pencil className="mr-1 h-4 w-4" />
                      Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? "Editar Tipo de Usuario" : "Novo Tipo de Usuario"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={typeForm.name}
                onChange={(event) => setTypeForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex.: Supervisor de Compras"
              />
            </div>
            <div>
              <Label>Descricao</Label>
              <Input
                value={typeForm.description}
                onChange={(event) => setTypeForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Descricao resumida do tipo"
              />
            </div>
            <div>
              <Label>Papel base *</Label>
              <Select
                value={typeForm.base_role}
                onValueChange={(value) =>
                  setTypeForm((current) => ({ ...current, base_role: value as AppRole }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {baseRoleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={typeForm.is_active}
                onCheckedChange={(checked) => setTypeForm((current) => ({ ...current, is_active: checked }))}
              />
              <Label>Tipo ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveType} disabled={upsertUserType.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
};

export default UsuariosAcessos;
