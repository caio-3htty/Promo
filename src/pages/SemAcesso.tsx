import { useNavigate } from "react-router-dom";
import { Lock, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

const SemAcesso = () => {
  const navigate = useNavigate();
  const { role, isActive, obras, signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lock className="h-5 w-5" />
            Sem acesso operacional
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Sua conta foi criada, mas ainda nao esta pronta para usar o sistema.
            Contate o usuario master para ativar seu usuario, definir tipo e vincular obra.
          </p>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p>
              <strong>Ativo:</strong> {isActive ? "sim" : "nao"}
            </p>
            <p>
              <strong>Papel:</strong> {role ?? "nao definido"}
            </p>
            <p>
              <strong>Obras vinculadas:</strong> {obras.length}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              Atualizar status
            </Button>
            <Button variant="ghost" onClick={signOut}>
              <LogOut className="mr-1 h-4 w-4" />
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SemAcesso;
