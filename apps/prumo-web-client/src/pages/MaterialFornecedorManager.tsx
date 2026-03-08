import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { canManageCadastros } from "@/lib/rbac";

interface MaterialFornecedor {
  id: string;
  material_id: string;
  fornecedor_id: string;
  preco_atual: number;
  pedido_minimo: number;
  lead_time_dias: number;
  validade_preco: string | null;
  ultima_atualizacao: string;
  atualizado_por: string | null;
  materiais: { nome: string; unidade: string } | null;
  fornecedores: { nome: string; cnpj: string } | null;
}

interface FormState {
  material_id: string;
  fornecedor_id: string;
  preco_atual: string;
  pedido_minimo: string;
  lead_time_dias: string;
  validade_preco: string;
}

const formSchema = z.object({
  material_id: z.string().min(1, "Selecione um material"),
  fornecedor_id: z.string().min(1, "Selecione um fornecedor"),
  preco_atual: z.string().refine((value) => Number(value) > 0, "Preco deve ser maior que zero"),
  pedido_minimo: z.string().optional(),
  lead_time_dias: z.string().optional(),
  validade_preco: z.string().optional(),
});

const emptyForm: FormState = {
  material_id: "",
  fornecedor_id: "",
  preco_atual: "",
  pedido_minimo: "",
  lead_time_dias: "",
  validade_preco: "",
};

const MaterialFornecedorManager = () => {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const canManage = canManageCadastros(role);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialFornecedor | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["material_fornecedor", showTrash],
    queryFn: async () => {
      let query = supabase
        .from("material_fornecedor")
        .select("*, materiais(nome, unidade), fornecedores(nome, cnpj)")
        .order("ultima_atualizacao", { ascending: false });
      if (showTrash) {
        query = query.not("deleted_at", "is", null).gte("deleted_at", cutoff);
      } else {
        query = query.is("deleted_at", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MaterialFornecedor[];
    },
  });

  const { data: materiais = [] } = useQuery({
    queryKey: ["materiais-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materiais")
        .select("id, nome, unidade")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["fornecedores-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, nome, cnpj")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const normalized = search.toLowerCase();
    return items.filter(
      (item) =>
        item.materiais?.nome?.toLowerCase().includes(normalized) ||
        item.fornecedores?.nome?.toLowerCase().includes(normalized) ||
        item.fornecedores?.cnpj?.toLowerCase().includes(normalized),
    );
  }, [items, search]);

  const upsert = useMutation({
    mutationFn: async (values: FormState & { id?: string }) => {
      const payload = {
        material_id: values.material_id,
        fornecedor_id: values.fornecedor_id,
        preco_atual: Number(values.preco_atual) || 0,
        pedido_minimo: Number(values.pedido_minimo) || 0,
        lead_time_dias: Number(values.lead_time_dias) || 0,
        validade_preco: values.validade_preco || null,
        ultima_atualizacao: new Date().toISOString(),
        atualizado_por: user?.id ?? null,
      };
      if (values.id) {
        const { error } = await supabase.from("material_fornecedor").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("material_fornecedor").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material_fornecedor", showTrash] });
      toast.success(editing ? "Vinculo atualizado" : "Vinculo criado");
      closeDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("material_fornecedor")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material_fornecedor", showTrash] });
      toast.success("Vinculo enviado para a lixeira");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("material_fornecedor").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material_fornecedor", showTrash] });
      toast.success("Vinculo excluido permanentemente");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("material_fornecedor").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material_fornecedor", showTrash] });
      toast.success("Vinculo restaurado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (item: MaterialFornecedor) => {
    setEditing(item);
    setForm({
      material_id: item.material_id,
      fornecedor_id: item.fornecedor_id,
      preco_atual: String(item.preco_atual),
      pedido_minimo: String(item.pedido_minimo),
      lead_time_dias: String(item.lead_time_dias),
      validade_preco: item.validade_preco ?? "",
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

    upsert.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <PageShell title="Material x Fornecedor">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {showTrash ? "Lixeira de Vinculos" : "Precos e Fornecedores"}
          </h2>
          <p className="text-muted-foreground">
            {showTrash ? "Registros apagados (30 dias)" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="outline" onClick={() => setShowTrash(!showTrash)}>
              {showTrash ? "Mostrar ativos" : "Ver lixeira"}
            </Button>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar material ou fornecedor..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-64 pl-9"
            />
          </div>
          {canManage && !showTrash && (
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" />
              Novo Vinculo
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">Nenhum registro encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Material</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fornecedor</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Preco Atual</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Pedido Min.</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Lead Time</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Validade</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-border transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {item.materiais?.nome}
                    <span className="ml-1 text-xs text-muted-foreground">({item.materiais?.unidade})</span>
                  </td>
                  <td className="px-4 py-3">{item.fornecedores?.nome}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(item.preco_atual)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.pedido_minimo}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.lead_time_dias} dias</td>
                  <td className="px-4 py-3">
                    {item.validade_preco
                      ? new Date(item.validade_preco).toLocaleDateString("pt-BR")
                      : "-"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Vinculo" : "Novo Vinculo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Material *</Label>
              <Select
                value={form.material_id}
                onValueChange={(value) => setForm({ ...form, material_id: value })}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o material" />
                </SelectTrigger>
                <SelectContent>
                  {materiais.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.nome} ({material.unidade})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor *</Label>
              <Select
                value={form.fornecedor_id}
                onValueChange={(value) => setForm({ ...form, fornecedor_id: value })}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map((fornecedor) => (
                    <SelectItem key={fornecedor.id} value={fornecedor.id}>
                      {fornecedor.nome} - {fornecedor.cnpj}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Preco Atual (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.preco_atual}
                  onChange={(event) => setForm({ ...form, preco_atual: event.target.value })}
                />
              </div>
              <div>
                <Label>Pedido Minimo</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.pedido_minimo}
                  onChange={(event) => setForm({ ...form, pedido_minimo: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Lead Time (dias)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.lead_time_dias}
                  onChange={(event) => setForm({ ...form, lead_time_dias: event.target.value })}
                />
              </div>
              <div>
                <Label>Validade do Preco</Label>
                <Input
                  type="date"
                  value={form.validade_preco}
                  onChange={(event) => setForm({ ...form, validade_preco: event.target.value })}
                />
              </div>
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

export default MaterialFornecedorManager;
