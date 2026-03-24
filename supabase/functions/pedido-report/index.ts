import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestPayload = {
  pedidoId: string;
  to?: string;
  subject?: string;
};

function jsonToLines(payload: any): string[] {
  const pedido = payload?.pedido ?? {};
  const obra = payload?.obra ?? {};
  const material = payload?.material ?? {};
  const fornecedor = payload?.fornecedor ?? {};
  const prazos = payload?.prazos ?? {};
  const eventos = payload?.eventos ?? [];
  const incidentes = payload?.incidentes_substituicao ?? [];

  const atrasoEntrega =
    prazos?.prazo_entrega_previsto && prazos?.prazo_entrega_real
      ? new Date(prazos.prazo_entrega_real).getTime() - new Date(prazos.prazo_entrega_previsto).getTime()
      : null;

  const atrasoDias = atrasoEntrega !== null ? Math.round(atrasoEntrega / (1000 * 60 * 60 * 24)) : null;

  return [
    `Pedido: ${String(pedido.id ?? "-").slice(0, 8)}`,
    `Obra: ${obra.name ?? "-"}`,
    `Material: ${material.nome ?? "-"}`,
    `Fornecedor: ${fornecedor.nome ?? "-"}`,
    `Status: ${pedido.status ?? "-"}`,
    `Codigo compra: ${pedido.codigo_compra ?? "-"}`,
    `Quantidade: ${pedido.quantidade ?? "-"}`,
    `Preco unit.: ${pedido.preco_unit ?? "-"}`,
    `Total: ${pedido.total ?? "-"}`,
    "",
    "Datas previstas vs reais:",
    `- Aprovacao MRV (prev/real): ${prazos.prazo_aprovacao_mrv_previsto ?? "-"} / ${prazos.prazo_aprovacao_mrv_real ?? "-"}`,
    `- Aprovacao fornecedor (prev/real): ${prazos.prazo_aprovacao_fornecedor_previsto ?? "-"} / ${prazos.prazo_aprovacao_fornecedor_real ?? "-"}`,
    `- Producao (prev/real): ${prazos.prazo_producao_previsto ?? "-"} / ${prazos.prazo_producao_real ?? "-"}`,
    `- Entrega (prev/real): ${prazos.prazo_entrega_previsto ?? "-"} / ${prazos.prazo_entrega_real ?? "-"}`,
    `- Atraso entrega (dias): ${atrasoDias ?? "-"}`,
    "",
    "Substituicoes:",
    ...(incidentes.length
      ? incidentes.slice(0, 10).map((inc: any) => {
          const impacto =
            (Number(inc?.custo_substituto_unit ?? 0) - Number(inc?.custo_planejado_unit ?? 0)) * Number(inc?.quantidade_substituto ?? 0);
          return `- ${inc?.created_at ?? "-"} | status=${inc?.status ?? "-"} | impacto=${impacto.toFixed(2)} | motivo=${inc?.motivo ?? "-"}`;
        })
      : ["- Sem substituicoes registradas"]),
    "",
    "Eventos e responsaveis:",
    ...(eventos.length
      ? eventos.slice(0, 25).map((event: any) => {
          const by = event?.criado_por ? String(event.criado_por).slice(0, 8) : "sistema";
          return `- ${event?.created_at ?? "-"} | ${event?.tipo ?? "-"} | por ${by} | ${event?.descricao ?? ""}`;
        })
      : ["- Sem eventos registrados"]),
  ];
}

async function buildPdf(lines: string[]) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = 800;
  page.drawText("PRUMO - Relatorio de Pedido", {
    x: 40,
    y,
    size: 14,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  y -= 24;
  for (const line of lines) {
    if (y < 40) break;
    page.drawText(line, {
      x: 40,
      y,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 14;
  }

  return await pdfDoc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL") || "Prumo <noreply@prumo.app>";

    const payload = (await req.json()) as RequestPayload;
    if (!payload.pedidoId) throw new Error("pedidoId e obrigatorio");

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: reportPayload, error: reportError } = await supabase.rpc("generate_pedido_pdf_payload", {
      _pedido_id: payload.pedidoId,
    });

    if (reportError) throw reportError;
    if (!reportPayload) throw new Error("Sem dados para gerar PDF");

    const lines = jsonToLines(reportPayload);
    const pdfBytes = await buildPdf(lines);
    const binary = Array.from(pdfBytes).map((b) => String.fromCharCode(b)).join("");
    const pdfBase64 = btoa(binary);

    if (payload.to) {
      if (!resendApiKey) throw new Error("RESEND_API_KEY nao configurada");
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [payload.to],
          subject: payload.subject ?? `[PRUMO] Relatorio do pedido ${payload.pedidoId.slice(0, 8)}`,
          html: "<p>Segue relatorio PDF do pedido.</p>",
          attachments: [
            {
              filename: `pedido-${payload.pedidoId.slice(0, 8)}.pdf`,
              content: pdfBase64,
              type: "application/pdf",
            },
          ],
        }),
      });

      const resendData = await resendResponse.json();
      if (!resendResponse.ok) {
        throw new Error(`Resend error: ${JSON.stringify(resendData)}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, pedidoId: payload.pedidoId, pdfBase64 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
