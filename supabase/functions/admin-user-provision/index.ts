import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "master" | "gestor" | "engenheiro" | "operacional" | "almoxarife";
type ProvisionErrorCode =
  | "config_missing"
  | "auth_required"
  | "invalid_token"
  | "required_fields_missing"
  | "invalid_full_name_format"
  | "full_name_length_invalid"
  | "invalid_job_title_format"
  | "job_title_length_invalid"
  | "invalid_email_format"
  | "email_length_invalid"
  | "invalid_phone_format"
  | "phone_length_invalid"
  | "invalid_role"
  | "password_too_short"
  | "invalid_tenant"
  | "forbidden_role_scope"
  | "auth_user_create_failed"
  | "internal_error";

const ALL_ROLES: AppRole[] = ["master", "gestor", "engenheiro", "operacional", "almoxarife"];

const normalizeText = (value: unknown) => String(value ?? "").trim();
const isValidRole = (value: unknown): value is AppRole => ALL_ROLES.includes(value as AppRole);
const asUuidList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
};

const FIELD_LIMITS = {
  fullName: { min: 2, max: 120 },
  jobTitle: { min: 2, max: 80 },
  email: { max: 254 },
  phone: { min: 10, max: 13 },
} as const;

const HAS_ALNUM_REGEX = /[\p{L}\p{N}]/u;
const HAS_LETTER_REGEX = /\p{L}/u;
const FULL_NAME_ALLOWED_REGEX = /^[\p{L}\s'-]+$/u;
const JOB_TITLE_ALLOWED_REGEX = /^[\p{L}\p{N}\s._\-\/()]+$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();
const normalizeEmail = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, "").toLowerCase().slice(0, FIELD_LIMITS.email.max);
const normalizePhone = (value: unknown) =>
  String(value ?? "").replace(/\D+/g, "").slice(0, FIELD_LIMITS.phone.max);

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const businessError = (code: ProvisionErrorCode, message: string, status = 400) =>
  jsonResponse({ ok: false, code, message }, status);

