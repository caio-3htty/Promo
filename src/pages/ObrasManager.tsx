import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, LogOut } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Obra = Tables<"obras">;

const ObrasManager = () => {
  const { obraId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, signOut } = useAuth();
  const isGestor = role === "master" || role === "gestor";

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Obra | null>(null);
  const [form, setForm] = useState({ name: "", description: "", address: "", status: "ativa" });

  const [showTrash, setShowTrash] = useState(false);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ["obras-all", showTrash],
    queryFn: async () => {
      let q = supabase.from("obras").select("*").order("name");
      if (showTrash) {
        q = q.not("deleted_at", "is", null).gte("deleted_at", cutoff);
      } else {
        q = q.is("deleted_at", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase.from("obras").update(values).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("obras").insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obras-all", showTrash] });
      toast.success(editing ? "Obra atualizada" : "Obra criada");
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("obras")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obras-all", showTrash] });
      toast.success("Obra enviada para a lixeira");
    },
    onError: (e) => toast.error(e.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obras-all", showTrash] });
      toast.success("Obra excluída permanentemente");
    },
    onError: (e) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obras-all", showTrash] });
      toast.success("Obra restaurada");
    },
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", address: "", status: "ativa" });
    setOpen(true);
  };

  const openEdit = (o: Obra) => {
    setEditing(o);
    setForm({ name: o.name, description: o.description ?? "", address: o.address ?? "", status: o.status });
    setOpen(true);
  };

  const closeDialog = () => { setOpen(false); setEditing(null); };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    upsert.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const columns = [
    { key: "name", label: "Nome" },
    { key: "address", label: "Endereço" },
    ...(showTrash ? [{ key: "deleted_at", label: "Excluída em", render: (o: Obra) => o.deleted_at ? new Date(o.deleted_at).toLocaleString("pt-BR") : "" }] : []),
    { key: "status", label: "Status", render: (o: Obra) => (
      <Badge variant={o.status === "ativa" ? "default" : "secondary"}>{o.status}</Badge>
    )},
    ...(isGestor ? [{
      key: "_actions", label: "Ações", render: (o: Obra) => (
        <div className="flex gap-1">
          {showTrash ? (
            <>
              <Button variant="ghost" size="icon" onClick={() => restore.mutate(o.id)}><Plus className="h-4 w-4 text-success" /></Button>
              <Button variant="ghost" size="icon" onClick={() => hardDelete.mutate(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => softDelete.mutate(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </div>
      ),
    }] : []),
  ];

  const content = (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">
            {showTrash ? "Lixeira de Obras" : "Gerenciar Obras"}
          </h2>
          <p className="text-muted-foreground">
            {showTrash ? "Registros apagados (30 dias)" : "Clique em uma obra para acessar"}
          </p>
        </div>
        {isGestor && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTrash(!showTrash)}>
              {showTrash ? "Mostrar ativos" : "Ver lixeira"}
            </Button>
            {!showTrash && (
              <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova Obra</Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : (
        <DataTable
          data={obras}
          columns={columns}
          searchKeys={["name", "address"]}
          searchPlaceholder="Buscar obras..."
          onRowClick={showTrash ? undefined : (o) => navigate(`/dashboard/${o.id}`)}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Obra" : "Nova Obra"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Endereço</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Status</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
                <option value="concluida">Concluída</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={upsert.isPending}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (obraId) {
    return <PageShell title="Obras">{content}</PageShell>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold">Obras</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">{content}</main>
    </div>
  );
};

export default ObrasManager;
