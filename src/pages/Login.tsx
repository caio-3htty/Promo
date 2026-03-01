import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import logoPrumo from "@/assets/image.png";

const Login = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/obras", { replace: true });
    }
  }, [authLoading, navigate, user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Conta criada!", description: "Verifique seu e-mail para confirmar o cadastro." });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <img src={logoPrumo} alt="Prumo" className="mx-auto mb-4 h-16 object-contain" />
          <p className="mt-1 text-muted-foreground">Controle Central de Obras</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">{isSignUp ? "Criar conta" : "Entrar"}</CardTitle>
            <CardDescription>
              {isSignUp ? "Preencha os dados para criar sua conta" : "Use suas credenciais para acessar"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Joao Silva"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Aguarde...
                  </span>
                ) : isSignUp ? (
                  <span className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Criar conta
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" /> Entrar
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsSignUp((current) => !current)}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {isSignUp ? "Ja tem conta? Entrar" : "Nao tem conta? Criar uma"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
