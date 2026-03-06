import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { canManageCadastros } from "@/lib/rbac";

interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string;
  contatos: string | null;
  entrega_propria: boolean;
  ultima_atualizacao: string;
  atualizado_por: string | null;
  created_at: string;
  deleted_at: string | null;
}

const formSchema = z.object({
  nome: z.string().min(1, "Nome e obrigatorio"),
  cnpj: z
    .string()
    .min(1, "CNPJ e obrigatorio")
    .refine((value) => /^\d{14}$/.test(value.replace(/\D/g, "")), "CNPJ invalido"),
  contatos: z.string().optional(),
  entrega_propria: z.boolean(),
});

const FornecedoresManager = () => {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const canManage = canManageCadastros(role);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState({ nome: "", cnpj: "", contatos: "", entrega_propria: false });
  const [showTrash, setShowTrash] = useState(false);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: fornecedores = [], isLoading } = useQuery({
    queryKey: ["fornecedores", showTrash],
    queryFn: async () => {
      let query = supabase.from("fornecedores").select("*").order("nome");

      if (showTrash) {
        query = query.not("deleted_at", "is", null).gte("deleted_at", cutoff);
      } else {
        query = query.is("deleted_at", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Fornecedor[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        ...values,
        ultima_atualizacao: new Date().toISOString(),
        atualizado_por: user?.id,
      };

      if (values.id) {
        const { error } = await supabase.from("fornecedores").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fornecedores").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fornecedores", showTrash] });
      toast.success(editing ? "Fornecedor atualizado" : "Fornecedor criado");
      closeDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fornecedores")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fornecedores", showTrash] });
      toast.success("Fornecedor enviado para a lixeira");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fornecedores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fornecedores", showTrash] });
      toast.success("Fornecedor excluido permanentemente");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fornecedores").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fornecedores", showTrash] });
      toast.success("Fornecedor restaurado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", cnpj: "", contatos: "", entrega_propria: false });
    setOpen(true);
  };

  const openEdit = (fornecedor: Fornecedor) => {
    setEditing(fornecedor);
    setForm({
      nome: fornecedor.nome,
      cnpj: fornecedor.cnpj,
      contatos: fornecedor.contatos ?? "",
      entrega_propria: fornecedor.entrega_propria,
    });
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
  };

  const handleSubmit = async () => {
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados invalidos");
      return;
    }

    if (!editing) {
      const { data: existing, error } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("cnpj", form.cnpj)
        .limit(1);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (existing && existing.length > 0) {
        toast.error("CNPJ ja cadastrado");
        return;
      }
    }

    upsert.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "cnpj", label: "CNPJ" },
    { key: "contatos", label: "Contatos" },
    ...(showTrash
      ? [
          {
            key: "deleted_at",
            label: "Excluido em",
            render: (item: Fornecedor) =>
              item.deleted_at ? new Date(item.deleted_at).toLocaleString("pt-BR") : "",
          },
        ]
      : []),
    {
      key: "entrega_propria",
      label: "Entrega Propria",
      render: (item: Fornecedor) =>
        item.entrega_propria ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground" />
        ),
    },
    ...(canManage
      ? [
          {
            key: "_actions",
            label: "Acoes",
            render: (item: Fornecedor) => (
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
    <PageShell title="Fornecedores">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {showTrash ? "Lixeira de Fornecedores" : "Gerenciar Fornecedores"}
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
                <Plus className="mr-1 h-4 w-4" />
                Novo Fornecedor
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <DataTable
          data={fornecedores}
          columns={columns}
          searchKeys={["nome", "cnpj"]}
          searchPlaceholder="Buscar fornecedores..."
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
            </div>
            <div>
              <Label>CNPJ *</Label>
              <Input
                value={form.cnpj}
                onChange={(event) => setForm({ ...form, cnpj: event.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <Label>Contatos</Label>
              <Input
                value={form.contatos}
                onChange={(event) => setForm({ ...form, contatos: event.target.value })}
                placeholder="Email, telefone..."
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.entrega_propria}
                onCheckedChange={(checked) => setForm({ ...form, entrega_propria: checked })}
              />
              <Label>Entrega propria</Label>
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

export default FornecedoresManager;
