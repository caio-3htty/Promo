import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, HardHat, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { DataTable } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Obra = Tables<"obras">;

const roleLabelMap: Record<string, string> = {
  gestor: "Gestor",
  engenheiro: "Engenheiro",
  operacional: "Operacional",
  almoxarife: "Almoxarife",
};

const SelectObra = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { data: roles, isLoading: rolesLoading } = useUserRoles();
  const isGestor = roles?.includes("gestor");

  const [open, setOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [editing, setEditing] = useState<Obra | null>(null);
  const [form, setForm] = useState({ name: "", description: "", address: "", status: "ativa" });

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: obrasAll = [], isLoading: obrasAllLoading } = useQuery({
    queryKey: ["user-obras", user?.id, showTrash],
    queryFn: async () => {
      let query = supabase.from("obras").select("*").order("name");

      if (showTrash) {
        query = query.not("deleted_at", "is", null).gte("deleted_at", cutoff);
      } else {
        query = query.is("deleted_at", null);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data as Obra[];
    },
    enabled: !!user,
  });

  const isLoading = obrasAllLoading || rolesLoading;

  const handleSelect = (obraId: string) => {
    navigate(`/dashboard/${obraId}`);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", address: "", status: "ativa" });
    setOpen(true);
  };

  const openEdit = (obra: Obra) => {
    setEditing(obra);
    setForm({
      name: obra.name,
      description: obra.description ?? "",
      address: obra.address ?? "",
      status: obra.status,
    });
    setOpen(true);
  };

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase.from("obras").update(values).eq("id", values.id);
        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("obras").insert(values);
        if (error) {
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-obras", user?.id] });
      toast.success(editing ? "Obra atualizada" : "Obra criada");
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("obras")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-obras", user?.id] });
      toast.success("Obra enviada para a lixeira");
    },
    onError: (error) => toast.error(error.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").delete().eq("id", id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-obras", user?.id] });
      toast.success("Obra excluida permanentemente");
    },
    onError: (error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").update({ deleted_at: null }).eq("id", id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-obras", user?.id] });
      toast.success("Obra restaurada");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Nome e obrigatorio");
      return;
    }

    upsert.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const columns = [
    { key: "name", label: "Nome" },
    { key: "address", label: "Endereco" },
    ...(showTrash
      ? [
          {
            key: "deleted_at",
            label: "Excluida em",
            render: (obra: Obra) =>
              obra.deleted_at ? new Date(obra.deleted_at).toLocaleString("pt-BR") : "",
          },
        ]
      : []),
    {
      key: "status",
      label: "Status",
      render: (obra: Obra) => (
        <Badge variant={obra.status === "ativa" ? "default" : "secondary"}>{obra.status}</Badge>
      ),
    },
    ...(isGestor
      ? [
          {
            key: "_actions",
            label: "Acoes",
            render: (obra: Obra) => (
              <div className="flex gap-1">
                {showTrash ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        restore.mutate(obra.id);
                      }}
                    >
                      <Plus className="h-4 w-4 text-success" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        hardDelete.mutate(obra.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(obra);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        softDelete.mutate(obra.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl animate-fade-in">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ObraFlow</h1>
              {roles && roles.length > 0 && (
                <div className="mt-0.5 flex gap-1">
                  {roles.map((role) => (
                    <Badge key={role} variant="secondary" className="text-xs">
                      {roleLabelMap[role] || role}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sair
          </Button>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {showTrash ? "Lixeira de Obras" : "Selecione uma obra"}
            </h2>
            <p className="text-muted-foreground">
              {showTrash ? "Itens excluidos nos ultimos 30 dias" : "Escolha a obra que deseja acessar"}
            </p>
          </div>
          {isGestor && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowTrash((current) => !current)}>
                {showTrash ? "Mostrar ativos" : "Ver lixeira"}
              </Button>
              {!showTrash && (
                <Button onClick={openNew}>
                  <Plus className="mr-1 h-4 w-4" /> Nova Obra
                </Button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="max-w-sm">
            <Skeleton className="mb-2 h-10" />
            <Skeleton className="mb-2 h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : obrasAll.length > 0 ? (
          <DataTable
            data={obrasAll}
            columns={columns}
            searchKeys={["name", "address"]}
            searchPlaceholder="Buscar obras..."
            onRowClick={showTrash ? undefined : (obra) => handleSelect(obra.id)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <HardHat className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-lg font-medium text-muted-foreground">Nenhuma obra cadastrada</p>
            {isGestor && (
              <p className="mt-1 text-sm text-muted-foreground/70">
                Clique em "Nova Obra" para comecar.
              </p>
            )}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Obra" : "Nova Obra"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
              <div>
                <Label>Endereco</Label>
                <Input
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </div>
              <div>
                <Label>Descricao</Label>
                <Textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                >
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa</option>
                  <option value="concluida">Concluida</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={upsert.isPending}>
                {editing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default SelectObra;
