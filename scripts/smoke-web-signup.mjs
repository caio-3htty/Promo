#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { bootstrapEnv, missingRequired } from "./lib/env-resolver.mjs";

bootstrapEnv({ cwd: process.cwd() });

const PASS = "PASS";
const FAIL = "FAIL";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = missingRequired(required);
if (missing.length > 0) {
  console.error(`Variaveis ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

const baseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const origin = process.env.SMOKE_WEB_ORIGIN || "https://smoke.prumo.local";

const stamp = Date.now();
const random = Math.floor(Math.random() * 1000);
const prefix = `smoke-web-${stamp}-${random}`;

const ownerEmailRaw = `${prefix}.MASTER@EXAMPLE.COM`;
const ownerEmail = ownerEmailRaw.toLowerCase();
const ownerPassword = `Smoke#${stamp}A`;

const internalEmailRaw = `${prefix}.INTERNAL@EXAMPLE.COM`;
const internalEmail = internalEmailRaw.toLowerCase();
const internalPassword = `Smoke#${stamp}B`;

const ownerCompanyName = `${prefix} empresa`;

const state = {
  tenantId: null,
  obraId: null,
  ownerUserId: null,
  internalUserId: null,
  internalRequestId: null,
  internalApprovalToken: null,
};

const report = {
  generatedAt: new Date().toISOString(),
  prefix,
  scenarios: [],
  cleanup: {
    status: PASS,
    steps: [],
  },
};

const EMPTY_TENANT_TABLES = [
  "obras",
  "pedidos_compra",
  "materiais",
  "fornecedores",
  "estoque_obra_material",
  "notificacoes",
];

const mask = (value) => {
  if (!value || typeof value !== "string") return value;
  if (value.length < 10) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const requestJson = async (url, { method = "GET", headers = {}, body } = {}) => {
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }
  return { ok: response.ok, status: response.status, data };
};

const functionCall = (payload, token = anonKey) =>
  requestJson(`${baseUrl}/functions/v1/account-access-request`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: payload,
  });

const restService = (path, { method = "GET", body, prefer } = {}) => {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return requestJson(`${baseUrl}/rest/v1/${path}`, { method, headers, body });
};

const authLogin = (email, password) =>
  requestJson(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: { email, password },
  });

