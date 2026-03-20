import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "master" | "gestor" | "engenheiro" | "operacional" | "almoxarife";

const ALL_ROLES: AppRole[] = ["master", "gestor", "engenheiro", "operacional", "almoxarife"];

const normalizeText = (value: unknown) => String(value ?? "").trim();
const isValidRole = (value: unknown): value is AppRole => ALL_ROLES.includes(value as AppRole);
const asUuidList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let createdUserId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, message: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace("Bearer ", "").trim();
    if (!jwt) {
      return jsonResponse({ ok: false, message: "Authorization Bearer token obrigatorio." }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const actorAuth = await supabase.auth.getUser(jwt);
    if (actorAuth.error || !actorAuth.data.user) {
      return jsonResponse({ ok: false, message: "Token invalido para provisionamento administrativo." }, 401);
    }
    const actorUserId = actorAuth.data.user.id;

    const body = await req.json();
    const tenantId = normalizeText(body?.tenant_id);
    const email = normalizeText(body?.email).toLowerCase();
    const fullName = normalizeText(body?.full_name);
    const jobTitle = normalizeText(body?.job_title);
    const role = normalizeText(body?.role);
    const tempPassword = normalizeText(body?.temp_password);
    const obraIds = asUuidList(body?.obra_ids);

    if (!tenantId || !email || !fullName || !jobTitle || !tempPassword || !role) {
      return jsonResponse({ ok: false, message: "Campos obrigatorios ausentes para provisionamento." }, 400);
    }
    if (!isValidRole(role)) {
      return jsonResponse({ ok: false, message: "Perfil de acesso invalido." }, 400);
    }
    if (tempPassword.length < 6) {
      return jsonResponse({ ok: false, message: "Senha temporaria deve ter ao menos 6 caracteres." }, 400);
    }

    const tenantRes = await supabase
      .from("tenants")
      .select("id, name, is_active")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRes.error) throw tenantRes.error;
    if (!tenantRes.data || !tenantRes.data.is_active) {
      return jsonResponse({ ok: false, message: "Tenant invalido para provisionamento." }, 400);
    }

    const canAssignRes = await supabase.rpc("can_assign_role", {
      _actor_user_id: actorUserId,
      _tenant_id: tenantId,
      _target_role: role,
      _obra_ids: obraIds,
    });
    if (canAssignRes.error) throw canAssignRes.error;
    if (!canAssignRes.data) {
      return jsonResponse({ ok: false, message: "Sem permissao para criar esse perfil no escopo informado." }, 403);
    }

    const authCreateRes = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, job_title: jobTitle },
    });

    if (authCreateRes.error || !authCreateRes.data.user) {
      return jsonResponse(
        { ok: false, message: authCreateRes.error?.message ?? "Falha ao criar usuario no auth." },
        400,
      );
    }

    createdUserId = authCreateRes.data.user.id;

    const profileRes = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        email,
        tenant_id: tenantId,
        is_active: true,
        preferred_language: "pt-BR",
        access_mode: "template",
      })
      .eq("user_id", createdUserId);
    if (profileRes.error) throw profileRes.error;

    const roleRes = await supabase
      .from("user_roles")
      .upsert(
        {
          user_id: createdUserId,
          tenant_id: tenantId,
          role,
        },
        { onConflict: "user_id" },
      );
    if (roleRes.error) throw roleRes.error;

    const deleteObraRes = await supabase
      .from("user_obras")
      .delete()
      .eq("user_id", createdUserId)
      .eq("tenant_id", tenantId);
    if (deleteObraRes.error) throw deleteObraRes.error;

    if (obraIds.length > 0) {
      const rows = obraIds.map((obraId) => ({
        user_id: createdUserId,
        obra_id: obraId,
        tenant_id: tenantId,
      }));
      const obraRes = await supabase.from("user_obras").insert(rows);
      if (obraRes.error) throw obraRes.error;
    }

    const auditRes = await supabase.from("audit_log").insert({
      tenant_id: tenantId,
      entity_table: "profiles",
      entity_id: createdUserId,
      action: "admin_provision_user",
      changed_by: actorUserId,
      target_user_id: createdUserId,
      old_data: null,
      new_data: {
        email,
        full_name: fullName,
        job_title: jobTitle,
        role,
        obra_ids: obraIds,
      },
    });
    if (auditRes.error) throw auditRes.error;

    return jsonResponse({
      ok: true,
      message: "Usuario provisionado com sucesso.",
      user_id: createdUserId,
      email,
      role,
      obra_ids: obraIds,
    });
  } catch (error) {
    if (createdUserId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const rollbackClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        await rollbackClient.auth.admin.deleteUser(createdUserId);
      } catch {
        // noop rollback best effort
      }
    }

    return jsonResponse({ ok: false, message: String(error) }, 500);
  }
});
