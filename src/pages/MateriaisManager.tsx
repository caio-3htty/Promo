import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { PageShell } from "@/components/PageShell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

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

const MateriaisManager = () => {
  const queryClient = useQueryClient();
  const { data: roles } = useUserRoles();
  const isGestor = roles?.includes("gestor");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState({ nome: "", unidade: "un", tempo_producao_padrao: "", estoque_minimo: "0" });

  const [showTrash, setShowTrash] = useState(false);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: materiais = [], isLoading } = useQuery({
    queryKey: ["materiais", showTrash],
    queryFn: async () => {
      let q = supabase.from("materiais").select("*").order("nome");
      if (showTrash) {
        q = q.not("deleted_at", "is", null).gte("deleted_at", cutoff);
      } else {
        q = q.is("deleted_at", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Material[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: { nome: string; unidade: string; tempo_producao_padrao: number | null; estoque_minimo: number; id?: string }) => {
      if (values.id) {
        const { id, ...rest } = values;
        const { error } = await supabase.from("materiais").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { id, ...rest } = values;
        const { error } = await supabase.from("materiais").insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materiais"] });
      toast.success(editing ? "Material atualizado" : "Material criado");
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
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
    onError: (e) => toast.error(e.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("materiais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materiais", showTrash] });
      toast.success("Material excluído permanentemente");
    },
    onError: (e) => toast.error(e.message),
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
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", unidade: "un", tempo_producao_padrao: "", estoque_minimo: "0" });
    setOpen(true);
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    setForm({
      nome: m.nome,
      unidade: m.unidade,
      tempo_producao_padrao: m.tempo_producao_padrao?.toString() ?? "",
      estoque_minimo: m.estoque_minimo.toString(),
    });
    setOpen(true);
  };

  const closeDialog = () => { setOpen(false); setEditing(null); };

  const handleSubmit = () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.unidade.trim()) { toast.error("Unidade é obrigatória"); return; }
    const payload = {
      nome: form.nome,
      unidade: form.unidade,
      tempo_producao_padrao: form.tempo_producao_padrao ? parseInt(form.tempo_producao_padrao) : null,
      estoque_minimo: parseFloat(form.estoque_minimo) || 0,
      ...(editing ? { id: editing.id } : {}),
    };
    upsert.mutate(payload);
  };

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "unidade", label: "Unidade" },
    ...(showTrash ? [{ key: "deleted_at", label: "Excluído em", render: (m: Material) => m.deleted_at ? new Date(m.deleted_at).toLocaleString("pt-BR") : "" }] : []),
    { key: "tempo_producao_padrao", label: "Tempo Produção (dias)", render: (m: Material) => m.tempo_producao_padrao ?? "—" },
    { key: "estoque_minimo", label: "Estoque Mínimo" },
    ...(isGestor ? [{
      key: "_actions", label: "Ações", render: (m: Material) => (
        <div className="flex gap-1">
          {showTrash ? (
            <>
              <Button variant="ghost" size="icon" onClick={() => restore.mutate(m.id)}><Plus className="h-4 w-4 text-success" /></Button>
              <Button variant="ghost" size="icon" onClick={() => hardDelete.mutate(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => softDelete.mutate(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </div>
      ),
    }] : []),
  ];

  return (
    <PageShell title="Materiais">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">
            {showTrash ? "Lixeira de Materiais" : "Gerenciar Materiais"}
          </h2>
          <p className="text-muted-foreground">
            {showTrash ? "Registros apagados (30 dias)" : ""}
          </p>
        </div>
        {isGestor && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTrash(!showTrash)}>
              {showTrash ? "Mostrar ativos" : "Ver lixeira"}
            </Button>
            {!showTrash && (
              <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo Material</Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : (
        <DataTable data={materiais} columns={columns} searchKeys={["nome", "unidade"]} searchPlaceholder="Buscar materiais..." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Material" : "Novo Material"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Unidade *</Label><Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="un, kg, m³..." /></div>
            <div><Label>Tempo de Produção Padrão (dias)</Label><Input type="number" value={form.tempo_producao_padrao} onChange={(e) => setForm({ ...form, tempo_producao_padrao: e.target.value })} /></div>
            <div><Label>Estoque Mínimo</Label><Input type="number" step="0.01" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} /></div>
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

export default MateriaisManager;
