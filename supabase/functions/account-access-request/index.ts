import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "master" | "gestor" | "engenheiro" | "operacional" | "almoxarife";
type RequestAction = "register_company" | "register_internal" | "get_request" | "review_request";
type ReviewDecision = "approve" | "reject" | "edit";

const allowedRoles: AppRole[] = ["master", "gestor", "engenheiro", "operacional", "almoxarife"];

const normalizeText = (value: unknown) => String(value ?? "").trim();

const isValidRole = (value: unknown): value is AppRole => {
  return allowedRoles.includes(value as AppRole);
};

const slugifyCompany = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const toErrorPayload = (error: unknown) => {
  const fallback = {
    message: String(error),
    details: null as string | null,
    hint: null as string | null,
    code: null as string | null,
  };

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as Record<string, unknown>;
  return {
    message: typeof candidate.message === "string" ? candidate.message : fallback.message,
    details: typeof candidate.details === "string" ? candidate.details : null,
    hint: typeof candidate.hint === "string" ? candidate.hint : null,
    code: typeof candidate.code === "string" ? candidate.code : null,
  };
};

const sendResendEmail = async (
  resendApiKey: string | null,
  from: string,
  to: string,
  subject: string,
  html: string,
) => {
  if (!resendApiKey) {
    return { ok: false, reason: "RESEND_API_KEY não configurada" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    return { ok: false, reason: `Falha ao enviar e-mail: ${payload}` };
  }

  return { ok: true, reason: null };
};

const resolveTenant = async (supabase: ReturnType<typeof createClient>, companyName: string) => {
  const slug = slugifyCompany(companyName);

  const bySlug = await supabase
    .from("tenants")
    .select("id, name, slug")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

  if (bySlug.error) throw bySlug.error;
  if (bySlug.data) return bySlug.data;

  const byName = await supabase
    .from("tenants")
    .select("id, name, slug")
    .ilike("name", companyName)
    .limit(1)
    .maybeSingle();

  if (byName.error) throw byName.error;
  return byName.data;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL") || "Prumo <noreply@prumo.app>";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, message: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const payload = await req.json();
    const action = normalizeText(payload?.action) as RequestAction;

    if (!action) {
      return jsonResponse({ ok: false, message: "Ação obrigatória." }, 400);
    }

    if (action === "get_request") {
      const token = normalizeText(payload?.token);
      if (!token) {
        return jsonResponse({ ok: false, message: "Token obrigatório." }, 400);
      }

      const requestRes = await supabase
        .from("access_signup_requests")
        .select(
          "id, request_type, status, applicant_email, applicant_full_name, company_name, requested_username, requested_job_title, requested_role",
        )
        .eq("approval_token", token)
        .maybeSingle();

      if (requestRes.error) throw requestRes.error;
      if (!requestRes.data) {
        return jsonResponse({ ok: false, message: "Solicitação não encontrada ou expirada." }, 404);
      }

      return jsonResponse({
        ok: true,
        request: {
          id: requestRes.data.id,
          requestType: requestRes.data.request_type,
          status: requestRes.data.status,
          applicantEmail: requestRes.data.applicant_email,
          applicantFullName: requestRes.data.applicant_full_name,
          companyName: requestRes.data.company_name,
          requestedUsername: requestRes.data.requested_username,
          requestedJobTitle: requestRes.data.requested_job_title,
          requestedRole: requestRes.data.requested_role,
        },
      });
    }

    if (action === "review_request") {
      const token = normalizeText(payload?.token);
      const decision = normalizeText(payload?.decision) as ReviewDecision;
      const reviewNotes = normalizeText(payload?.reviewNotes);
      const reviewedUsername = normalizeText(payload?.reviewedUsername);
      const reviewedJobTitle = normalizeText(payload?.reviewedJobTitle);
      const reviewedRole = normalizeText(payload?.reviewedRole);

      if (!token || !decision || !["approve", "reject", "edit"].includes(decision)) {
        return jsonResponse({ ok: false, message: "Token e decisão válidos são obrigatórios." }, 400);
      }

      const requestRes = await supabase
        .from("access_signup_requests")
        .select("*")
        .eq("approval_token", token)
        .maybeSingle();

      if (requestRes.error) throw requestRes.error;
      if (!requestRes.data) {
        return jsonResponse({ ok: false, message: "Solicitação não encontrada." }, 404);
      }
      if (requestRes.data.status !== "pending") {
        return jsonResponse({ ok: false, message: "Solicitação já processada." }, 409);
      }

      if (requestRes.data.request_type !== "company_internal") {
        return jsonResponse({ ok: false, message: "Somente solicitações internas exigem revisão." }, 400);
      }

      const finalUsername = reviewedUsername || requestRes.data.requested_username;
      const finalJobTitle = reviewedJobTitle || requestRes.data.requested_job_title;
      const candidateRole = reviewedRole || requestRes.data.requested_role;
      const finalRole = isValidRole(candidateRole) ? candidateRole : requestRes.data.requested_role;

      if (decision === "reject") {
        await supabase
          .from("profiles")
          .update({ is_active: false })
          .eq("user_id", requestRes.data.applicant_user_id);

        const updateRes = await supabase
          .from("access_signup_requests")
          .update({
            status: "rejected",
            review_notes: reviewNotes || "Solicitação rejeitada.",
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", requestRes.data.id);

        if (updateRes.error) throw updateRes.error;

        if (requestRes.data.applicant_email) {
          await sendResendEmail(
            resendApiKey,
            from,
            requestRes.data.applicant_email,
            "[PRUMO] Solicitação de acesso rejeitada",
            `<p>Olá, ${requestRes.data.applicant_full_name}.</p><p>Sua solicitação para <b>${requestRes.data.company_name}</b> foi rejeitada.</p><p>Observação: ${reviewNotes || "Sem observações."}</p>`,
          );
        }

        return jsonResponse({
          ok: true,
          status: "rejected",
          message: "Solicitação rejeitada com sucesso.",
        });
      }

      const profileRes = await supabase
        .from("profiles")
        .update({
          is_active: true,
          full_name: finalUsername,
          tenant_id: requestRes.data.tenant_id,
        })
        .eq("user_id", requestRes.data.applicant_user_id);

      if (profileRes.error) throw profileRes.error;

      const roleRes = await supabase
        .from("user_roles")
        .upsert(
          {
            user_id: requestRes.data.applicant_user_id,
            tenant_id: requestRes.data.tenant_id,
            role: finalRole,
          },
          { onConflict: "user_id" },
        );

      if (roleRes.error) throw roleRes.error;

      await supabase.auth.admin.updateUserById(requestRes.data.applicant_user_id, {
        user_metadata: { full_name: finalUsername },
      });

      const requestStatus = decision === "edit" ? "edited" : "approved";
      const updateRes = await supabase
        .from("access_signup_requests")
        .update({
          status: requestStatus,
          reviewed_username: finalUsername,
          reviewed_job_title: finalJobTitle,
          reviewed_role: finalRole,
          review_notes: reviewNotes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestRes.data.id);

      if (updateRes.error) throw updateRes.error;

      if (requestRes.data.applicant_email) {
        await sendResendEmail(
          resendApiKey,
          from,
          requestRes.data.applicant_email,
          "[PRUMO] Solicitação de acesso aprovada",
          `<p>Olá, ${requestRes.data.applicant_full_name}.</p><p>Sua solicitação para <b>${requestRes.data.company_name}</b> foi aprovada.</p><p><b>Usuário:</b> ${finalUsername}<br/><b>Cargo:</b> ${finalJobTitle}<br/><b>Perfil:</b> ${finalRole}</p><p>Observação: ${reviewNotes || "Sem observações."}</p>`,
        );
      }

      return jsonResponse({
        ok: true,
        status: requestStatus,
        message:
          decision === "edit"
            ? "Solicitação aprovada com edição de usuário/cargo."
            : "Solicitação aprovada com sucesso.",
      });
    }

    const email = normalizeText(payload?.email).toLowerCase();
    const password = normalizeText(payload?.password);
    const fullName = normalizeText(payload?.fullName);
    const username = normalizeText(payload?.username);
    const companyName = normalizeText(payload?.companyName);
    const jobTitle = normalizeText(payload?.jobTitle);
    const requestedRoleRaw = normalizeText(payload?.requestedRole);
    const origin = normalizeText(payload?.origin) || "http://localhost:5173";

    if (!email || !password || !fullName || !companyName || !jobTitle) {
      return jsonResponse({ ok: false, message: "Campos obrigatórios ausentes." }, 200);
    }
    if (password.length < 6) {
      return jsonResponse({ ok: false, message: "A senha precisa ter ao menos 6 caracteres." }, 200);
    }

    const desiredRole: AppRole = isValidRole(requestedRoleRaw) ? requestedRoleRaw : "operacional";

    if (action === "register_company") {
      const slug = slugifyCompany(companyName);
      if (!slug) {
        return jsonResponse({ ok: false, message: "Nome de empresa inválido." }, 200);
      }

      const existingTenant = await resolveTenant(supabase, companyName);
      if (existingTenant) {
        return jsonResponse({ ok: false, message: "Empresa já existe. Use o fluxo de conta interna." }, 200);
      }

      const authRes = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (authRes.error || !authRes.data?.user) {
        return jsonResponse(
          { ok: false, message: authRes.error?.message ?? "Não foi possível criar o usuário da empresa." },
          200,
        );
      }

      const userId = authRes.data.user.id;

      try {
        const tenantRes = await supabase
          .from("tenants")
          .insert({ id: crypto.randomUUID(), name: companyName, slug, is_active: true })
          .select("id, name")
          .single();

        if (tenantRes.error) throw tenantRes.error;

        const profileRes = await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            email,
            tenant_id: tenantRes.data.id,
            is_active: true,
            preferred_language: "pt-BR",
            access_mode: "template",
          })
          .eq("user_id", userId);
        if (profileRes.error) throw profileRes.error;

        const roleRes = await supabase
          .from("user_roles")
          .upsert(
            {
              user_id: userId,
              tenant_id: tenantRes.data.id,
              role: "master",
            },
            { onConflict: "user_id" },
          );
        if (roleRes.error) throw roleRes.error;

        const requestRes = await supabase.from("access_signup_requests").insert({
          request_type: "company_owner",
          status: "approved",
          applicant_user_id: userId,
          applicant_email: email,
          applicant_full_name: fullName,
          company_name: companyName,
          requested_username: username || fullName,
          requested_job_title: jobTitle,
          requested_role: "master",
          tenant_id: tenantRes.data.id,
          reviewed_username: username || fullName,
          reviewed_job_title: jobTitle,
          reviewed_role: "master",
          review_notes: "Conta empresa criada diretamente pelo fluxo master.",
          reviewed_at: new Date().toISOString(),
          approver_user_id: userId,
          approver_email: email,
        });
        if (requestRes.error) throw requestRes.error;

        return jsonResponse({
          ok: true,
          message: "Conta empresa criada com sucesso.",
        });
      } catch (error) {
        await supabase.auth.admin.deleteUser(userId);
        throw error;
      }
    }

    if (action === "register_internal") {
      const tenant = await resolveTenant(supabase, companyName);
      if (!tenant) {
        return jsonResponse(
          { ok: false, message: "Empresa não encontrada. Solicite a criação da conta empresa primeiro." },
          200,
        );
      }

      const approverRolesRes = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("tenant_id", tenant.id)
        .in("role", ["master", "gestor"] as AppRole[]);

      if (approverRolesRes.error) throw approverRolesRes.error;

      const approverIds = (approverRolesRes.data ?? []).map((row) => row.user_id);
      if (!approverIds.length) {
        return jsonResponse({ ok: false, message: "A empresa ainda não possui responsável para aprovação." }, 200);
      }

      const approverProfilesRes = await supabase
        .from("profiles")
        .select("user_id, email, full_name, is_active")
        .eq("tenant_id", tenant.id)
        .in("user_id", approverIds)
        .eq("is_active", true);

      if (approverProfilesRes.error) throw approverProfilesRes.error;

      const findByRole = (target: AppRole) => {
        const candidate = (approverRolesRes.data ?? []).find((row) => row.role === target);
        if (!candidate) return null;
        return (approverProfilesRes.data ?? []).find((profile) => profile.user_id === candidate.user_id) ?? null;
      };

      const approver = findByRole("master") ?? findByRole("gestor");
      if (!approver?.email) {
        return jsonResponse({ ok: false, message: "Não foi encontrado e-mail ativo para aprovação na empresa." }, 200);
      }

      const authRes = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (authRes.error || !authRes.data?.user) {
        return jsonResponse(
          { ok: false, message: authRes.error?.message ?? "Não foi possível criar usuário interno." },
          200,
        );
      }

      const userId = authRes.data.user.id;
      const approvalToken = crypto.randomUUID();

      try {
        const profileRes = await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            email,
            tenant_id: tenant.id,
            is_active: false,
            preferred_language: "pt-BR",
            access_mode: "template",
          })
          .eq("user_id", userId);
        if (profileRes.error) throw profileRes.error;

        const roleRes = await supabase
          .from("user_roles")
          .upsert(
            {
              user_id: userId,
              tenant_id: tenant.id,
              role: desiredRole,
            },
            { onConflict: "user_id" },
          );
        if (roleRes.error) throw roleRes.error;

        const requestRes = await supabase
          .from("access_signup_requests")
          .insert({
            request_type: "company_internal",
            status: "pending",
            applicant_user_id: userId,
            applicant_email: email,
            applicant_full_name: fullName,
            company_name: tenant.name,
            requested_username: username || fullName,
            requested_job_title: jobTitle,
            requested_role: desiredRole,
            tenant_id: tenant.id,
            approver_user_id: approver.user_id,
            approver_email: approver.email,
            approval_token: approvalToken,
          })
          .select("id")
          .single();
        if (requestRes.error) throw requestRes.error;

        const reviewUrl = `${origin.replace(/\/+$/, "")}/acesso/avaliar?token=${approvalToken}`;
        const emailRes = await sendResendEmail(
          resendApiKey,
          from,
          approver.email,
          `[PRUMO] Nova solicitação de acesso - ${tenant.name}`,
          `
          <p>Olá, ${approver.full_name ?? "responsável"}.</p>
          <p>Foi criada uma solicitação de conta interna para a empresa <b>${tenant.name}</b>.</p>
          <p><b>Usuário:</b> ${username || fullName}<br/>
          <b>E-mail:</b> ${email}<br/>
          <b>Cargo:</b> ${jobTitle}<br/>
          <b>Perfil:</b> ${desiredRole}</p>
          <p><a href="${reviewUrl}">Clique aqui para aprovar, rejeitar ou editar</a>.</p>
          <p>A senha do usuário não é compartilhada neste processo.</p>
          `,
        );

        return jsonResponse({
          ok: true,
          message: "Solicitação enviada para aprovação da empresa.",
          requestId: requestRes.data.id,
          emailSent: emailRes.ok,
          emailWarning: emailRes.reason,
        });
      } catch (error) {
        await supabase.auth.admin.deleteUser(userId);
        throw error;
      }
    }

    return jsonResponse({ ok: false, message: "Ação inválida." }, 400);
  } catch (error) {
    const payload = toErrorPayload(error);
    return jsonResponse(
      {
        ok: false,
        message: "Erro interno ao processar solicitação.",
        error: payload.message,
        details: payload.details,
        hint: payload.hint,
        code: payload.code,
      },
      500,
    );
  }
});
