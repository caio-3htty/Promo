#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { bootstrapEnv, missingRequired } from "./lib/env-resolver.mjs";

bootstrapEnv({ cwd: process.cwd() });

const writeMode = process.argv.includes("--write");
const PASS = "PASS";
const FAIL = "FAIL";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
if (writeMode) required.push("SUPABASE_SERVICE_ROLE_KEY");

const missing = missingRequired(required);
if (missing.length > 0) {
  console.error(`Variaveis ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

const baseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
const addResult = (step, status, detail) => {
  results.push({ step, status, detail });
  console.log(`${step}: ${status} - ${detail}`);
};

const runNodeScript = (scriptPath) => {
  const result = spawnSync("node", [scriptPath], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
};

const requestJson = async (url, { method = "GET", headers = {}, body } = {}) => {
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { ok: response.ok, status: response.status, data };
};

const restService = (path, options = {}) =>
  requestJson(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

const callFunction = (payload, token = anonKey) =>
  requestJson(`${baseUrl}/functions/v1/account-access-request`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: payload,
  });

const authAdminCreateUser = (email, password, fullName) =>
  requestJson(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    },
  });

const authAdminDeleteUser = (userId) =>
  requestJson(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });

const loginUser = (email, password) =>
  requestJson(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: { email, password },
  });

const runIsolatedWriteSmoke = async () => {
  const now = Date.now();
  const suffix = `${now}-${Math.floor(Math.random() * 1000)}`;
  const tenantId = randomUUID();
  const tenantSlug = `smoke-${suffix}`;
  const tenantName = `Smoke Tenant ${suffix}`;
  const approverEmail = `smoke.approver.${suffix}@example.com`;
  const applicantEmail = `smoke.internal.${suffix}@example.com`;
  const approverPassword = `Smoke#${suffix}`;
  const applicantPassword = `Smoke#${suffix}a`;

  let approverUserId = null;
  let applicantUserId = null;
  let obraId = null;
  let accessRequestId = null;
  let approvalToken = null;
  let userTypeId = null;

  try {
    const tenantInsert = await restService("tenants", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { id: tenantId, name: tenantName, slug: tenantSlug, is_active: true },
    });
    if (!tenantInsert.ok) throw new Error(`tenant insert falhou (${tenantInsert.status})`);

    const obraInsert = await restService("obras", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        tenant_id: tenantId,
        name: `Obra Smoke ${suffix}`,
        status: "ativa",
      },
    });
    if (!obraInsert.ok || !Array.isArray(obraInsert.data) || !obraInsert.data[0]?.id) {
      throw new Error(`obra insert falhou (${obraInsert.status})`);
    }
    obraId = obraInsert.data[0].id;

    const userTypes = await restService(
      `user_types?select=id&tenant_id=eq.${encodeURIComponent(tenantId)}&base_role=eq.operacional&is_active=eq.true&limit=1`,
    );
    if (!userTypes.ok) throw new Error(`user_types select falhou (${userTypes.status})`);
    if (Array.isArray(userTypes.data) && userTypes.data[0]?.id) {
      userTypeId = userTypes.data[0].id;
    } else {
      const userTypeInsert = await restService("user_types", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: {
          tenant_id: tenantId,
          name: `Operacional Smoke ${suffix}`,
          description: "Tipo operacional para smoke test automatizado",
          base_role: "operacional",
          is_active: true,
        },
      });
      if (!userTypeInsert.ok || !Array.isArray(userTypeInsert.data) || !userTypeInsert.data[0]?.id) {
        throw new Error(`user_type insert falhou (${userTypeInsert.status})`);
      }
      userTypeId = userTypeInsert.data[0].id;
    }

    const approverCreate = await authAdminCreateUser(
      approverEmail,
      approverPassword,
      "Aprovador Smoke",
    );
    approverUserId = approverCreate.data?.id ?? approverCreate.data?.user?.id ?? null;
    if (!approverCreate.ok || !approverUserId) {
      throw new Error(`approver create falhou (${approverCreate.status})`);
    }

    const approverProfile = await restService(
      `profiles?user_id=eq.${encodeURIComponent(approverUserId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: {
          full_name: "Aprovador Smoke",
          email: approverEmail,
          tenant_id: tenantId,
          is_active: true,
          access_mode: "template",
        },
      },
    );
    if (!approverProfile.ok) throw new Error(`approver profile falhou (${approverProfile.status})`);

    const approverRole = await restService("user_roles?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: [{ user_id: approverUserId, tenant_id: tenantId, role: "master" }],
    });
    if (!approverRole.ok) throw new Error(`approver role falhou (${approverRole.status})`);

    const registerInternal = await callFunction({
      action: "register_internal",
      email: applicantEmail,
      password: applicantPassword,
      fullName: "Colaborador Smoke",
      username: "colaborador-smoke",
      companyName: tenantName,
      tenantId,
      jobTitle: "Operacional",
      requestedRole: "operacional",
      requestedObraIds: [obraId],
      origin: "https://smoke.prumo.local",
    });
    if (!registerInternal.ok || registerInternal.data?.ok !== true) {
      throw new Error(
        `register_internal falhou (${registerInternal.status}) ${JSON.stringify(registerInternal.data ?? {})}`,
      );
    }

    const requestRow = await restService(
      `access_signup_requests?select=id,approval_token,applicant_user_id&applicant_email=eq.${encodeURIComponent(
        applicantEmail,
      )}&status=eq.pending&limit=1`,
    );
    if (!requestRow.ok || !Array.isArray(requestRow.data) || !requestRow.data[0]?.approval_token) {
      throw new Error(`access request select falhou (${requestRow.status})`);
    }
    accessRequestId = requestRow.data[0].id;
    approvalToken = requestRow.data[0].approval_token;
    applicantUserId = requestRow.data[0].applicant_user_id;

    const reviewRequest = await callFunction({
      action: "review_request",
      token: approvalToken,
      decision: "approve",
      reviewedUsername: "colaborador-smoke",
      reviewedJobTitle: "Operacional",
      reviewedRole: "operacional",
      reviewedObraIds: [obraId],
      reviewNotes: "Aprovado por smoke automatizado.",
    });
    if (!reviewRequest.ok || reviewRequest.data?.ok !== true) {
      throw new Error(
        `review_request falhou (${reviewRequest.status}) ${JSON.stringify(reviewRequest.data ?? {})}`,
      );
    }

    const login = await loginUser(applicantEmail, applicantPassword);
    const accessToken = login.data?.access_token;
    if (!login.ok || !accessToken) {
      throw new Error(`login interno falhou (${login.status})`);
    }

    const profileCheck = await requestJson(
      `${baseUrl}/rest/v1/profiles?select=user_id,is_active,tenant_id,user_type_id&user_id=eq.${encodeURIComponent(
        applicantUserId,
      )}&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (
      !profileCheck.ok ||
      !Array.isArray(profileCheck.data) ||
      !profileCheck.data[0]?.is_active ||
      profileCheck.data[0]?.tenant_id !== tenantId
    ) {
      throw new Error(`profile check falhou (${profileCheck.status})`);
    }

    const obrasCheck = await requestJson(
      `${baseUrl}/rest/v1/user_obras?select=obra_id&user_id=eq.${encodeURIComponent(
        applicantUserId,
      )}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!obrasCheck.ok || !Array.isArray(obrasCheck.data) || obrasCheck.data.length === 0) {
      throw new Error(`user_obras check falhou (${obrasCheck.status})`);
    }

    return {
      tenantId,
      obraId,
      approverUserId,
      applicantUserId,
      accessRequestId,
    };
  } finally {
    if (accessRequestId) {
      await restService(`access_signup_requests?id=eq.${encodeURIComponent(accessRequestId)}`, {
        method: "DELETE",
      });
    }

    if (applicantUserId) {
      await authAdminDeleteUser(applicantUserId);
    }
    if (approverUserId) {
      await authAdminDeleteUser(approverUserId);
    }

    if (obraId) {
      await restService(`obras?id=eq.${encodeURIComponent(obraId)}`, { method: "DELETE" });
    }

    if (userTypeId) {
      await restService(`user_types?id=eq.${encodeURIComponent(userTypeId)}`, { method: "DELETE" });
    }

    await restService(`tenant_settings?tenant_id=eq.${encodeURIComponent(tenantId)}`, {
      method: "DELETE",
    });
    await restService(`tenants?id=eq.${encodeURIComponent(tenantId)}`, { method: "DELETE" });
  }
};

let hasFailure = false;

const readonlyScripts = [
  { step: "supabase:test", path: "scripts/test-supabase.mjs" },
  { step: "supabase:validate:access", path: "scripts/validate-access-login.mjs" },
];

for (const item of readonlyScripts) {
  const exitCode = runNodeScript(item.path);
  if (exitCode === 0) {
    addResult(item.step, PASS, "Execucao concluida com sucesso.");
  } else {
    hasFailure = true;
    addResult(item.step, FAIL, `Falhou com exit code ${exitCode}.`);
  }
}

if (writeMode) {
  try {
    const payload = await runIsolatedWriteSmoke();
    addResult(
      "supabase:smoke:isolated-write",
      PASS,
      `Criacao/aprovacao/login validados em tenant isolado (${payload.tenantId}).`,
    );
  } catch (error) {
    hasFailure = true;
    addResult("supabase:smoke:isolated-write", FAIL, String(error));
  }
} else {
  addResult("supabase:smoke:isolated-write", PASS, "Ignorado (execute com --write para validar escrita).");
}

const summary = {
  generatedAt: new Date().toISOString(),
  pass: results.filter((item) => item.status === PASS).length,
  fail: results.filter((item) => item.status === FAIL).length,
  writeMode,
  steps: results,
};
console.log(`summary: ${JSON.stringify(summary)}`);
process.exit(hasFailure ? 1 : 0);
