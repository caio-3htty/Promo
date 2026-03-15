import fs from "node:fs";
import path from "node:path";

const PASS = "PASS";
const FAIL = "FAIL";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

const readBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const safeMessage = (payload) => {
  if (!payload) return "Sem detalhes";
  return (
    payload.error_description ||
    payload.message ||
    payload.error ||
    payload.msg ||
    payload.raw ||
    "Erro nao identificado"
  );
};

const mapAuthError = (status, payload) => {
  const normalized = safeMessage(payload).toLowerCase();
  if (normalized.includes("invalid login credentials") || normalized.includes("invalid_grant")) {
    return "Credencial invalida para VALIDATION_LOGIN_EMAIL/VALIDATION_LOGIN_PASSWORD.";
  }
  if (normalized.includes("email not confirmed")) {
    return "E-mail nao confirmado para o usuario de validacao.";
  }
  if (normalized.includes("invalid api key") || status === 401) {
    return "Problema de chave/ambiente (SUPABASE_ANON_KEY ou projeto incorreto).";
  }
  return `Falha de autenticacao (${status}): ${safeMessage(payload)}`;
};

loadDotEnv(path.resolve(process.cwd(), ".env"));

const baseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const loginEmail = process.env.VALIDATION_LOGIN_EMAIL;
const loginPassword = process.env.VALIDATION_LOGIN_PASSWORD;

const results = [];
const addResult = (step, status, detail) => {
  results.push({ step, status, detail });
  console.log(`${step}: ${status} - ${detail}`);
};

if (!baseUrl || !anonKey || !loginEmail || !loginPassword) {
  addResult(
    "env",
    FAIL,
    "Variaveis obrigatorias ausentes. Defina SUPABASE_URL, SUPABASE_ANON_KEY, VALIDATION_LOGIN_EMAIL e VALIDATION_LOGIN_PASSWORD.",
  );
  process.exit(1);
}

const anonHeaders = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
};

let hasFailure = false;
let accessToken = null;
let userId = null;
let tenantId = null;

try {
  const connectivity = await fetch(`${baseUrl}/rest/v1/`, {
    method: "GET",
    headers: anonHeaders,
  });
  addResult("connectivity", PASS, `HTTP ${connectivity.status}`);
} catch (error) {
  hasFailure = true;
  addResult("connectivity", FAIL, `Falha de rede: ${String(error)}`);
}

try {
  const authRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      ...anonHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: loginEmail,
      password: loginPassword,
    }),
  });
  const authPayload = await readBody(authRes);

  if (authRes.status === 200 && authPayload?.access_token && authPayload?.user?.id) {
    accessToken = authPayload.access_token;
    userId = authPayload.user.id;
    addResult("auth", PASS, "Login realizado com sucesso.");
  } else {
    hasFailure = true;
    addResult("auth", FAIL, mapAuthError(authRes.status, authPayload));
  }
} catch (error) {
  hasFailure = true;
  addResult("auth", FAIL, `Falha inesperada de autenticacao: ${String(error)}`);
}

if (!hasFailure && accessToken && userId) {
  try {
    const profileRes = await fetch(
      `${baseUrl}/rest/v1/profiles?select=user_id,tenant_id,is_active,full_name,email&user_id=eq.${encodeURIComponent(
        userId,
      )}&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    const profilePayload = await readBody(profileRes);

    if (profileRes.status !== 200) {
      hasFailure = true;
      addResult("profile", FAIL, `Falha ao ler profile (${profileRes.status}): ${safeMessage(profilePayload)}`);
    } else if (!Array.isArray(profilePayload) || profilePayload.length === 0) {
      hasFailure = true;
      addResult("profile", FAIL, "Usuario autenticado sem profile/tenant vinculado.");
    } else {
      const profile = profilePayload[0];
      if (!profile.tenant_id) {
        hasFailure = true;
        addResult("profile", FAIL, "Usuario sem tenant_id no profile.");
      } else if (!profile.is_active) {
        hasFailure = true;
        addResult("profile", FAIL, "Usuario autenticado esta inativo.");
      } else {
        tenantId = profile.tenant_id;
        addResult("profile", PASS, "Profile ativo e tenant vinculado.");
      }
    }
  } catch (error) {
    hasFailure = true;
    addResult("profile", FAIL, `Falha inesperada: ${String(error)}`);
  }
}

if (!hasFailure && accessToken && tenantId) {
  try {
    const obrasRes = await fetch(
      `${baseUrl}/rest/v1/obras?select=id,name,tenant_id&tenant_id=eq.${encodeURIComponent(tenantId)}&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    const obrasPayload = await readBody(obrasRes);

    if (obrasRes.status === 200) {
      const rows = Array.isArray(obrasPayload) ? obrasPayload.length : 0;
      addResult("read", PASS, `Leitura de obras concluida (rows=${rows}).`);
    } else {
      hasFailure = true;
      addResult("read", FAIL, `Falha ao ler obras (${obrasRes.status}): ${safeMessage(obrasPayload)}`);
    }
  } catch (error) {
    hasFailure = true;
    addResult("read", FAIL, `Falha inesperada: ${String(error)}`);
  }
}

if (!hasFailure && accessToken) {
  try {
    const functionRes = await fetch(`${baseUrl}/functions/v1/account-access-request`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "get_request",
        token: "00000000-0000-0000-0000-000000000000",
      }),
    });

    const functionPayload = await readBody(functionRes);
    if ([200, 404, 409].includes(functionRes.status)) {
      addResult("edge_function", PASS, `account-access-request respondeu HTTP ${functionRes.status}.`);
    } else {
      hasFailure = true;
      addResult(
        "edge_function",
        FAIL,
        `Falha de invocacao (${functionRes.status}): ${safeMessage(functionPayload)}`,
      );
    }
  } catch (error) {
    hasFailure = true;
    addResult("edge_function", FAIL, `Falha inesperada: ${String(error)}`);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  pass: results.filter((item) => item.status === PASS).length,
  fail: results.filter((item) => item.status === FAIL).length,
  steps: results,
};
console.log(`summary: ${JSON.stringify(summary)}`);

process.exit(hasFailure ? 1 : 0);
