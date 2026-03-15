import { bootstrapEnv } from "./lib/env-resolver.mjs";

const PASS = "PASS";
const FAIL = "FAIL";

const readBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const summarizeError = (payload) => {
  if (!payload) return "Sem payload de erro";
  return (
    payload.error_description ||
    payload.message ||
    payload.error ||
    payload.msg ||
    payload.raw ||
    "Erro nao identificado"
  );
};

bootstrapEnv({ cwd: process.cwd() });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const results = [];
const addResult = (step, status, detail) => {
  results.push({ step, status, detail });
  console.log(`${step}: ${status} - ${detail}`);
};

if (!url || !anonKey) {
  addResult(
    "env",
    FAIL,
    "Variaveis ausentes. Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou aliases VITE_*).",
  );
  process.exit(1);
}

const commonHeaders = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
};

let hasFailure = false;

try {
  const connectivityRes = await fetch(`${url}/rest/v1/`, {
    method: "GET",
    headers: commonHeaders,
  });
  addResult("connectivity", PASS, `HTTP ${connectivityRes.status}`);
} catch (error) {
  hasFailure = true;
  addResult("connectivity", FAIL, `Falha de rede: ${String(error)}`);
}

try {
  const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      ...commonHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "healthcheck.invalid@prumo.local",
      password: "invalid-healthcheck-password",
    }),
  });
  const authPayload = await readBody(authRes);

  if (authRes.status === 200 || authRes.status === 400 || authRes.status === 401) {
    addResult("auth", PASS, `HTTP ${authRes.status} (${summarizeError(authPayload)})`);
  } else {
    hasFailure = true;
    addResult("auth", FAIL, `HTTP ${authRes.status} (${summarizeError(authPayload)})`);
  }
} catch (error) {
  hasFailure = true;
  addResult("auth", FAIL, `Falha inesperada: ${String(error)}`);
}

try {
  const readRes = await fetch(`${url}/rest/v1/obras?select=id,tenant_id&limit=1`, {
    method: "GET",
    headers: commonHeaders,
  });
  const readPayload = await readBody(readRes);

  if (readRes.status === 200) {
    const rows = Array.isArray(readPayload) ? readPayload.length : 0;
    addResult("read", PASS, `HTTP 200 (rows=${rows})`);
  } else {
    hasFailure = true;
    addResult("read", FAIL, `HTTP ${readRes.status} (${summarizeError(readPayload)})`);
  }
} catch (error) {
  hasFailure = true;
  addResult("read", FAIL, `Falha inesperada: ${String(error)}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  pass: results.filter((item) => item.status === PASS).length,
  fail: results.filter((item) => item.status === FAIL).length,
  steps: results,
};

console.log(`summary: ${JSON.stringify(summary)}`);
process.exit(hasFailure ? 1 : 0);
