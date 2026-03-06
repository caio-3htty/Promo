import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { hasObraAccess, hasOperationalAccess } from "@/lib/rbac";

const FullPageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export const RequireOperationalAccess = ({ children }: { children: ReactNode }) => {
  const { loadingAccess, isActive, role, obras } = useAuth();

  if (loadingAccess) {
    return <FullPageLoader />;
  }

  if (!hasOperationalAccess(isActive, role, obras.length)) {
    return <Navigate to="/sem-acesso" replace />;
  }

  return <>{children}</>;
};

export const RequireRole = ({
  allowed,
  children,
}: {
  allowed: Array<"master" | "gestor" | "engenheiro" | "operacional" | "almoxarife">;
  children: ReactNode;
}) => {
  const { loadingAccess, isActive, role } = useAuth();

  if (loadingAccess) {
    return <FullPageLoader />;
  }

  if (!isActive || !role || !allowed.includes(role)) {
    return <Navigate to="/sem-acesso" replace />;
  }

  return <>{children}</>;
};

export const RequireObraAccess = ({ children }: { children: ReactNode }) => {
  const { obraId } = useParams();
  const { loadingAccess, isActive, role, obras } = useAuth();

  if (loadingAccess) {
    return <FullPageLoader />;
  }

  if (!isActive || !role) {
    return <Navigate to="/sem-acesso" replace />;
  }

  const obraIds = obras.map((obra) => obra.id);
  if (!hasObraAccess(role, obraIds, obraId)) {
    return <Navigate to="/sem-acesso" replace />;
  }

  return <>{children}</>;
};
