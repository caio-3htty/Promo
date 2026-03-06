import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";

import Dashboard from "./pages/Dashboard";
import FornecedoresManager from "./pages/FornecedoresManager";
import Index from "./pages/Index";
import Login from "./pages/Login";
import MateriaisManager from "./pages/MateriaisManager";
import MaterialFornecedorManager from "./pages/MaterialFornecedorManager";
import NotFound from "./pages/NotFound";
import ObrasManager from "./pages/ObrasManager";
import PedidosCompraManager from "./pages/PedidosCompraManager";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/obras" element={<ObrasManager />} />
            <Route path="/fornecedores" element={<FornecedoresManager />} />
            <Route path="/materiais" element={<MateriaisManager />} />
            <Route path="/material-fornecedor" element={<MaterialFornecedorManager />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard/:obraId" element={<Dashboard />} />
            <Route path="/dashboard/:obraId/fornecedores" element={<FornecedoresManager />} />
            <Route path="/dashboard/:obraId/materiais" element={<MateriaisManager />} />
            <Route
              path="/dashboard/:obraId/material-fornecedor"
              element={<MaterialFornecedorManager />}
            />
            <Route
              path="/dashboard/:obraId/pedidos"
              element={<PedidosCompraManager />}
            />
            <Route path="/pedidos" element={<PedidosCompraManager />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
