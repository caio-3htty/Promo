import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { DataTable } from "@/components/DataTable";
import { PageShell } from "@/components/PageShell";
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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { canManageCadastros } from "@/lib/rbac";

interface Material {
  id: string;
  nome: string;
  unidade: string;
  tempo_producao_padrao: number | null;
  estoque_minimo: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const formSchema = z.object({
  nome: z.string().min(1, "Nome e obrigatorio"),
  unidade: z.string().min(1, "Unidade e obrigatoria"),
  tempo_producao_padrao: z.string().optional(),
  estoque_minimo: z.string().optional(),
});

const MateriaisManager = () => {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canManage = canManageCadastros(role);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState({
    nome: "",
    unidade: "un",
    tempo_producao_padrao: "",
    estoque_minimo: "0",
  });
  const [showTrash, setShowTrash] = useState(false);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: materiais = [], isLoading } = useQuery({
    queryKey: ["materiais", showTrash],
    queryFn: async () => {
      let query = supabase.from("materiais").select("*").order("nome");

      if (showTrash) {
        query = query.not("deleted_at", "is", null).gte("deleted_at", cutoff);
      } else {
        query = query.is("deleted_at", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Material[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: {
      nome: string;
      unidade: string;
      tempo_producao_padrao: number | null;
      estoque_minimo: number;
      id?: string;
    }) => {
      if (values.id) {
        const { id, ...payload } = values;
        const { error } = await supabase.from("materiais").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { id, ...payload } = values;
        const { error } = await supabase.from("materiais").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materiais"] });
      toast.success(editing ? "Material atualizado" : "Material criado");
      closeDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("materiais")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materiais", showTrash] });
      toast.success("Material enviado para a lixeira");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("materiais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materiais", showTrash] });
      toast.success("Material excluido permanentemente");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("materiais").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materiais", showTrash] });
      toast.success("Material restaurado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", unidade: "un", tempo_producao_padrao: "", estoque_minimo: "0" });
    setOpen(true);
  };

  const openEdit = (material: Material) => {
    setEditing(material);
    setForm({
      nome: material.nome,
      unidade: material.unidade,
      tempo_producao_padrao: material.tempo_producao_padrao?.toString() ?? "",
      estoque_minimo: material.estoque_minimo.toString(),
    });
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
  };

  const handleSubmit = () => {
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados invalidos");
      return;
    }

    const payload = {
      nome: form.nome,
      unidade: form.unidade,
      tempo_producao_padrao: form.tempo_producao_padrao
        ? Number.parseInt(form.tempo_producao_padrao, 10)
        : null,
      estoque_minimo: Number.parseFloat(form.estoque_minimo) || 0,
      ...(editing ? { id: editing.id } : {}),
    };

    upsert.mutate(payload);
  };

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "unidade", label: "Unidade" },
    ...(showTrash
      ? [
          {
            key: "deleted_at",
            label: "Excluido em",
            render: (item: Material) =>
              item.deleted_at ? new Date(item.deleted_at).toLocaleString("pt-BR") : "",
          },
        ]
      : []),
    {
      key: "tempo_producao_padrao",
      label: "Tempo Producao (dias)",
      render: (item: Material) => item.tempo_producao_padrao ?? "-",
    },
    { key: "estoque_minimo", label: "Estoque Minimo" },
    ...(canManage
      ? [
          {
            key: "_actions",
            label: "Acoes",
            render: (item: Material) => (
              <div className="flex gap-1">
                {showTrash ? (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => restore.mutate(item.id)}>
                      <Plus className="h-4 w-4 text-success" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => hardDelete.mutate(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => softDelete.mutate(item.id)}>
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
    <PageShell title="Materiais">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {showTrash ? "Lixeira de Materiais" : "Gerenciar Materiais"}
          </h2>
          <p className="text-muted-foreground">
            {showTrash ? "Registros apagados (30 dias)" : ""}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTrash(!showTrash)}>
              {showTrash ? "Mostrar ativos" : "Ver lixeira"}
            </Button>
            {!showTrash && (
              <Button onClick={openNew}>
                <Plus className="mr-1 h-4 w-4" /> Novo Material
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <DataTable
          data={materiais}
          columns={columns}
          searchKeys={["nome", "unidade"]}
          searchPlaceholder="Buscar materiais..."
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Material" : "Novo Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
            </div>
            <div>
              <Label>Unidade *</Label>
              <Input
                value={form.unidade}
                onChange={(event) => setForm({ ...form, unidade: event.target.value })}
                placeholder="un, kg, m3..."
              />
            </div>
            <div>
              <Label>Tempo de Producao Padrao (dias)</Label>
              <Input
                type="number"
                value={form.tempo_producao_padrao}
                onChange={(event) => setForm({ ...form, tempo_producao_padrao: event.target.value })}
              />
            </div>
            <div>
              <Label>Estoque Minimo</Label>
              <Input
                type="number"
                step="0.01"
                value={form.estoque_minimo}
                onChange={(event) => setForm({ ...form, estoque_minimo: event.target.value })}
              />
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
    </PageShell>
  );
};

export default MateriaisManager;
