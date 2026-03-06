import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Eye, X } from "lucide-react";
import { useParams } from "react-router-dom";

interface PedidoCompra {
  id: string;
  obra_id: string;
  material_id: string;
  fornecedor_id: string;
  quantidade: number;
  preco_unit: number;
  total: number;
  status: string;
  codigo_compra: string | null;
  criado_por: string | null;
  criado_em: string;
  deleted_at: string | null;
  obras: { name: string } | null;
  materiais: { nome: string; unidade: string } | null;
  fornecedores: { nome: string } | null;
}

interface FormState {
  obra_id: string;
  material_id: string;
  fornecedor_id: string;
  quantidade: string;
  preco_unit: string;
  status: string;
  codigo_compra: string;
}

const emptyForm: FormState = {
  obra_id: "",
  material_id: "",
  fornecedor_id: "",
  quantidade: "",
  preco_unit: "",
  status: "pendente",
  codigo_compra: "",
};

const statusOptions = [
  { value: "pendente", label: "Pendente" },
  { value: "aprovado", label: "Aprovado" },
  { value: "enviado", label: "Enviado" },
  { value: "entregue", label: "Entregue" },
  { value: "cancelado", label: "Cancelado" },
];

const statusColor = (s: string) => {
  switch (s) {
    case "pendente": return "secondary";
    case "aprovado": return "default";
    case "enviado": return "outline";
    case "entregue": return "default";
    case "cancelado": return "destructive";
    default: return "secondary";
  }
};

