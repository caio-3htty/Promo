import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "master" | "gestor" | "engenheiro" | "operacional" | "almoxarife";
type RequestAction =
  | "register_company"
  | "register_internal"
  | "get_request"
  | "review_request"
  | "search_companies";
type ReviewDecision = "approve" | "reject" | "edit";
type AppErrorCode =
  | "action_required"
  | "invalid_action"
  | "invalid_full_name_format"
  | "full_name_length_invalid"
  | "invalid_company_name_format"
  | "company_name_length_invalid"
  | "invalid_username_format"
  | "username_length_invalid"
  | "invalid_job_title_format"
  | "job_title_length_invalid"
  | "invalid_email_format"
  | "email_length_invalid"
  | "invalid_phone_format"
  | "phone_length_invalid"
  | "tenant_required"
  | "tenant_not_found"
  | "tenant_name_mismatch"
  | "approver_not_found"
  | "profile_inactive"
  | "request_not_found"
  | "request_already_processed"
  | "request_type_invalid"
  | "review_payload_invalid"
  | "review_forbidden"
  | "review_role_not_allowed"
  | "user_type_not_configured"
  | "obra_scope_required"
  | "register_company_exists"
  | "register_company_name_required"
  | "register_company_name_invalid"
  | "auth_user_create_failed"
  | "required_fields_missing"
  | "password_too_short"
  | "supabase_config_missing";

const ALL_ROLES: AppRole[] = ["master", "gestor", "engenheiro", "operacional", "almoxarife"];

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizePlain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isValidRole = (value: unknown): value is AppRole => {
  return ALL_ROLES.includes(value as AppRole);
};

const asUuidList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
};

const slugifyCompany = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const sanitizeIlikeTerm = (value: string) =>
  value.replace(/[%_(),]/g, " ").replace(/\s+/g, " ").trim();

const FIELD_LIMITS = {
  fullName: { min: 2, max: 120 },
  companyName: { min: 2, max: 120 },
  username: { min: 3, max: 50 },
  jobTitle: { min: 2, max: 80 },
  email: { max: 254 },
  phone: { min: 10, max: 13 },
} as const;

