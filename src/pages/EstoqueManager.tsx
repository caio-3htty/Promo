import { useParams } from "react-router-dom";

import { EstoqueSection } from "@/components/EstoqueSection";
import { PageShell } from "@/components/PageShell";

const EstoqueManager = () => {
  const { obraId } = useParams();

  return (
    <PageShell title="Estoque">
      <h2 className="text-xl font-semibold">Estoque da Obra</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Visualizacao consolidada de materiais recebidos nesta obra.
      </p>
      <EstoqueSection obraId={obraId} />
    </PageShell>
  );
};

export default EstoqueManager;
