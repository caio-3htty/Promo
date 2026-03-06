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
import { Search, PackageCheck } from "lucide-react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";

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
  criado_em: string;
  data_recebimento: string | null;
  obras: { name: string } | null;
  materiais: { nome: string; unidade: string } | null;
  fornecedores: { nome: string } | null;
}

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

const RecebimentoManager = () => {
  const { obraId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: roles } = useUserRoles();
  const isAlmoxarife = roles?.includes("almoxarife");
  const isGestor = roles?.includes("gestor");
  const canReceive = isAlmoxarife || isGestor;

  const [search, setSearch] = useState("");
  const [filterObra, setFilterObra] = useState<string>(obraId ?? "all");
  const [receiveItem, setReceiveItem] = useState<PedidoCompra | null>(null);
  const [codigoCompra, setCodigoCompra] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(format(new Date(), "yyyy-MM-dd"));

  // Pedidos que ainda não foram entregues (enviado ou aprovado)
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pedidos_recebimento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_compra")
        .select("*, obras(name), materiais(nome, unidade), fornecedores(nome)")
        .is("deleted_at", null)
        .in("status", ["aprovado", "enviado", "entregue"])
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

  const filtered = useMemo(() => {
    let result = items;
    if (filterObra && filterObra !== "all") {
      result = result.filter((i) => i.obra_id === filterObra);
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
  }, [items, search, filterObra]);

  const receberMutation = useMutation({
    mutationFn: async ({ pedido, codigo, dataRec }: { pedido: PedidoCompra; codigo: string; dataRec: string }) => {
      if (!codigo.trim()) throw new Error("Código de compra é obrigatório");

      // Update pedido status
      const { error: pedidoError } = await supabase
        .from("pedidos_compra")
        .update({
          status: "entregue",
          codigo_compra: codigo.trim(),
          data_recebimento: new Date(dataRec).toISOString(),
          recebido_por: user?.id ?? null,
        } as any)
        .eq("id", pedido.id);
      if (pedidoError) throw pedidoError;

      // Upsert estoque
      const { data: existing } = await supabase
        .from("estoque_obra_material" as any)
        .select("id, estoque_atual")
        .eq("obra_id", pedido.obra_id)
        .eq("material_id", pedido.material_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("estoque_obra_material" as any)
          .update({
            estoque_atual: (existing as any).estoque_atual + pedido.quantidade,
            atualizado_em: new Date().toISOString(),
            atualizado_por: user?.id,
          })
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("estoque_obra_material" as any)
          .insert({
            obra_id: pedido.obra_id,
            material_id: pedido.material_id,
            estoque_atual: pedido.quantidade,
            atualizado_por: user?.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos_recebimento"] });
      queryClient.invalidateQueries({ queryKey: ["estoque_obra_material"] });
      toast.success("Pedido marcado como entregue e estoque atualizado!");
      setReceiveItem(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openReceive = (item: PedidoCompra) => {
    setReceiveItem(item);
    setCodigoCompra(item.codigo_compra ?? "");
    setDataRecebimento(format(new Date(), "yyyy-MM-dd"));
  };

  const handleReceive = () => {
    if (!receiveItem) return;
    if (!codigoCompra.trim()) { toast.error("Informe o código de compra"); return; }
    if (!dataRecebimento) { toast.error("Informe a data de recebimento"); return; }
    receberMutation.mutate({ pedido: receiveItem, codigo: codigoCompra, dataRec: dataRecebimento });
  };

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <PageShell title="Recebimento">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h2 className="text-xl font-semibold">Recebimento de Materiais</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar código, fornecedor, material..."
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
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">Nenhum pedido pendente de recebimento.</p>
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
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ação</th>
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
                  <td className="px-4 py-3 text-right">
                    {item.status !== "entregue" && canReceive ? (
                      <Button size="sm" onClick={() => openReceive(item)}>
                        <PackageCheck className="mr-1 h-4 w-4" /> Receber
                      </Button>
                    ) : item.status === "entregue" ? (
                      <span className="text-xs text-muted-foreground">
                        {item.data_recebimento
                          ? new Date(item.data_recebimento).toLocaleDateString("pt-BR")
                          : "Entregue"}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Estoque por Obra */}
      <EstoqueSection obraId={obraId} />

      {/* Receive Dialog */}
      <Dialog open={!!receiveItem} onOpenChange={() => setReceiveItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Recebimento</DialogTitle>
          </DialogHeader>
          {receiveItem && (
            <div className="space-y-4">
              <div className="rounded-md border border-border p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Material:</span> {receiveItem.materiais?.nome}</p>
                <p><span className="text-muted-foreground">Fornecedor:</span> {receiveItem.fornecedores?.nome}</p>
                <p><span className="text-muted-foreground">Quantidade:</span> {receiveItem.quantidade} {receiveItem.materiais?.unidade}</p>
                <p><span className="text-muted-foreground">Total:</span> {fmt(receiveItem.total)}</p>
              </div>
              <div>
                <Label>Código de Compra *</Label>
                <Input
                  value={codigoCompra}
                  onChange={(e) => setCodigoCompra(e.target.value)}
                  placeholder="Informe ou confirme o código"
                />
              </div>
              <div>
                <Label>Data de Recebimento *</Label>
                <Input
                  type="date"
                  value={dataRecebimento}
                  onChange={(e) => setDataRecebimento(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveItem(null)}>Cancelar</Button>
            <Button onClick={handleReceive} disabled={receberMutation.isPending}>
              <PackageCheck className="mr-1 h-4 w-4" />
              {receberMutation.isPending ? "Processando..." : "Confirmar Entrega"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
};

// Sub-component: Estoque resumo
const EstoqueSection = ({ obraId }: { obraId?: string }) => {
  const { data: estoque = [], isLoading } = useQuery({
    queryKey: ["estoque_obra_material", obraId],
    queryFn: async () => {
      let query = supabase
        .from("estoque_obra_material" as any)
        .select("*, obras(name), materiais(nome, unidade)")
        .order("atualizado_em", { ascending: false });
      if (obraId) {
        query = query.eq("obra_id", obraId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading) return null;
  if (estoque.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4">Estoque Atual</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {!obraId && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Obra</th>}
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Material</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Estoque Atual</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            {estoque.map((e: any) => (
              <tr key={e.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                {!obraId && <td className="px-4 py-3">{e.obras?.name}</td>}
                <td className="px-4 py-3">
                  {e.materiais?.nome}
                  <span className="ml-1 text-xs text-muted-foreground">({e.materiais?.unidade})</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{e.estoque_atual}</td>
                <td className="px-4 py-3 text-xs">
                  {new Date(e.atualizado_em).toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecebimentoManager;
