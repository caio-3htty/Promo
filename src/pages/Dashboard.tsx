import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUserObras } from "@/hooks/useUserObras";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, LogOut, HardHat, Package, Truck, Link2 } from "lucide-react";
import logoPrumo from "@/assets/image.png";

const roleLabelMap: Record<string, string> = {
  gestor: "Gestor",
  engenheiro: "Engenheiro",
  operacional: "Operacional",
  almoxarife: "Almoxarife",
};

const Dashboard = () => {
  const { obraId } = useParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: roles } = useUserRoles();
  const { data: obras } = useUserObras();

  const obra = obras?.find((o) => o.id === obraId);

  const quickActions = [
    { label: "Fornecedores", icon: Truck, path: "fornecedores" },
    { label: "Materiais", icon: Package, path: "materiais" },
    { label: "Material × Fornecedor", icon: Link2, path: "material-fornecedor" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/obras")} className="mr-1">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <img src={logoPrumo} alt="Prumo" className="h-8 object-contain" />
            <div>
              <h1 className="text-lg font-bold leading-tight">{obra?.name ?? "Dashboard"}</h1>
              {roles && roles.length > 0 && (
                <div className="flex gap-1">
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

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="animate-fade-in">
          <h2 className="mb-1 text-xl font-semibold">Visão Geral da Obra</h2>
          <p className="mb-6 text-muted-foreground">
            {obra?.address ?? "Resumo da obra selecionada."}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {quickActions.map((action, i) => (
              <Card
                key={action.label}
                className="cursor-pointer border-border/50 transition-all hover:border-primary/30 hover:shadow-md"
                style={{ animationDelay: `${i * 80}ms` }}
                onClick={() => navigate(`/dashboard/${obraId}/${action.path}`)}
              >
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <action.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium">{action.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
