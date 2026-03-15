import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  notificationId?: string;
  to: string;
  subject?: string;
  html?: string;
  pedidoId?: string;
  pdfBase64?: string;
  pdfFileName?: string;
};

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
    if (!payload.to) {
      throw new Error("Campo 'to' é obrigatório");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    let subject = payload.subject ?? "[PRUMO] Alerta crítico";
    let html = payload.html ?? "";
    let obraId: string | null = null;

    if (payload.notificationId) {
      const { data: notification, error } = await supabase
        .from("notificacoes")
        .select("id, obra_id, pedido_id, tipo, severidade, titulo, mensagem, metadata")
        .eq("id", payload.notificationId)
        .single();

      if (error) throw error;

      obraId = notification.obra_id;
      subject = payload.subject ?? `[PRUMO] ${notification.titulo}`;
      html =
        payload.html ??
        `<h2>${notification.titulo}</h2><p>${notification.mensagem}</p><p><b>Tipo:</b> ${notification.tipo}</p><p><b>Severidade:</b> ${notification.severidade}</p><p><b>Pedido:</b> ${notification.pedido_id ?? "-"}</p>`;
    }

    const resendBody: Record<string, unknown> = {
      from,
      to: [payload.to],
      subject,
      html,
    };

    if (payload.pdfBase64) {
      resendBody.attachments = [
        {
          filename: payload.pdfFileName || "pedido-alerta.pdf",
          content: payload.pdfBase64,
          type: "application/pdf",
        },
      ];
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendBody),
    });

    const resendData = await resendResponse.json();
    if (!resendResponse.ok) {
      throw new Error(`Resend error: ${JSON.stringify(resendData)}`);
    }

    if (payload.notificationId) {
      await supabase.from("notificacao_entregas").insert({
        notificacao_id: payload.notificationId,
        canal: "email",
        destino: payload.to,
        status: "sent",
        provider_id: resendData.id ?? null,
        payload: resendData,
        enviado_em: new Date().toISOString(),
      });

      await supabase
        .from("notificacoes")
        .update({ status: "escalada", updated_at: new Date().toISOString() })
        .eq("id", payload.notificationId);
    }

    return new Response(JSON.stringify({ ok: true, id: resendData.id ?? null, obraId }), {
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

