import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Home from "./Home";

const Index = () => {
  const { user, loading, loadingAccess, hasOperationalAccess } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && !loadingAccess && user && !hasOperationalAccess) {
      navigate("/sem-acesso", { replace: true });
    }
  }, [user, loading, loadingAccess, hasOperationalAccess, navigate]);

  if (loading || loadingAccess || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <Home />;
};

export default Index;
