import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  execucaoId: string;
  destinatarios: string[];
  assunto?: string;
};

async function buildPdf(lines: string[]) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = 810;
  page.drawText("PRUMO - Pre-expurgo de Retencao", { x: 40, y, size: 13, font });
  y -= 24;
  for (const line of lines) {
    if (y < 30) break;
    page.drawText(line, { x: 40, y, size: 10, font });
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

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const payload = (await req.json()) as Payload;
    if (!payload.execucaoId || !payload.destinatarios?.length) {
      throw new Error("execucaoId e destinatarios são obrigatórios");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: execucao, error } = await supabase
      .from("retencao_execucoes")
      .select("id, tenant_id, janela_fim, retencao_dias, registros_expurgados, resumo, status")
      .eq("id", payload.execucaoId)
      .single();
    if (error) throw error;

    const resumo = execucao.resumo ?? {};
    const lines = [
      `Execucao: ${execucao.id}`,
      `Tenant: ${execucao.tenant_id}`,
      `Janela fim: ${execucao.janela_fim}`,
      `Retencao dias: ${execucao.retencao_dias}`,
      `Registros expurgados: ${execucao.registros_expurgados}`,
      `Resumo: ${JSON.stringify(resumo)}`,
    ];

    const pdfBytes = await buildPdf(lines);
    const binary = Array.from(pdfBytes).map((b) => String.fromCharCode(b)).join("");
    const pdfBase64 = btoa(binary);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: payload.destinatarios,
        subject: payload.assunto ?? "[PRUMO] Relatório de retenção pré-expurgo",
        html: "<p>Segue relatório consolidado pré-expurgo conforme política de retenção.</p>",
        attachments: [
          {
            filename: `retencao-${execucao.id.slice(0, 8)}.pdf`,
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

    await supabase
      .from("retencao_execucoes")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", payload.execucaoId);

    return new Response(JSON.stringify({ ok: true, id: resendData.id ?? null }), {
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