const PedidosCompraManager = () => {
  const { obraId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: roles } = useUserRoles();
  const isGestor = roles?.includes("gestor");

  const [open, setOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<PedidoCompra | null>(null);
  const [editing, setEditing] = useState<PedidoCompra | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [filterObra, setFilterObra] = useState<string>(obraId ?? "all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pedidos_compra"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_compra")
        .select("*, obras(name), materiais(nome, unidade), fornecedores(nome)")
        .is("deleted_at", null)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data as unknown as PedidoCompra[];
    },
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, name").is("deleted_at", null).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: materiais = [] } = useQuery({
    queryKey: ["materiais-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("materiais").select("id, nome, unidade").is("deleted_at", null).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["fornecedores-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("id, nome").is("deleted_at", null).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    let result = items;
    if (filterObra && filterObra !== "all") {
      result = result.filter((i) => i.obra_id === filterObra);
    }
    if (filterStatus && filterStatus !== "all") {
      result = result.filter((i) => i.status === filterStatus);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          (i.codigo_compra?.toLowerCase().includes(q)) ||
          i.fornecedores?.nome?.toLowerCase().includes(q) ||
          i.materiais?.nome?.toLowerCase().includes(q) ||
          i.obras?.name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, search, filterObra, filterStatus]);

  const upsert = useMutation({
    mutationFn: async (values: FormState & { id?: string }) => {
      const qty = Number(values.quantidade) || 0;
      const price = Number(values.preco_unit) || 0;
      const payload: Record<string, unknown> = {
        obra_id: values.obra_id,
        material_id: values.material_id,
        fornecedor_id: values.fornecedor_id,
        quantidade: qty,
        preco_unit: price,
        total: qty * price,
        status: values.status,
        codigo_compra: values.codigo_compra || null,
      };
      if (values.id) {
        const { error } = await supabase.from("pedidos_compra").update(payload as any).eq("id", values.id);
        if (error) throw error;
      } else {
        payload.criado_por = user?.id ?? null;
        const { error } = await supabase.from("pedidos_compra").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos_compra"] });
      toast.success(editing ? "Pedido atualizado" : "Pedido criado");
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pedidos_compra")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos_compra"] });
      toast.success("Pedido excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, obra_id: obraId ?? "" });
    setOpen(true);
  };

  const openEdit = (item: PedidoCompra) => {
    setEditing(item);
    setForm({
      obra_id: item.obra_id,
      material_id: item.material_id,
      fornecedor_id: item.fornecedor_id,
      quantidade: String(item.quantidade),
      preco_unit: String(item.preco_unit),
      status: item.status,
      codigo_compra: item.codigo_compra ?? "",
    });
    setOpen(true);
  };

  const closeDialog = () => { setOpen(false); setEditing(null); };

  const handleSubmit = () => {
    if (!form.obra_id) { toast.error("Selecione uma obra"); return; }
    if (!form.material_id) { toast.error("Selecione um material"); return; }
    if (!form.fornecedor_id) { toast.error("Selecione um fornecedor"); return; }
    if (!form.quantidade || Number(form.quantidade) <= 0) { toast.error("Quantidade deve ser maior que zero"); return; }
    if (!form.preco_unit || Number(form.preco_unit) <= 0) { toast.error("Preço unitário deve ser maior que zero"); return; }
    upsert.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <PageShell title="Pedidos de Compra">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h2 className="text-xl font-semibold">Pedidos de Compra</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar ID, código, fornecedor, material..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-72"
            />
          </div>
          {!obraId && (
            <Select value={filterObra} onValueChange={setFilterObra}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Filtrar obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as obras</SelectItem>
                {obras.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isGestor && (
            <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo Pedido</Button>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Código</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Obra</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Material</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fornecedor</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qtd</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">
                    {item.codigo_compra || item.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">{item.obras?.name}</td>
                  <td className="px-4 py-3">
                    {item.materiais?.nome}
                    <span className="ml-1 text-xs text-muted-foreground">({item.materiais?.unidade})</span>
                  </td>
                  <td className="px-4 py-3">{item.fornecedores?.nome}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.quantidade}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(item.total)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusColor(item.status) as any}>{item.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(item.criado_em).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setDetailItem(item)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isGestor && (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Pedido</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{detailItem.id.slice(0, 8)}</span></div>
                <div><span className="text-muted-foreground">Código:</span> {detailItem.codigo_compra || "—"}</div>
                <div><span className="text-muted-foreground">Obra:</span> {detailItem.obras?.name}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusColor(detailItem.status) as any}>{detailItem.status}</Badge></div>
                <div><span className="text-muted-foreground">Material:</span> {detailItem.materiais?.nome} ({detailItem.materiais?.unidade})</div>
                <div><span className="text-muted-foreground">Fornecedor:</span> {detailItem.fornecedores?.nome}</div>
                <div><span className="text-muted-foreground">Quantidade:</span> {detailItem.quantidade}</div>
                <div><span className="text-muted-foreground">Preço Unit.:</span> {fmt(detailItem.preco_unit)}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{fmt(detailItem.total)}</span></div>
                <div><span className="text-muted-foreground">Criado em:</span> {new Date(detailItem.criado_em).toLocaleString("pt-BR")}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailItem(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Pedido" : "Novo Pedido de Compra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Obra *</Label>
              <Select value={form.obra_id} onValueChange={(v) => setForm({ ...form, obra_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                <SelectContent>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Material *</Label>
              <Select value={form.material_id} onValueChange={(v) => setForm({ ...form, material_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o material" /></SelectTrigger>
                <SelectContent>
                  {materiais.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor *</Label>
              <Select value={form.fornecedor_id} onValueChange={(v) => setForm({ ...form, fornecedor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                <SelectContent>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantidade *</Label>
                <Input type="number" step="0.01" min="0" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
              </div>
              <div>
                <Label>Preço Unitário (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={form.preco_unit} onChange={(e) => setForm({ ...form, preco_unit: e.target.value })} />
              </div>
            </div>
            {form.quantidade && form.preco_unit && (
              <p className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{fmt(Number(form.quantidade) * Number(form.preco_unit))}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Código de Compra</Label>
                <Input value={form.codigo_compra} onChange={(e) => setForm({ ...form, codigo_compra: e.target.value })} placeholder="Opcional" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={upsert.isPending}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
};

export default PedidosCompraManager;
