import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/PageShell";
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
  full_name: string;
  email: string | null;
  is_active: boolean;
  user_type_id: string | null;
  role: AppRole | null;
  obraIds: string[];
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

  const [drafts, setDrafts] = useState<Record<string, EditableUser>>({});
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<CompanyUserType | null>(null);
  const [typeForm, setTypeForm] = useState<TypeForm>(defaultTypeForm);

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-users-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, is_active, user_type_id")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
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
        full_name: profile.full_name || "(sem nome)",
        email: profile.email,
        is_active: profile.is_active,
        user_type_id: profile.user_type_id,
        role: roleByUserId[profile.user_id] ?? null,
        obraIds: obraIdsByUserId[profile.user_id] ?? [],
      };
      return drafts[profile.user_id] ?? fallback;
    });
  }, [profiles, drafts, roleByUserId, obraIdsByUserId]);

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

  const saveUser = useMutation({
    mutationFn: async (payload: EditableUser) => {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          is_active: payload.is_active,
          user_type_id: payload.user_type_id,
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
          {loadingProfiles ? (
            <p className="text-muted-foreground">Carregando usuarios...</p>
          ) : (
            users.map((row) => {
              const selectedType = row.user_type_id ? typeById[row.user_type_id] : null;
              const effectiveRole = selectedType?.base_role ?? row.role;

              return (
                <Card key={row.user_id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{row.full_name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{row.email ?? row.user_id}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
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
