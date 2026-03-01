import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { PageShell } from "@/components/PageShell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

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

const FornecedoresManager = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: roles } = useUserRoles();
  const isGestor = roles?.includes("gestor");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState({ nome: "", cnpj: "", contatos: "", entrega_propria: false });

  const [showTrash, setShowTrash] = useState(false);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: fornecedores = [], isLoading } = useQuery({
    queryKey: ["fornecedores", showTrash],
    queryFn: async () => {
      let q = supabase.from("fornecedores").select("*").order("nome");
      if (showTrash) {
        q = q.not("deleted_at", "is", null).gte("deleted_at", cutoff);
      } else {
        q = q.is("deleted_at", null);
      }
      const { data, error } = await q;
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
    onError: (e) => toast.error(e.message),
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
    onError: (e) => toast.error(e.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fornecedores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fornecedores", showTrash] });
      toast.success("Fornecedor excluído permanentemente");
    },
    onError: (e) => toast.error(e.message),
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
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", cnpj: "", contatos: "", entrega_propria: false });
    setOpen(true);
  };

  const openEdit = (f: Fornecedor) => {
    setEditing(f);
    setForm({ nome: f.nome, cnpj: f.cnpj, contatos: f.contatos ?? "", entrega_propria: f.entrega_propria });
    setOpen(true);
  };

  const closeDialog = () => { setOpen(false); setEditing(null); };

  const validateCnpj = (value: string) => {
    // basic pattern 00.000.000/0000-00 or only digits
    const cleaned = value.replace(/\D/g, "");
    return /^\d{14}$/.test(cleaned);
  };

  const handleSubmit = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.cnpj.trim()) { toast.error("CNPJ é obrigatório"); return; }
    if (!validateCnpj(form.cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }

    // prevent duplicates when creating new fornecedor
    if (!editing) {
      const { data: existing, error: dupErr } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("cnpj", form.cnpj);
      if (dupErr) {
        toast.error(dupErr.message);
        return;
      }
      if (existing && existing.length > 0) {
        toast.error("CNPJ já cadastrado");
        return;
      }
    }

    upsert.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "cnpj", label: "CNPJ" },
    { key: "contatos", label: "Contatos" },
    ...(showTrash ? [{ key: "deleted_at", label: "Excluído em", render: (f: Fornecedor) => f.deleted_at ? new Date(f.deleted_at).toLocaleString("pt-BR") : "" }] : []),
    { key: "entrega_propria", label: "Entrega Própria", render: (f: Fornecedor) => (
      f.entrega_propria ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-muted-foreground" />
    )},
    ...(isGestor ? [{
      key: "_actions", label: "Ações", render: (f: Fornecedor) => (
        <div className="flex gap-1">
          {showTrash ? (
            <>
              <Button variant="ghost" size="icon" onClick={() => restore.mutate(f.id)}><Plus className="h-4 w-4 text-success" /></Button>
              <Button variant="ghost" size="icon" onClick={() => hardDelete.mutate(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => softDelete.mutate(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </div>
      ),
    }] : []),
  ];

  return (
    <PageShell title="Fornecedores">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">
            {showTrash ? "Lixeira de Fornecedores" : "Gerenciar Fornecedores"}
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
              <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo Fornecedor</Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : (
        <DataTable data={fornecedores} columns={columns} searchKeys={["nome", "cnpj"]} searchPlaceholder="Buscar fornecedores..." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>CNPJ *</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
            <div><Label>Contatos</Label><Input value={form.contatos} onChange={(e) => setForm({ ...form, contatos: e.target.value })} placeholder="Email, telefone..." /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.entrega_propria} onCheckedChange={(v) => setForm({ ...form, entrega_propria: v })} />
              <Label>Entrega própria</Label>
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

export default FornecedoresManager;
