import { useNavigate } from "react-router-dom";
import { Building2, KeyRound, Layers3, LogOut, HardHat } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { canManageCadastros, roleLabelMap } from "@/lib/rbac";
import logoPrumo from "@/assets/image.png";

const Home = () => {
  const navigate = useNavigate();
  const { role, obras, signOut } = useAuth();

  const showCadastros = canManageCadastros(role);
  const showUsersAccess = role === "master";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <img src={logoPrumo} alt="Prumo" className="h-10 object-contain" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Prumo</h1>
              {role && (
                <Badge variant="secondary" className="mt-1 text-xs">
                  {roleLabelMap[role]}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-8 animate-fade-in">
        <h2 className="mb-4 text-lg font-semibold">Acesso Rapido</h2>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card
            className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
            onClick={() => navigate("/obras")}
          >
            <CardContent className="flex items-center gap-3 p-5">
              <div className="rounded-xl bg-sky-600 p-2">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium">Obras</p>
                <p className="text-xs text-muted-foreground">{obras.length} vinculada(s)</p>
              </div>
            </CardContent>
          </Card>

          {showCadastros && (
            <Card
              className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
              onClick={() => navigate("/cadastros/fornecedores")}
            >
              <CardContent className="flex items-center gap-3 p-5">
                <div className="rounded-xl bg-emerald-600 p-2">
                  <Layers3 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">Cadastros</p>
                  <p className="text-xs text-muted-foreground">Fornecedores, materiais e vinculos</p>
                </div>
              </CardContent>
            </Card>
          )}

          {showUsersAccess && (
            <Card
              className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
              onClick={() => navigate("/usuarios-acessos")}
            >
              <CardContent className="flex items-center gap-3 p-5">
                <div className="rounded-xl bg-amber-600 p-2">
                  <KeyRound className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">Usuarios e Acessos</p>
                  <p className="text-xs text-muted-foreground">Governanca de papel e obra</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Obras disponiveis</CardTitle>
          </CardHeader>
          <CardContent>
            {obras.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma obra vinculada.</p>
            ) : (
              <div className="divide-y divide-border">
                {obras.map((obra) => (
                  <button
                    key={obra.id}
                    onClick={() => navigate(`/dashboard/${obra.id}`)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <HardHat className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{obra.name}</p>
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
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Home;
