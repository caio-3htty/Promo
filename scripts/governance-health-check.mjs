#!/usr/bin/env node

import { bootstrapEnv, missingRequired } from "./lib/env-resolver.mjs";

bootstrapEnv({ cwd: process.cwd() });

const REQUIRED_KEYS = ["SUPABASE_SERVICE_ROLE_KEY"];
const missingKeys = missingRequired(REQUIRED_KEYS);
if (missingKeys.length > 0) {
  console.error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  process.exit(1);
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const BASE_URL = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const TENANT_ID_ENV = process.env.SUPABASE_TENANT_ID || null;
const TARGET_MASTER_EMAIL = (process.env.GOVERNANCE_MASTER_EMAIL || "").trim().toLowerCase();
const TARGET_MASTER_PASSWORD = process.env.GOVERNANCE_MASTER_PASSWORD || "";

const PASS = "PASS";
const FAIL = "FAIL";
const WARN = "WARN";

const jsonHeaders = (token, extra = {}) => ({
  apikey: token,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  ...extra,
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })()
    : null;

  return { ok: response.ok, status: response.status, data };
}

function encodeFilterValue(value) {
  return encodeURIComponent(value);
}

async function restService(path, { method = "GET", body, prefer } = {}) {
  const headers = jsonHeaders(SERVICE_ROLE_KEY, {});
  if (prefer) headers.Prefer = prefer;

  return requestJson(`${BASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function resolveTenantId() {
  if (TENANT_ID_ENV) return TENANT_ID_ENV;

  const fromTenants = await restService("tenants?select=id&is_active=eq.true&limit=1");
  if (fromTenants.ok && Array.isArray(fromTenants.data) && fromTenants.data[0]?.id) {
    return fromTenants.data[0].id;
  }

  const fromObras = await restService("obras?select=tenant_id&deleted_at=is.null&limit=1");
  if (fromObras.ok && Array.isArray(fromObras.data) && fromObras.data[0]?.tenant_id) {
    return fromObras.data[0].tenant_id;
  }

  throw new Error("Nao foi possivel resolver tenant_id para o health check de governanca.");
}

async function login(email, password) {
  const response = await requestJson(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  return response;
}

function mapByUserId(rows) {
  return rows.reduce((acc, row) => {
    acc[row.user_id] = row;
    return acc;
  }, {});
}

async function main() {
  const tenantId = await resolveTenantId();
  const checks = [];

  const rolesRes = await restService(
    `user_roles?select=user_id,tenant_id,role&tenant_id=eq.${encodeFilterValue(tenantId)}&limit=5000`,
  );
  if (!rolesRes.ok) {
    throw new Error(`Falha ao ler user_roles: ${rolesRes.status} ${JSON.stringify(rolesRes.data)}`);
  }

  const roleRows = Array.isArray(rolesRes.data) ? rolesRes.data : [];
  const userIds = Array.from(new Set(roleRows.map((row) => row.user_id).filter(Boolean)));
  const inClause = userIds.map((id) => encodeFilterValue(id)).join(",");

  const profilesRes = userIds.length
    ? await restService(
        `profiles?select=user_id,tenant_id,is_active,email,full_name,user_type_id&tenant_id=eq.${encodeFilterValue(
          tenantId,
        )}&user_id=in.(${inClause})&limit=5000`,
      )
    : { ok: true, data: [] };
  if (!profilesRes.ok) {
    throw new Error(`Falha ao ler profiles: ${profilesRes.status} ${JSON.stringify(profilesRes.data)}`);
  }

  const userObrasRes = await restService(
    `user_obras?select=user_id,obra_id&tenant_id=eq.${encodeFilterValue(tenantId)}&limit=50000`,
  );
  if (!userObrasRes.ok) {
    throw new Error(`Falha ao ler user_obras: ${userObrasRes.status} ${JSON.stringify(userObrasRes.data)}`);
  }

  const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
  const profileByUserId = mapByUserId(profiles);
  const obraRows = Array.isArray(userObrasRes.data) ? userObrasRes.data : [];

  const obraCountByUser = obraRows.reduce((acc, row) => {
    if (!row.user_id) return acc;
    acc[row.user_id] = (acc[row.user_id] || 0) + 1;
    return acc;
  }, {});

  const masters = roleRows.filter((row) => row.role === "master");
  const activeMasters = masters.filter((row) => profileByUserId[row.user_id]?.is_active === true);
  const masterWithoutObra = masters.filter((row) => (obraCountByUser[row.user_id] || 0) < 1);
  const adminRoles = new Set(["master", "gestor", "engenheiro"]);
  const adminInconsistent = roleRows.filter((row) => {
    if (!adminRoles.has(row.role)) return false;
    const profile = profileByUserId[row.user_id];
    if (!profile) return true;
    if (profile.tenant_id !== tenantId) return true;
    if (profile.is_active !== true) return true;
    return false;
  });

  checks.push({
    id: "single_master_per_tenant",
    status: activeMasters.length === 1 ? PASS : FAIL,
    detail: `masters ativos: ${activeMasters.length}`,
  });
  checks.push({
    id: "master_has_obra_scope",
    status: masterWithoutObra.length === 0 ? PASS : FAIL,
    detail: `masters sem obra: ${masterWithoutObra.length}`,
  });
  checks.push({
    id: "admin_consistency",
    status: adminInconsistent.length === 0 ? PASS : WARN,
    detail: `admins inconsistentes/inativos: ${adminInconsistent.length}`,
  });

  if (TARGET_MASTER_EMAIL && TARGET_MASTER_PASSWORD && ANON_KEY) {
    const loginRes = await login(TARGET_MASTER_EMAIL, TARGET_MASTER_PASSWORD);
    checks.push({
      id: "target_master_login",
      status: loginRes.ok ? PASS : FAIL,
      detail: loginRes.ok
        ? "login da conta alvo validado"
        : `login falhou (${loginRes.status})`,
    });
  } else if (TARGET_MASTER_EMAIL || TARGET_MASTER_PASSWORD) {
    checks.push({
      id: "target_master_login",
      status: WARN,
      detail: "credenciais incompletas para validar login da conta alvo",
    });
  }

  console.log("\n=== Governance Health Check ===");
  console.log(`tenant_id: ${tenantId}`);
  checks.forEach((item) => {
    console.log(`- [${item.status}] ${item.id}: ${item.detail}`);
  });

  const hasFail = checks.some((item) => item.status === FAIL);
  process.exit(hasFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
