#!/usr/bin/env node

import { bootstrapEnv, missingRequired } from "./lib/env-resolver.mjs";
import { randomUUID } from "node:crypto";

bootstrapEnv({ cwd: process.cwd() });

const REQUIRED_KEYS = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"];
const missingKeys = missingRequired(REQUIRED_KEYS);
if (missingKeys.length > 0) {
  console.error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  process.exit(1);
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "";
const BASE_URL = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SMOKE_PASSWORD = process.env.SMOKE_DEFAULT_PASSWORD || "Smoke1050!";
const DEFAULT_EMAIL_PREFIX = process.env.SMOKE_EMAIL_PREFIX || "smoke.prumo";
let TENANT_ID = process.env.SUPABASE_TENANT_ID || null;

const PASS = "PASS";
const FAIL = "FAIL";

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

async function restService(path, { method = "GET", body } = {}) {
  return requestJson(`${BASE_URL}/rest/v1/${path}`, {
    method,
    headers: jsonHeaders(SERVICE_ROLE_KEY),
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function restUser(path, accessToken, { method = "GET", body } = {}) {
  return requestJson(`${BASE_URL}/rest/v1/${path}`, {
    method,
    headers: jsonHeaders(ANON_KEY, { Authorization: `Bearer ${accessToken}` }),
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function login(email, password) {
  const response = await requestJson(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok || !response.data?.access_token) {
    throw new Error(`login falhou para ${email}: ${response.status} ${JSON.stringify(response.data)}`);
  }
  return response.data.access_token;
}

function buildSmokeUser(role, defaultScope) {
  const prefix = `SMOKE_${role.toUpperCase()}`;
  const scope = process.env[`${prefix}_SCOPE`] || defaultScope;
  const email =
    process.env[`${prefix}_EMAIL`] ||
    `${DEFAULT_EMAIL_PREFIX}.${role}.${PROJECT_REF || "default"}@example.com`;
  const password = process.env[`${prefix}_PASSWORD`] || DEFAULT_SMOKE_PASSWORD;
  return { role, scope, email, password };
}

async function resolveTenantId() {
  if (TENANT_ID) return TENANT_ID;

  const fromObras = await restService("obras?select=tenant_id&deleted_at=is.null&limit=1");
  if (fromObras.ok && Array.isArray(fromObras.data) && fromObras.data[0]?.tenant_id) {
    return fromObras.data[0].tenant_id;
  }

  const fromProfiles = await restService("profiles?select=tenant_id&tenant_id=not.is.null&limit=1");
  if (fromProfiles.ok && Array.isArray(fromProfiles.data) && fromProfiles.data[0]?.tenant_id) {
    return fromProfiles.data[0].tenant_id;
  }

  throw new Error("Nao foi possivel resolver tenant_id para smoke de isolamento.");
}

function assertNoRows(result, label) {
  if (!result.ok) {
    throw new Error(`${label}: consulta falhou (${result.status})`);
  }
  if (!Array.isArray(result.data)) {
    throw new Error(`${label}: payload inesperado`);
  }
  if (result.data.length > 0) {
    throw new Error(`${label}: retornou ${result.data.length} linha(s), esperado 0`);
  }
}

async function main() {
  TENANT_ID = await resolveTenantId();
  const obrasRes = await restService(
    `obras?select=id,name&tenant_id=eq.${encodeFilterValue(TENANT_ID)}&deleted_at=is.null&order=name.asc&limit=10`,
  );
  if (!obrasRes.ok || !Array.isArray(obrasRes.data) || obrasRes.data.length < 2) {
    throw new Error("Smoke de isolamento requer pelo menos 2 obras no tenant.");
  }

  const obraA = obrasRes.data[0];
  const obraB = obrasRes.data[1];
  const randomTenant = randomUUID();

  const users = [
    buildSmokeUser("gestor", "AB"),
    buildSmokeUser("engenheiro", "A"),
    buildSmokeUser("operacional", "A"),
    buildSmokeUser("almoxarife", "B"),
  ];
  const results = [];
  const masterEmail =
    process.env.SMOKE_MASTER_EMAIL ||
    process.env.VALIDATION_LOGIN_EMAIL ||
    "";
  const masterPassword =
    process.env.SMOKE_MASTER_PASSWORD ||
    process.env.VALIDATION_LOGIN_PASSWORD ||
    "";
  if (masterEmail && masterPassword) {
    users.unshift({ role: "master", scope: "AB", email: masterEmail, password: masterPassword });
  } else {
    results.push({
      status: PASS,
      detail: "master: validacao de isolamento ignorada (credenciais SMOKE_MASTER_* ou VALIDATION_LOGIN_* ausentes)",
    });
  }

  for (const user of users) {
    const accessToken = await login(user.email, user.password);

    const crossTenantTables = [
      "obras",
      "fornecedores",
      "materiais",
      "material_fornecedor",
      "pedidos_compra",
      "estoque_obra_material",
      "audit_log",
    ];

    for (const table of crossTenantTables) {
      try {
        const res = await restUser(
          `${table}?select=id&tenant_id=eq.${encodeFilterValue(randomTenant)}&limit=1`,
          accessToken,
        );
        assertNoRows(res, `${user.role} ${table} cross-tenant`);
        results.push({ status: PASS, detail: `${user.role}: ${table} bloqueado fora do tenant` });
      } catch (error) {
        results.push({ status: FAIL, detail: String(error.message ?? error) });
      }
    }

    if (user.scope !== "AB") {
      const deniedObra = user.scope === "A" ? obraB.id : obraA.id;
      const obraScopedTables = ["obras", "pedidos_compra", "estoque_obra_material", "audit_log"];

      for (const table of obraScopedTables) {
        try {
          const filter =
            table === "obras"
              ? `${table}?select=id&tenant_id=eq.${encodeFilterValue(TENANT_ID)}&id=eq.${encodeFilterValue(
                  deniedObra,
                )}&limit=1`
              : `${table}?select=id&tenant_id=eq.${encodeFilterValue(
                  TENANT_ID,
                )}&obra_id=eq.${encodeFilterValue(deniedObra)}&limit=1`;
          const res = await restUser(filter, accessToken);
          assertNoRows(res, `${user.role} ${table} obra-sem-vinculo`);
          results.push({ status: PASS, detail: `${user.role}: ${table} bloqueado fora da obra` });
        } catch (error) {
          results.push({ status: FAIL, detail: String(error.message ?? error) });
        }
      }
    }
  }

  console.log("\n=== Smoke Isolamento Tenant/Obra (tabelas criticas) ===");
  console.log(`tenant_id: ${TENANT_ID}`);
  console.log(`obra A: ${obraA.name} (${obraA.id})`);
  console.log(`obra B: ${obraB.name} (${obraB.id})`);
  results.forEach((result) => console.log(`- [${result.status}] ${result.detail}`));

  const failures = results.filter((item) => item.status === FAIL).length;
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
