import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ChevronLeft, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const navItems = [
  { to: "dashboard", label: "Dashboard" },
  { to: "fornecedores", label: "Fornecedores" },
  { to: "materiais", label: "Materiais" },
  { to: "material-fornecedor", label: "Mat. × Forn." },
  { to: "pedidos", label: "Pedidos" },
];

export const PageShell = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const { obraId } = useParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/${obraId}`)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold">{title}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sair
          </Button>
        </div>
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <nav className="flex gap-1 -mb-px">
            {navItems.map((item) => {
              const path = item.to === "dashboard"
                ? `/dashboard/${obraId}`
                : `/dashboard/${obraId}/${item.to}`;
              return (
                <button
                  key={item.to}
                  onClick={() => navigate(path)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    (item.to === "dashboard" ? !window.location.pathname.includes(`/${obraId}/`) || window.location.pathname.endsWith(`/${obraId}`) : window.location.pathname.includes(`/${item.to}`))
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
};