const deleteAuthUser = (userId) =>
  requestJson(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertTenantStartsEmpty = async (tenantId) => {
  const counts = {};
  for (const table of EMPTY_TENANT_TABLES) {
    const res = await restService(
      `${table}?select=id&tenant_id=eq.${encodeURIComponent(tenantId)}&limit=1`,
    );
    assert(res.ok, `falha ao consultar tabela ${table} (${res.status})`);
    const rows = Array.isArray(res.data) ? res.data.length : 0;
    assert(rows === 0, `tenant novo com dados preexistentes em ${table}`);
    counts[table] = rows;
  }
  return counts;
};

const addScenario = async (name, run) => {
  const scenario = { name, status: PASS, evidence: {} };
  try {
    scenario.evidence = await run();
  } catch (error) {
    scenario.status = FAIL;
    scenario.error = String(error?.message || error);
  }
  report.scenarios.push(scenario);
};

const cleanupStep = async (step, run) => {
  try {
    await run();
    report.cleanup.steps.push({ step, status: PASS });
  } catch (error) {
    report.cleanup.status = FAIL;
    report.cleanup.steps.push({
      step,
      status: FAIL,
      detail: String(error?.message || error),
    });
  }
};

try {
  await addScenario("A1 register_company + login + profile/role/audit", async () => {
    const register = await functionCall({
      action: "register_company",
      email: ownerEmailRaw,
      password: ownerPassword,
      fullName: "Gestor Smoke",
      username: "gestor-smoke",
      companyName: ownerCompanyName,
      jobTitle: "Gestor",
      phone: "11987654321",
      requestedRole: "master",
      origin,
    });
    assert(
      register.status === 200 && register.data?.ok === true,
      `register_company falhou (${register.status})`,
    );

    const ownerLogin = await authLogin(ownerEmail, ownerPassword);
    assert(ownerLogin.status === 200 && ownerLogin.data?.access_token, "login master falhou");
    state.ownerUserId = ownerLogin.data?.user?.id ?? null;
    assert(state.ownerUserId, "owner user id ausente");

    const profile = await restService(
      `profiles?select=user_id,tenant_id,is_active,phone&user_id=eq.${encodeURIComponent(state.ownerUserId)}&limit=1`,
    );
    assert(
      profile.ok && Array.isArray(profile.data) && profile.data.length === 1,
      "profile master nao encontrado",
    );
    state.tenantId = profile.data[0].tenant_id;
    assert(profile.data[0].is_active === true, "profile master inativo");

    const role = await restService(
      `user_roles?select=role,tenant_id&user_id=eq.${encodeURIComponent(state.ownerUserId)}&limit=1`,
    );
    assert(role.ok && Array.isArray(role.data) && role.data[0]?.role === "master", "role master ausente");

    const requestAudit = await restService(
      `access_signup_requests?select=id,status,request_type,requested_phone,applicant_email&applicant_email=eq.${encodeURIComponent(ownerEmail)}&limit=1`,
    );
    assert(
      requestAudit.ok && Array.isArray(requestAudit.data) && requestAudit.data.length === 1,
      "auditoria da conta empresa ausente",
    );
    assert(requestAudit.data[0].status === "approved", "status de request empresa invalido");
    assert(requestAudit.data[0].request_type === "company_owner", "tipo de request empresa invalido");
    assert(requestAudit.data[0].requested_phone === "11987654321", "phone nao persistiu no audit");
    assert(
      !JSON.stringify(requestAudit.data[0]).toLowerCase().includes("password"),
      "vazamento de senha no payload de auditoria",
    );
    const emptyCoreCounts = await assertTenantStartsEmpty(state.tenantId);

    return {
      tenantId: mask(state.tenantId),
      ownerUserId: mask(state.ownerUserId),
      requestId: mask(requestAudit.data[0].id),
      emptyCoreCounts,
    };
  });

  await addScenario("B1 search_companies + bloqueio sem tenantId", async () => {
    const search = await functionCall({ action: "search_companies", query: prefix });
    assert(search.status === 200 && search.data?.ok === true, "search_companies falhou");
    const found = (search.data?.companies ?? []).some((item) => item.id === state.tenantId);
    assert(found, "tenant criado nao encontrado no search_companies");

    const blocked = await functionCall({
      action: "register_internal",
      email: internalEmail,
      password: internalPassword,
      fullName: "Colaborador Smoke",
      username: "colab-smoke",
      companyName: ownerCompanyName,
      jobTitle: "Operacional",
      phone: "21988887777",
      requestedRole: "operacional",
      origin,
    });
    assert(blocked.status === 200 && blocked.data?.ok === false, "register_internal sem tenantId deveria falhar");
    assert(String(blocked.data?.code ?? "") === "tenant_required", "codigo esperado tenant_required");

    return {
      blockedCode: blocked.data?.code,
      tenantFound: true,
    };
  });

  await addScenario("B2 register_internal + review(edit) + login + scope", async () => {
    assert(state.tenantId, "tenantId ausente antes do cenario B2");

    const obra = await restService("obras", {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: state.tenantId,
        name: `${prefix}-obra-a`,
        status: "ativa",
      },
    });
    assert(obra.ok && Array.isArray(obra.data) && obra.data[0]?.id, "falha ao criar obra smoke");
    state.obraId = obra.data[0].id;

    const register = await functionCall({
      action: "register_internal",
      email: internalEmailRaw,
      password: internalPassword,
      fullName: "Colaborador Smoke",
      username: "colab-smoke",
      companyName: ownerCompanyName,
      tenantId: state.tenantId,
      jobTitle: "Operacional",
      phone: "21988887777",
      requestedRole: "operacional",
      requestedObraIds: [state.obraId],
      origin,
    });
    assert(register.status === 200 && register.data?.ok === true, "register_internal falhou");

    const pending = await restService(
      `access_signup_requests?select=id,approval_token,applicant_user_id,status&applicant_email=eq.${encodeURIComponent(internalEmail)}&status=eq.pending&limit=1`,
    );
    assert(pending.ok && Array.isArray(pending.data) && pending.data[0]?.approval_token, "request pendente nao encontrada");
    state.internalRequestId = pending.data[0].id;
    state.internalApprovalToken = pending.data[0].approval_token;
    state.internalUserId = pending.data[0].applicant_user_id;

    const getRequest = await functionCall({
      action: "get_request",
      token: state.internalApprovalToken,
    });
    assert(getRequest.status === 200 && getRequest.data?.ok === true, "get_request falhou");
    assert(
      !JSON.stringify(getRequest.data).toLowerCase().includes("password"),
      "vazamento de senha no get_request",
    );

    const review = await functionCall({
      action: "review_request",
      token: state.internalApprovalToken,
      decision: "edit",
      reviewedUsername: "colab-smoke-edit",
      reviewedJobTitle: "Operacional Senior",
      reviewedRole: "operacional",
      reviewedObraIds: [state.obraId],
      reviewNotes: "Aprovado no smoke web signup",
    });
    assert(
      review.status === 200 && review.data?.ok === true,
      `review_request falhou (${review.status}) code=${review.data?.code ?? "n/a"}`,
    );

    const login = await authLogin(internalEmail, internalPassword);
    assert(login.status === 200 && login.data?.access_token, "login interno falhou apos aprovacao");

    const profile = await restService(
      `profiles?select=is_active,tenant_id,user_type_id,phone&user_id=eq.${encodeURIComponent(state.internalUserId)}&limit=1`,
    );
    assert(profile.ok && Array.isArray(profile.data) && profile.data.length === 1, "profile interno ausente");
    assert(profile.data[0].is_active === true, "profile interno inativo");
    assert(profile.data[0].tenant_id === state.tenantId, "tenant_id interno divergente");
    assert(!!profile.data[0].user_type_id, "user_type_id nao preenchido");
    assert(profile.data[0].phone === "21988887777", "phone interno nao persistiu");

    const userObras = await restService(
      `user_obras?select=obra_id&user_id=eq.${encodeURIComponent(state.internalUserId)}&tenant_id=eq.${encodeURIComponent(state.tenantId)}`,
    );
    assert(
      userObras.ok &&
        Array.isArray(userObras.data) &&
        userObras.data.some((item) => item.obra_id === state.obraId),
      "user_obras nao vinculado",
    );

    return {
      internalUserId: mask(state.internalUserId),
      internalRequestId: mask(state.internalRequestId),
      userTypeProvisioned: true,
      obraLinked: true,
    };
  });

  await addScenario("C1 validacao de entrada e codigos de erro", async () => {
    const invalidPhoneFormat = await functionCall({
      action: "register_company",
      email: `${prefix}.fmt@example.com`,
      password: "Smoke#12345",
      fullName: "Nome Valido",
      username: "nome-valido",
      companyName: `${prefix}-fmt`,
      jobTitle: "Gestor",
      phone: "ABC",
      requestedRole: "master",
      origin,
    });
    assert(invalidPhoneFormat.status === 200 && invalidPhoneFormat.data?.ok === false, "formato de phone invalido deveria falhar");
    assert(invalidPhoneFormat.data?.code === "invalid_phone_format", "codigo invalido para phone format");

    const invalidPhoneLength = await functionCall({
      action: "register_company",
      email: `${prefix}.len@example.com`,
      password: "Smoke#12345",
      fullName: "Nome Valido",
      username: "nome-valido",
      companyName: `${prefix}-len`,
      jobTitle: "Gestor",
      phone: "12345",
      requestedRole: "master",
      origin,
    });
    assert(invalidPhoneLength.status === 200 && invalidPhoneLength.data?.ok === false, "tamanho de phone invalido deveria falhar");
    assert(invalidPhoneLength.data?.code === "phone_length_invalid", "codigo invalido para phone length");

    const invalidName = await functionCall({
      action: "register_company",
      email: `${prefix}.name@example.com`,
      password: "Smoke#12345",
      fullName: "@@@@",
      username: "nome-valido",
      companyName: `${prefix}-name`,
      jobTitle: "Gestor",
      phone: "11999999999",
      requestedRole: "master",
      origin,
    });
    assert(invalidName.status === 200 && invalidName.data?.ok === false, "nome invalido deveria falhar");
    assert(invalidName.data?.code === "invalid_full_name_format", "codigo invalido para full_name");

    const tenantNotFound = await functionCall({
      action: "register_internal",
      email: `${prefix}.tenant@example.com`,
      password: "Smoke#12345",
      fullName: "Nome Interno",
      username: "interno-nome",
      companyName: "Empresa Inexistente",
      tenantId: randomUUID(),
      jobTitle: "Operacional",
      phone: "11999999999",
      requestedRole: "operacional",
      origin,
    });
    assert(tenantNotFound.status === 200 && tenantNotFound.data?.ok === false, "tenant inexistente deveria falhar");
    assert(tenantNotFound.data?.code === "tenant_not_found", "codigo invalido para tenant inexistente");

    return {
      invalidPhoneFormat: invalidPhoneFormat.data?.code,
      invalidPhoneLength: invalidPhoneLength.data?.code,
      invalidFullName: invalidName.data?.code,
      invalidTenant: tenantNotFound.data?.code,
    };
  });
} finally {
  await cleanupStep("delete_internal_request", async () => {
    if (!state.internalRequestId) return;
    const res = await restService(
      `access_signup_requests?id=eq.${encodeURIComponent(state.internalRequestId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_signup_requests_by_prefix", async () => {
    const res = await restService(
      `access_signup_requests?applicant_email=ilike.${encodeURIComponent(prefix)}%25`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_internal_auth_user", async () => {
    if (!state.internalUserId) return;
    const res = await deleteAuthUser(state.internalUserId);
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_owner_auth_user", async () => {
    if (!state.ownerUserId) return;
    const res = await deleteAuthUser(state.ownerUserId);
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_test_obra", async () => {
    if (!state.obraId) return;
    const res = await restService(`obras?id=eq.${encodeURIComponent(state.obraId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_tenant_settings", async () => {
    if (!state.tenantId) return;
    const res = await restService(
      `tenant_settings?tenant_id=eq.${encodeURIComponent(state.tenantId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_audit_log_by_tenant", async () => {
    if (!state.tenantId) return;
    const res = await restService(`audit_log?tenant_id=eq.${encodeURIComponent(state.tenantId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_user_type_permissions_by_tenant", async () => {
    if (!state.tenantId) return;
    const res = await restService(
      `user_type_permissions?tenant_id=eq.${encodeURIComponent(state.tenantId)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_user_types_by_tenant", async () => {
    if (!state.tenantId) return;
    const res = await restService(`user_types?tenant_id=eq.${encodeURIComponent(state.tenantId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("delete_tenant", async () => {
    if (!state.tenantId) return;
    const res = await restService(`tenants?id=eq.${encodeURIComponent(state.tenantId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await cleanupStep("confirm_no_signup_residue", async () => {
    const res = await restService(
      `access_signup_requests?select=id&applicant_email=ilike.${encodeURIComponent(prefix)}%25&limit=1`,
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
    if (Array.isArray(res.data) && res.data.length > 0) {
      throw new Error("residuo em access_signup_requests");
    }
  });

  await cleanupStep("confirm_no_tenant_residue", async () => {
    const res = await restService(`tenants?select=id&name=ilike.${encodeURIComponent(prefix)}%25&limit=1`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    if (Array.isArray(res.data) && res.data.length > 0) {
      throw new Error("residuo em tenants");
    }
  });
}

const scenarioFailCount = report.scenarios.filter((item) => item.status === FAIL).length;
const summary = {
  ok: scenarioFailCount === 0 && report.cleanup.status === PASS,
  generatedAt: report.generatedAt,
  prefix,
  pass: report.scenarios.filter((item) => item.status === PASS).length,
  fail: scenarioFailCount,
  cleanup: report.cleanup.status,
  scenarios: report.scenarios,
  cleanupSteps: report.cleanup.steps,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 2);