const validateHumanField = (
  value: string,
  {
    min,
    max,
    allowedRegex,
    requireLetter,
    lengthCode,
    formatCode,
    label,
  }: {
    min: number;
    max: number;
    allowedRegex: RegExp;
    requireLetter: boolean;
    lengthCode: "full_name_length_invalid" | "job_title_length_invalid";
    formatCode: "invalid_full_name_format" | "invalid_job_title_format";
    label: string;
  },
) => {
  const normalized = collapseSpaces(value);
  if (normalized.length < min || normalized.length > max) {
    return {
      ok: false as const,
      code: lengthCode,
      message: `${label} deve ter entre ${min} e ${max} caracteres.`,
    };
  }
  if (!allowedRegex.test(normalized)) {
    return {
      ok: false as const,
      code: formatCode,
      message: `${label} contem caracteres invalidos.`,
    };
  }
  if (requireLetter && !HAS_LETTER_REGEX.test(normalized)) {
    return {
      ok: false as const,
      code: formatCode,
      message: `${label} deve conter letras.`,
    };
  }
  if (!requireLetter && !HAS_ALNUM_REGEX.test(normalized)) {
    return {
      ok: false as const,
      code: formatCode,
      message: `${label} nao pode conter apenas simbolos.`,
    };
  }
  return { ok: true as const, value: normalized };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let createdUserId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return businessError("config_missing", "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.", 500);
    }

    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace("Bearer ", "").trim();
    if (!jwt) {
      return businessError("auth_required", "Authorization Bearer token obrigatorio.", 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const actorAuth = await supabase.auth.getUser(jwt);
    if (actorAuth.error || !actorAuth.data.user) {
      return businessError("invalid_token", "Token invalido para provisionamento administrativo.", 401);
    }
    const actorUserId = actorAuth.data.user.id;

    const body = await req.json();
    const tenantId = normalizeText(body?.tenant_id);
    const email = normalizeEmail(body?.email);
    const fullNameRaw = normalizeText(body?.full_name);
    const jobTitleRaw = normalizeText(body?.job_title);
    const phoneRaw = normalizeText(body?.phone);
    const phone = normalizePhone(body?.phone);
    const role = normalizeText(body?.role);
    const tempPassword = normalizeText(body?.temp_password);
    const obraIds = asUuidList(body?.obra_ids);

    if (!tenantId || !email || !fullNameRaw || !jobTitleRaw || !tempPassword || !role) {
      return businessError("required_fields_missing", "Campos obrigatorios ausentes para provisionamento.");
    }
    if (email.length > FIELD_LIMITS.email.max) {
      return businessError("email_length_invalid", `E-mail deve ter no maximo ${FIELD_LIMITS.email.max} caracteres.`);
    }
    if (!EMAIL_REGEX.test(email)) {
      return businessError("invalid_email_format", "Formato de e-mail invalido.");
    }
    if (phoneRaw && !phone) {
      return businessError("invalid_phone_format", "Telefone deve conter apenas numeros.");
    }
    if (phone && (phone.length < FIELD_LIMITS.phone.min || phone.length > FIELD_LIMITS.phone.max)) {
      return businessError(
        "phone_length_invalid",
        `Telefone deve ter entre ${FIELD_LIMITS.phone.min} e ${FIELD_LIMITS.phone.max} digitos.`,
      );
    }

    const fullNameValidation = validateHumanField(fullNameRaw, {
      min: FIELD_LIMITS.fullName.min,
      max: FIELD_LIMITS.fullName.max,
      allowedRegex: FULL_NAME_ALLOWED_REGEX,
      requireLetter: true,
      lengthCode: "full_name_length_invalid",
      formatCode: "invalid_full_name_format",
      label: "Nome completo",
    });
    if (!fullNameValidation.ok) {
      return businessError(fullNameValidation.code, fullNameValidation.message);
    }
    const fullName = fullNameValidation.value;

    const jobTitleValidation = validateHumanField(jobTitleRaw, {
      min: FIELD_LIMITS.jobTitle.min,
      max: FIELD_LIMITS.jobTitle.max,
      allowedRegex: JOB_TITLE_ALLOWED_REGEX,
      requireLetter: false,
      lengthCode: "job_title_length_invalid",
      formatCode: "invalid_job_title_format",
      label: "Cargo",
    });
    if (!jobTitleValidation.ok) {
      return businessError(jobTitleValidation.code, jobTitleValidation.message);
    }
    const jobTitle = jobTitleValidation.value;

    if (!isValidRole(role)) {
      return businessError("invalid_role", "Perfil de acesso invalido.");
    }
    if (tempPassword.length < 6) {
      return businessError("password_too_short", "Senha temporaria deve ter ao menos 6 caracteres.");
    }

    const tenantRes = await supabase
      .from("tenants")
      .select("id, name, is_active")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRes.error) throw tenantRes.error;
    if (!tenantRes.data || !tenantRes.data.is_active) {
      return businessError("invalid_tenant", "Tenant invalido para provisionamento.");
    }

    const canAssignRes = await supabase.rpc("can_assign_role", {
      _actor_user_id: actorUserId,
      _tenant_id: tenantId,
      _target_role: role,
      _obra_ids: obraIds,
    });
    if (canAssignRes.error) throw canAssignRes.error;
    if (!canAssignRes.data) {
      return businessError("forbidden_role_scope", "Sem permissao para criar esse perfil no escopo informado.", 403);
    }

    const authCreateRes = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, job_title: jobTitle, phone: phone || null },
    });

    if (authCreateRes.error || !authCreateRes.data.user) {
      return jsonResponse({
        ok: false,
        code: "auth_user_create_failed",
        message: authCreateRes.error?.message ?? "Falha ao criar usuario no auth.",
      }, 400);
    }

    createdUserId = authCreateRes.data.user.id;

    const profileRes = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        email,
        phone: phone || null,
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
        phone: phone || null,
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
      phone: phone || null,
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

    return jsonResponse({ ok: false, code: "internal_error", message: String(error) }, 500);
  }
});
