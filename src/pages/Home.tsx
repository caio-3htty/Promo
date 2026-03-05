import { useNavigate } from "react-router-dom";
import { Building2, LogOut, Package, Truck, Link2, HardHat, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import logoPrumo from "@/assets/image.png";

const roleLabelMap: Record<string, string> = {
  gestor: "Gestor",
  engenheiro: "Engenheiro",
  operacional: "Operacional",
  almoxarife: "Almoxarife",
};

const Home = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: roles } = useUserRoles();
  const isGestor = roles?.includes("gestor");

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["home-stats", user?.id],
    queryFn: async () => {
      const [obras, fornecedores, materiais] = await Promise.all([
        supabase.from("obras").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("fornecedores").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("materiais").select("id", { count: "exact", head: true }).is("deleted_at", null),
      ]);
      return {
        obras: obras.count ?? 0,
        fornecedores: fornecedores.count ?? 0,
        materiais: materiais.count ?? 0,
      };
    },
    enabled: !!user,
  });

  const { data: recentObras = [], isLoading: obrasLoading } = useQuery({
    queryKey: ["recent-obras", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const shortcuts = [
    { label: "Obras", icon: Building2, path: "/obras", count: stats?.obras, color: "bg-sky-600" },
    { label: "Fornecedores", icon: Truck, path: "/fornecedores", count: stats?.fornecedores, color: "bg-emerald-500" },
    { label: "Materiais", icon: Package, path: "/materiais", count: stats?.materiais, color: "bg-amber-500" },
    { label: "Mat. × Forn.", icon: Link2, path: "/material-fornecedor", count: null, color: "bg-violet-500" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <img src={logoPrumo} alt="Prumo" className="h-10 object-contain" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">ObraFlow</h1>
              {roles && roles.length > 0 && (
                <div className="flex gap-1 mt-0.5">
                  {roles.map((r) => (
                    <Badge key={r} variant="secondary" className="text-xs py-0">
                      {roleLabelMap[r] || r}
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
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-8 animate-fade-in">
        {/* Shortcuts */}
        <h2 className="text-lg font-semibold mb-4">Acesso Rápido</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
          {shortcuts.map((s, i) => (
            <Card
              key={s.label}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => navigate(s.path)}
            >
              <CardContent className="flex flex-col items-center gap-2 p-5">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.color}`}>
                  <s.icon className="h-6 w-6 text-white" />
                </div>
                <p className="font-medium text-sm">{s.label}</p>
                {statsLoading ? (
                  <Skeleton className="h-5 w-8" />
                ) : s.count !== null && s.count !== undefined ? (
                  <span className="text-2xl font-bold">{s.count}</span>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent obras */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Obras Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {obrasLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : recentObras.length > 0 ? (
              <div className="divide-y divide-border">
                {recentObras.map((obra) => (
                  <button
                    key={obra.id}
                    onClick={() => navigate(`/dashboard/${obra.id}`)}
                    className="flex w-full items-center justify-between py-3 px-2 text-left rounded-md transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <HardHat className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{obra.name}</p>
                        {obra.address && (
                          <p className="text-xs text-muted-foreground">{obra.address}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={obra.status === "ativa" ? "default" : "secondary"} className="text-xs">
                      {obra.status}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8">
                <HardHat className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma obra cadastrada</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Home;