const HAS_ALNUM_REGEX = /[\p{L}\p{N}]/u;
const HAS_LETTER_REGEX = /\p{L}/u;
const FULL_NAME_ALLOWED_REGEX = /^[\p{L}\s'-]+$/u;
const COMPANY_NAME_ALLOWED_REGEX = /^[\p{L}\p{N}\s.,&\-\/()]+$/u;
const USERNAME_ALLOWED_REGEX = /^[\p{L}\p{N}\s._-]+$/u;
const JOB_TITLE_ALLOWED_REGEX = /^[\p{L}\p{N}\s._\-\/()]+$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();
const normalizeEmail = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, "").toLowerCase().slice(0, FIELD_LIMITS.email.max);
const normalizePhone = (value: unknown) =>
  String(value ?? "").replace(/\D+/g, "").slice(0, FIELD_LIMITS.phone.max);

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
    lengthCode:
      | "full_name_length_invalid"
      | "company_name_length_invalid"
      | "username_length_invalid"
      | "job_title_length_invalid";
    formatCode:
      | "invalid_full_name_format"
      | "invalid_company_name_format"
      | "invalid_username_format"
      | "invalid_job_title_format";
    label: string;
  },
) => {
  const normalized = collapseSpaces(value);
  if (normalized.length < min || normalized.length > max) {
    return {
      ok: false as const,
      code: lengthCode,
      message: `${label} deve ter entre ${min} e ${max} caracteres.`,
      value: normalized,
    };
  }

  if (!allowedRegex.test(normalized)) {
    return {
      ok: false as const,
      code: formatCode,
      message: `${label} contem caracteres invalidos.`,
      value: normalized,
    };
  }

  if (requireLetter && !HAS_LETTER_REGEX.test(normalized)) {
    return {
      ok: false as const,
      code: formatCode,
      message: `${label} deve conter letras.`,
      value: normalized,
    };
  }

  if (!requireLetter && !HAS_ALNUM_REGEX.test(normalized)) {
    return {
      ok: false as const,
      code: formatCode,
      message: `${label} nao pode conter apenas simbolos.`,
      value: normalized,
    };
  }

  return { ok: true as const, value: normalized };
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const businessError = (
  code: AppErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
) => jsonResponse({ ok: false, code, message, ...extra }, 200);

const protocolError = (
  status: number,
  code: AppErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
) => jsonResponse({ ok: false, code, message, ...extra }, status);

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
    return { ok: false, reason: "RESEND_API_KEY nao configurada" };
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

const resolveTenantById = async (supabase: ReturnType<typeof createClient>, tenantId: string) => {
  const result = await supabase
    .from("tenants")
    .select("id, name, slug, is_active")
    .eq("id", tenantId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data;
};

const resolveTenantByName = async (supabase: ReturnType<typeof createClient>, companyName: string) => {
  const slug = slugifyCompany(companyName);

  const bySlug = await supabase
    .from("tenants")
    .select("id, name, slug, is_active")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

  if (bySlug.error) throw bySlug.error;
  if (bySlug.data) return bySlug.data;

  const byName = await supabase
    .from("tenants")
    .select("id, name, slug, is_active")
    .ilike("name", companyName)
    .limit(1)
    .maybeSingle();

  if (byName.error) throw byName.error;
  return byName.data;
};

const resolveUserTypeForRole = async (
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  role: AppRole,
) => {
  const result = await supabase
    .from("user_types")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("base_role", role)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data?.id ?? null;
};

const resolveFallbackObraIds = async (
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
) => {
  const settings = await supabase
    .from("tenant_settings")
    .select("default_obra_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (settings.error) throw settings.error;
  const defaultObraId = normalizeText(settings.data?.default_obra_id);
  if (defaultObraId) return [defaultObraId];

  const obras = await supabase
    .from("obras")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (obras.error) throw obras.error;
  return (obras.data ?? []).map((item) => item.id as string);
};

const hasObraSubset = (actorObraIds: string[], requestedObraIds: string[]) => {
  if (!actorObraIds.length || !requestedObraIds.length) return false;
  const actorSet = new Set(actorObraIds);
  return requestedObraIds.every((item) => actorSet.has(item));
};

const getActorContext = async (
  supabase: ReturnType<typeof createClient>,
  actorUserId: string,
  tenantId: string,
) => {
  const [profileRes, roleRes, obraRes, manageRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, is_active, tenant_id")
      .eq("user_id", actorUserId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", actorUserId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("user_obras")
      .select("obra_id")
      .eq("user_id", actorUserId)
      .eq("tenant_id", tenantId),
    supabase.rpc("user_has_permission", {
      _user_id: actorUserId,
      _tenant_id: tenantId,
      _permission_key: "users.manage",
      _obra_id: null,
    }),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (roleRes.error) throw roleRes.error;
  if (obraRes.error) throw obraRes.error;
  if (manageRes.error) throw manageRes.error;

  return {
    isActive: Boolean(profileRes.data?.is_active),
    role: (roleRes.data?.role ?? null) as AppRole | null,
    obraIds: (obraRes.data ?? []).map((item) => item.obra_id as string),
    hasUsersManage: Boolean(manageRes.data),
  };
};

const getAllowedRolesForActor = (
  actorRole: AppRole | null,
  hasUsersManage: boolean,
  actorObraIds: string[],
  requestedObraIds: string[],
): AppRole[] => {
  if (actorRole === "master") {
    return [...ALL_ROLES];
  }

  if (!hasUsersManage) {
    return [];
  }

  if (actorRole === "gestor") {
    return ["gestor", "engenheiro", "operacional", "almoxarife"];
  }

  if (actorRole === "engenheiro" && hasObraSubset(actorObraIds, requestedObraIds)) {
    return ["operacional", "almoxarife"];
  }

  return [];
};

const pickApprover = async (
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  requestedRole: AppRole,
  requestedObraIds: string[],
) => {
  const roleRes = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["master", "gestor", "engenheiro"] as AppRole[]);
  if (roleRes.error) throw roleRes.error;

  const candidates = roleRes.data ?? [];
  if (!candidates.length) {
    return null;
  }

  const userIds = candidates.map((item) => item.user_id);
  const profileRes = await supabase
    .from("profiles")
    .select("user_id, email, full_name, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("user_id", userIds);
  if (profileRes.error) throw profileRes.error;

  const profileByUserId = (profileRes.data ?? []).reduce<Record<string, { email: string | null; full_name: string | null }>>(
    (acc, profile) => {
      acc[profile.user_id] = { email: profile.email, full_name: profile.full_name };
      return acc;
    },
    {},
  );

  const priority: Record<AppRole, number> = {
    master: 1,
    gestor: 2,
    engenheiro: 3,
    operacional: 99,
    almoxarife: 99,
  };

  const eligible: Array<{
    user_id: string;
    role: AppRole;
    email: string;
    full_name: string | null;
  }> = [];

  for (const candidate of candidates) {
    const profile = profileByUserId[candidate.user_id];
    if (!profile?.email) continue;

    const ctx = await getActorContext(supabase, candidate.user_id, tenantId);
    if (!ctx.isActive) continue;

    const allowedRoles = getAllowedRolesForActor(
      candidate.role as AppRole,
      ctx.hasUsersManage,
      ctx.obraIds,
      requestedObraIds,
    );

    if (!allowedRoles.includes(requestedRole)) continue;

    eligible.push({
      user_id: candidate.user_id,
      role: candidate.role as AppRole,
      email: profile.email,
      full_name: profile.full_name,
    });
  }

  if (!eligible.length) {
    return null;
  }

  eligible.sort((a, b) => {
    const byRole = priority[a.role] - priority[b.role];
    if (byRole !== 0) return byRole;
    return a.email.localeCompare(b.email);
  });

  return eligible[0];
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
      return protocolError(
        500,
        "supabase_config_missing",
        "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.",
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const payload = await req.json();
    const action = normalizeText(payload?.action) as RequestAction;

    if (!action) {
      return protocolError(400, "action_required", "Acao obrigatoria.");
    }

    if (action === "search_companies") {
      const query = sanitizeIlikeTerm(normalizeText(payload?.query));
      if (query.length < 3) {
        return jsonResponse({ ok: true, companies: [] });
      }

      const slugQuery = slugifyCompany(query);
      const terms = [`name.ilike.%${query}%`];
      if (slugQuery) {
        terms.push(`slug.ilike.%${slugQuery}%`);
      }

      const companiesRes = await supabase
        .from("tenants")
        .select("id, name, slug")
        .eq("is_active", true)
        .or(terms.join(","))
        .limit(8);

      if (companiesRes.error) throw companiesRes.error;

      return jsonResponse({
        ok: true,
        companies: (companiesRes.data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          slug: item.slug,
        })),
      });
    }

    if (action === "get_request") {
      const token = normalizeText(payload?.token);
      if (!token) {
        return protocolError(400, "review_payload_invalid", "Token obrigatorio.");
      }

      const requestRes = await supabase
        .from("access_signup_requests")
        .select(
          "id, request_type, status, applicant_email, applicant_full_name, company_name, requested_username, requested_job_title, requested_phone, requested_role, requested_obra_ids, approver_user_id, tenant_id",
        )
        .eq("approval_token", token)
        .maybeSingle();

      if (requestRes.error) throw requestRes.error;
      if (!requestRes.data) {
        return protocolError(404, "request_not_found", "Solicitacao nao encontrada ou expirada.");
      }

      let allowedRoles: AppRole[] = [];
      if (requestRes.data.approver_user_id && requestRes.data.tenant_id) {
        const actorCtx = await getActorContext(
          supabase,
          requestRes.data.approver_user_id,
          requestRes.data.tenant_id,
        );
        allowedRoles = getAllowedRolesForActor(
          actorCtx.role,
          actorCtx.hasUsersManage,
          actorCtx.obraIds,
          asUuidList(requestRes.data.requested_obra_ids),
        );
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
          requestedPhone: requestRes.data.requested_phone,
          requestedRole: requestRes.data.requested_role,
          requestedObraIds: asUuidList(requestRes.data.requested_obra_ids),
          allowedRoles,
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
      const reviewedObraIds = asUuidList(payload?.reviewedObraIds);

      if (!token || !decision || !["approve", "reject", "edit"].includes(decision)) {
        return protocolError(
          400,
          "review_payload_invalid",
          "Token e decisao validos sao obrigatorios.",
        );
      }

      const requestRes = await supabase
        .from("access_signup_requests")
        .select("*")
        .eq("approval_token", token)
        .maybeSingle();

      if (requestRes.error) throw requestRes.error;
      if (!requestRes.data) {
        return protocolError(404, "request_not_found", "Solicitacao nao encontrada.");
      }
      if (requestRes.data.status !== "pending") {
        return protocolError(409, "request_already_processed", "Solicitacao ja processada.");
      }

      if (requestRes.data.request_type !== "company_internal") {
        return protocolError(
          400,
          "request_type_invalid",
          "Somente solicitacoes internas exigem revisao.",
        );
      }

      if (!requestRes.data.approver_user_id || !requestRes.data.tenant_id) {
        return protocolError(400, "review_payload_invalid", "Solicitacao sem aprovador valido.");
      }

      const actorCtx = await getActorContext(
        supabase,
        requestRes.data.approver_user_id,
        requestRes.data.tenant_id,
      );
      if (!actorCtx.isActive) {
        return protocolError(403, "profile_inactive", "Aprovador inativo para revisar solicitacao.");
      }

      const requestedObraIds = asUuidList(requestRes.data.requested_obra_ids);
      const finalObraIdsInput = reviewedObraIds.length ? reviewedObraIds : requestedObraIds;
      const allowedRoles = getAllowedRolesForActor(
        actorCtx.role,
        actorCtx.hasUsersManage,
        actorCtx.obraIds,
        finalObraIdsInput,
      );

      if (!allowedRoles.length) {
        return protocolError(
          403,
          "review_forbidden",
          "Aprovador sem permissao para revisar esta solicitacao.",
        );
      }

      const finalUsername = reviewedUsername || requestRes.data.requested_username;
      const finalJobTitle = reviewedJobTitle || requestRes.data.requested_job_title;
      const candidateRole = reviewedRole || requestRes.data.requested_role;
      const finalRole: AppRole = isValidRole(candidateRole)
        ? candidateRole
        : (requestRes.data.requested_role as AppRole);

      const finalUsernameValidation = validateHumanField(finalUsername, {
        min: FIELD_LIMITS.username.min,
        max: FIELD_LIMITS.username.max,
        allowedRegex: USERNAME_ALLOWED_REGEX,
        requireLetter: false,
        lengthCode: "username_length_invalid",
        formatCode: "invalid_username_format",
        label: "Usuario",
      });
      if (!finalUsernameValidation.ok) {
        return businessError(finalUsernameValidation.code, finalUsernameValidation.message);
      }

      const finalJobTitleValidation = validateHumanField(finalJobTitle, {
        min: FIELD_LIMITS.jobTitle.min,
        max: FIELD_LIMITS.jobTitle.max,
        allowedRegex: JOB_TITLE_ALLOWED_REGEX,
        requireLetter: false,
        lengthCode: "job_title_length_invalid",
        formatCode: "invalid_job_title_format",
        label: "Cargo",
      });
      if (!finalJobTitleValidation.ok) {
        return businessError(finalJobTitleValidation.code, finalJobTitleValidation.message);
      }

      const normalizedFinalUsername = finalUsernameValidation.value;
      const normalizedFinalJobTitle = finalJobTitleValidation.value;

      if (decision !== "reject" && !allowedRoles.includes(finalRole)) {
        return protocolError(
          403,
          "review_role_not_allowed",
          "Perfil alvo nao permitido para este aprovador.",
        );
      }

      if (decision === "reject") {
        await supabase
          .from("profiles")
          .update({ is_active: false })
          .eq("user_id", requestRes.data.applicant_user_id);

        const updateRes = await supabase
          .from("access_signup_requests")
          .update({
            status: "rejected",
            review_notes: reviewNotes || "Solicitacao rejeitada.",
            reviewed_obra_ids: finalObraIdsInput,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", requestRes.data.id);

        if (updateRes.error) throw updateRes.error;

        if (requestRes.data.applicant_email) {
          await sendResendEmail(
            resendApiKey,
            from,
            requestRes.data.applicant_email,
            "[PRUMO] Solicitacao de acesso rejeitada",
            `<p>Ola, ${requestRes.data.applicant_full_name}.</p><p>Sua solicitacao para <b>${requestRes.data.company_name}</b> foi rejeitada.</p><p>Observacao: ${reviewNotes || "Sem observacoes."}</p>`,
          );
        }

        return jsonResponse({
          ok: true,
          status: "rejected",
          message: "Solicitacao rejeitada com sucesso.",
          allowedRoles,
          appliedObraIds: finalObraIdsInput,
        });
      }

      let finalObraIds = [...finalObraIdsInput];
      if (
        ["engenheiro", "operacional", "almoxarife"].includes(finalRole) &&
        finalObraIds.length === 0
      ) {
        finalObraIds = await resolveFallbackObraIds(supabase, requestRes.data.tenant_id);
      }

      if (
        ["engenheiro", "operacional", "almoxarife"].includes(finalRole) &&
        finalObraIds.length === 0
      ) {
        return businessError(
          "obra_scope_required",
          "Nao foi possivel aprovar: usuario precisa de ao menos uma obra vinculada.",
        );
      }

      const userTypeId = await resolveUserTypeForRole(
        supabase,
        requestRes.data.tenant_id,
        finalRole,
      );
      if (!userTypeId) {
        return businessError(
          "user_type_not_configured",
          "Nao existe tipo de usuario ativo para o perfil selecionado.",
          { requestedRole: finalRole },
        );
      }

      const profileRes = await supabase
        .from("profiles")
        .update({
          is_active: true,
          full_name: normalizedFinalUsername,
          tenant_id: requestRes.data.tenant_id,
          user_type_id: userTypeId,
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

      const clearObrasRes = await supabase
        .from("user_obras")
        .delete()
        .eq("user_id", requestRes.data.applicant_user_id)
        .eq("tenant_id", requestRes.data.tenant_id);
      if (clearObrasRes.error) throw clearObrasRes.error;

      if (finalObraIds.length > 0) {
        const obraRows = finalObraIds.map((obraId) => ({
          user_id: requestRes.data.applicant_user_id,
          tenant_id: requestRes.data.tenant_id,
          obra_id: obraId,
        }));
        const obrasRes = await supabase
          .from("user_obras")
          .upsert(obraRows, { onConflict: "user_id,obra_id" });
        if (obrasRes.error) throw obrasRes.error;
      }

      await supabase.auth.admin.updateUserById(requestRes.data.applicant_user_id, {
        user_metadata: { full_name: normalizedFinalUsername },
      });

      const requestStatus = decision === "edit" ? "edited" : "approved";
      const updateRes = await supabase
        .from("access_signup_requests")
        .update({
          status: requestStatus,
          reviewed_username: normalizedFinalUsername,
          reviewed_job_title: normalizedFinalJobTitle,
          reviewed_role: finalRole,
          reviewed_obra_ids: finalObraIds,
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
          "[PRUMO] Solicitacao de acesso aprovada",
          `<p>Ola, ${requestRes.data.applicant_full_name}.</p><p>Sua solicitacao para <b>${requestRes.data.company_name}</b> foi aprovada.</p><p><b>Usuario:</b> ${normalizedFinalUsername}<br/><b>Cargo:</b> ${normalizedFinalJobTitle}<br/><b>Perfil:</b> ${finalRole}</p><p>Observacao: ${reviewNotes || "Sem observacoes."}</p>`,
        );
      }

      return jsonResponse({
        ok: true,
        status: requestStatus,
        message:
          decision === "edit"
            ? "Solicitacao aprovada com edicao de usuario/cargo."
            : "Solicitacao aprovada com sucesso.",
        allowedRoles,
        appliedObraIds: finalObraIds,
      });
    }

    const email = normalizeEmail(payload?.email);
    const password = normalizeText(payload?.password);
    const fullNameRaw = normalizeText(payload?.fullName);
    const usernameRaw = normalizeText(payload?.username);
    const companyNameRaw = normalizeText(payload?.companyName);
    const tenantId = normalizeText(payload?.tenantId);
    const jobTitleRaw = normalizeText(payload?.jobTitle);
    const phone = normalizePhone(payload?.phone);
    const requestedRoleRaw = normalizeText(payload?.requestedRole);
    const origin = normalizeText(payload?.origin) || "http://localhost:5173";
    const requestedObraIds = asUuidList(payload?.requestedObraIds);

    if (!email || !password || !fullNameRaw || !jobTitleRaw) {
      return businessError("required_fields_missing", "Campos obrigatorios ausentes.");
    }
    if (email.length > FIELD_LIMITS.email.max) {
      return businessError("email_length_invalid", `E-mail deve ter no maximo ${FIELD_LIMITS.email.max} caracteres.`);
    }
    if (!EMAIL_REGEX.test(email)) {
      return businessError("invalid_email_format", "Formato de e-mail invalido.");
    }
    if (password.length < 6) {
      return businessError("password_too_short", "A senha precisa ter ao menos 6 caracteres.");
    }
    if (phone && (phone.length < FIELD_LIMITS.phone.min || phone.length > FIELD_LIMITS.phone.max)) {
      return businessError(
        "phone_length_invalid",
        `Telefone deve ter entre ${FIELD_LIMITS.phone.min} e ${FIELD_LIMITS.phone.max} digitos.`,
      );
    }
    if (normalizeText(payload?.phone) && !phone) {
      return businessError("invalid_phone_format", "Telefone deve conter apenas numeros.");
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

    const usernameCandidate = usernameRaw || fullName;
    const usernameValidation = validateHumanField(usernameCandidate, {
      min: FIELD_LIMITS.username.min,
      max: FIELD_LIMITS.username.max,
      allowedRegex: USERNAME_ALLOWED_REGEX,
      requireLetter: false,
      lengthCode: "username_length_invalid",
      formatCode: "invalid_username_format",
      label: "Usuario",
    });
    if (!usernameValidation.ok) {
      return businessError(usernameValidation.code, usernameValidation.message);
    }
    const username = usernameValidation.value;

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

    const desiredRole: AppRole = isValidRole(requestedRoleRaw) ? requestedRoleRaw : "operacional";

    if (action === "register_company") {
      if (!companyNameRaw) {
        return businessError("register_company_name_required", "Nome da empresa e obrigatorio.");
      }

      const companyNameValidation = validateHumanField(companyNameRaw, {
        min: FIELD_LIMITS.companyName.min,
        max: FIELD_LIMITS.companyName.max,
        allowedRegex: COMPANY_NAME_ALLOWED_REGEX,
        requireLetter: false,
        lengthCode: "company_name_length_invalid",
        formatCode: "invalid_company_name_format",
        label: "Nome da empresa",
      });
      if (!companyNameValidation.ok) {
        return businessError(companyNameValidation.code, companyNameValidation.message);
      }
      const companyName = companyNameValidation.value;

      const slug = slugifyCompany(companyName);
      if (!slug) {
        return businessError("register_company_name_invalid", "Nome de empresa invalido.");
      }

      const existingTenant = await resolveTenantByName(supabase, companyName);
      if (existingTenant) {
        return businessError(
          "register_company_exists",
          "Empresa ja existe. Use o fluxo de conta interna.",
        );
      }

      const authRes = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone: phone || null },
      });

      if (authRes.error || !authRes.data?.user) {
        return jsonResponse(
          {
            ok: false,
            code: "auth_user_create_failed",
            message: authRes.error?.message ?? "Nao foi possivel criar o usuario da empresa.",
          },
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
            phone: phone || null,
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
          requested_phone: phone || null,
          reviewed_obra_ids: requestedObraIds,
          reviewed_username: username || fullName,
          reviewed_job_title: jobTitle,
          reviewed_role: "master",
          review_notes: "Conta empresa criada diretamente pelo fluxo master.",
          reviewed_at: new Date().toISOString(),
          approver_user_id: userId,
          approver_email: email,
          requested_obra_ids: requestedObraIds,
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
      if (!tenantId) {
        return businessError("tenant_required", "Selecione uma empresa valida antes de enviar.");
      }

      let companyName = "";
      if (companyNameRaw) {
        const companyNameValidation = validateHumanField(companyNameRaw, {
          min: FIELD_LIMITS.companyName.min,
          max: FIELD_LIMITS.companyName.max,
          allowedRegex: COMPANY_NAME_ALLOWED_REGEX,
          requireLetter: false,
          lengthCode: "company_name_length_invalid",
          formatCode: "invalid_company_name_format",
          label: "Nome da empresa",
        });
        if (!companyNameValidation.ok) {
          return businessError(companyNameValidation.code, companyNameValidation.message);
        }
        companyName = companyNameValidation.value;
      }

      const tenant = await resolveTenantById(supabase, tenantId);
      if (!tenant || !tenant.is_active) {
        return businessError(
          "tenant_not_found",
          "Empresa nao encontrada. Solicite a criacao da conta empresa primeiro.",
        );
      }

      if (companyName) {
        const nameMatches = normalizePlain(companyName) === normalizePlain(tenant.name);
        const slugMatches = slugifyCompany(companyName) === normalizeText(tenant.slug);
        if (!nameMatches && !slugMatches) {
          return businessError(
            "tenant_name_mismatch",
            "Empresa selecionada nao confere com o nome informado.",
          );
        }
      }

      const approver = await pickApprover(supabase, tenant.id, desiredRole, requestedObraIds);
      if (!approver) {
        return businessError(
          "approver_not_found",
          "Nao ha aprovador elegivel para este perfil/escopo na empresa.",
        );
      }

      const authRes = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone: phone || null },
      });

      if (authRes.error || !authRes.data?.user) {
        return jsonResponse(
          {
            ok: false,
            code: "auth_user_create_failed",
            message: authRes.error?.message ?? "Nao foi possivel criar usuario interno.",
          },
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
            phone: phone || null,
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
            requested_phone: phone || null,
            requested_role: desiredRole,
            requested_obra_ids: requestedObraIds,
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
          `[PRUMO] Nova solicitacao de acesso - ${tenant.name}`,
          `
          <p>Ola, ${approver.full_name ?? "responsavel"}.</p>
          <p>Foi criada uma solicitacao de conta interna para a empresa <b>${tenant.name}</b>.</p>
          <p><b>Usuario:</b> ${username || fullName}<br/>
          <b>E-mail:</b> ${email}<br/>
          <b>Cargo:</b> ${jobTitle}<br/>
          <b>Telefone:</b> ${phone || "Nao informado"}<br/>
          <b>Perfil:</b> ${desiredRole}</p>
          <p><a href="${reviewUrl}">Clique aqui para aprovar, rejeitar ou editar</a>.</p>
          <p>A senha do usuario nao e compartilhada neste processo.</p>
          `,
        );

        return jsonResponse({
          ok: true,
          message: "Solicitacao enviada para aprovacao da empresa.",
          requestId: requestRes.data.id,
          emailSent: emailRes.ok,
          emailWarning: emailRes.reason,
          approverRole: approver.role,
        });
      } catch (error) {
        await supabase.auth.admin.deleteUser(userId);
        throw error;
      }
    }

    return protocolError(400, "invalid_action", "Acao invalida.");
  } catch (error) {
    const payload = toErrorPayload(error);
    return jsonResponse(
      {
        ok: false,
        message: "Erro interno ao processar solicitacao.",
        error: payload.message,
        details: payload.details,
        hint: payload.hint,
        code: payload.code,
      },
      500,
    );
  }
});
