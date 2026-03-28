#!/usr/bin/env node

import { bootstrapEnv, missingRequired } from "./lib/env-resolver.mjs";

bootstrapEnv({ cwd: process.cwd() });
const REQUIRED_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
];

const missingKeys = missingRequired(REQUIRED_KEYS);
if (missingKeys.length > 0) {
  console.error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  process.exit(1);
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
let TENANT_ID = process.env.SUPABASE_TENANT_ID || null;
const BASE_URL = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const DEFAULT_SMOKE_PASSWORD = process.env.SMOKE_DEFAULT_PASSWORD || "Smoke1050!";
const DEFAULT_EMAIL_PREFIX = process.env.SMOKE_EMAIL_PREFIX || "smoke.prumo";

const buildSmokeUser = ({ role, defaultScope }) => {
  const prefix = `SMOKE_${role.toUpperCase()}`;
  const scope = process.env[`${prefix}_SCOPE`] || defaultScope;

  if (!["A", "B", "AB"].includes(scope)) {
    throw new Error(`Invalid scope for ${prefix}_SCOPE. Expected A, B or AB.`);
  }

  const email =
    process.env[`${prefix}_EMAIL`] ||
    `${DEFAULT_EMAIL_PREFIX}.${role}.${PROJECT_REF || "default"}@example.com`;
  const password = process.env[`${prefix}_PASSWORD`] || DEFAULT_SMOKE_PASSWORD;

  return {
    role,
    email,
    password,
    fullName: process.env[`${prefix}_FULL_NAME`] || `${role} smoke`,
    scope,
  };
};

const parseTestUsers = () => {
  if (process.env.SMOKE_USERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.SMOKE_USERS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      throw new Error(`Invalid SMOKE_USERS_JSON: ${error.message}`);
    }
  }

  const requiredUsers = [
    { role: "gestor", scope: process.env.SMOKE_GESTOR_SCOPE || "AB" },
    { role: "operacional", scope: process.env.SMOKE_OPERACIONAL_SCOPE || "A" },
    { role: "engenheiro", scope: process.env.SMOKE_ENGENHEIRO_SCOPE || "A" },
    { role: "almoxarife", scope: process.env.SMOKE_ALMOXARIFE_SCOPE || "B" },
  ];

  return requiredUsers.map((item) => buildSmokeUser({ role: item.role, defaultScope: item.scope }));
};

const testUsers = parseTestUsers();

const jsonHeaders = (token, extra = {}) => ({
  apikey: token,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  ...extra,
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  })() : null;

  return { ok: response.ok, status: response.status, data };
}

function encodeFilterValue(value) {
  return encodeURIComponent(value);
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function adminListUsers() {
  const res = await requestJson(`${BASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    method: "GET",
    headers: jsonHeaders(SERVICE_ROLE_KEY),
  });
  if (!res.ok) throw new Error(`adminListUsers failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.users || [];
}

async function ensureAuthUser(user) {
  const users = await adminListUsers();
  const found = users.find((row) => row.email?.toLowerCase() === user.email.toLowerCase());
  if (found) {
    return found.id;
  }

  const created = await requestJson(`${BASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: jsonHeaders(SERVICE_ROLE_KEY),
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    }),
  });

  if (!created.ok) {
    throw new Error(`ensureAuthUser create failed: ${created.status} ${JSON.stringify(created.data)}`);
  }

  return created.data.id;
}

async function restService(path, { method = "GET", body, prefer, selectSchema } = {}) {
  const headers = jsonHeaders(SERVICE_ROLE_KEY, {});
  if (prefer) headers.Prefer = prefer;
  if (selectSchema) {
    headers["Accept-Profile"] = selectSchema;
    headers["Content-Profile"] = selectSchema;
  }

  return requestJson(`${BASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function resolveTenantId() {
  const diagnostics = [];

  const fromObras = await restService("obras?select=tenant_id&deleted_at=is.null&limit=1");
  if (fromObras.ok && Array.isArray(fromObras.data) && fromObras.data[0]?.tenant_id) {
    return fromObras.data[0].tenant_id;
  }
  diagnostics.push(`obras:${fromObras.status}`);

  const fromProfiles = await restService("profiles?select=tenant_id&tenant_id=not.is.null&limit=1");
  if (fromProfiles.ok && Array.isArray(fromProfiles.data) && fromProfiles.data[0]?.tenant_id) {
    return fromProfiles.data[0].tenant_id;
  }
  diagnostics.push(`profiles:${fromProfiles.status}`);

  throw new Error(
    `Nao foi possivel determinar SUPABASE_TENANT_ID automaticamente (tentativas ${diagnostics.join(", ")}).`
  );
}

async function restUser(path, accessToken, { method = "GET", body, prefer } = {}) {
  const headers = jsonHeaders(ANON_KEY, {
    Authorization: `Bearer ${accessToken}`,
  });
  if (prefer) headers.Prefer = prefer;

  return requestJson(`${BASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function rpcUser(name, accessToken, args = {}) {
  const headers = jsonHeaders(ANON_KEY, {
    Authorization: `Bearer ${accessToken}`,
  });

  return requestJson(`${BASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
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

  if (!response.ok) {
    throw new Error(`login failed for ${email}: ${response.status} ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

async function main() {
  if (!TENANT_ID) {
    TENANT_ID = await resolveTenantId();
  }

  const report = [];

  const obrasRes = await restService(
    `obras?select=id,name&tenant_id=eq.${encodeFilterValue(TENANT_ID)}&deleted_at=is.null&order=name.asc`,
  );
  if (!obrasRes.ok) {
    throw new Error(`Failed to load obras: ${obrasRes.status} ${JSON.stringify(obrasRes.data)}`);
  }

  const obras = obrasRes.data || [];
  if (obras.length < 2) {
    throw new Error("Need at least 2 obras for smoke tests (A/B).");
  }

  const obraA = obras[0];
  const obraB = obras[1];

  const userTypesRes = await restService(
    `user_types?select=id,base_role,name&tenant_id=eq.${encodeFilterValue(TENANT_ID)}`,
  );
  if (!userTypesRes.ok) {
    throw new Error(`Failed to load user_types: ${userTypesRes.status} ${JSON.stringify(userTypesRes.data)}`);
  }

  const typeByRole = (userTypesRes.data || []).reduce((acc, row) => {
    acc[row.base_role] = row.id;
    return acc;
  }, {});

  const provisioned = {};

  for (const user of testUsers) {
    const userId = await ensureAuthUser(user);
    provisioned[user.role] = { ...user, userId };

    const profilePatch = await restService(`profiles?user_id=eq.${encodeFilterValue(userId)}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: {
        full_name: user.fullName,
        email: user.email,
        is_active: true,
        tenant_id: TENANT_ID,
        access_mode: "template",
        preferred_language: "pt-BR",
        user_type_id: typeByRole[user.role] || null,
      },
    });

    if (!profilePatch.ok) {
      throw new Error(`Profile patch failed for ${user.email}: ${profilePatch.status} ${JSON.stringify(profilePatch.data)}`);
    }

    const roleUpsert = await restService("user_roles?on_conflict=user_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [{ user_id: userId, tenant_id: TENANT_ID, role: user.role }],
    });

    if (!roleUpsert.ok) {
      throw new Error(`Role upsert failed for ${user.email}: ${roleUpsert.status} ${JSON.stringify(roleUpsert.data)}`);
    }

    const delLinks = await restService(`user_obras?user_id=eq.${encodeFilterValue(userId)}`, { method: "DELETE" });
    if (!delLinks.ok) {
      throw new Error(`Delete user_obras failed for ${user.email}: ${delLinks.status} ${JSON.stringify(delLinks.data)}`);
    }

    const linkedObras =
      user.scope === "AB"
        ? [obraA.id, obraB.id]
        : user.scope === "A"
          ? [obraA.id]
          : [obraB.id];

    const links = linkedObras.map((obraId) => ({ user_id: userId, obra_id: obraId, tenant_id: TENANT_ID }));
    const linkInsert = await restService("user_obras?on_conflict=user_id,obra_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: links,
    });

    if (!linkInsert.ok) {
      throw new Error(`Insert user_obras failed for ${user.email}: ${linkInsert.status} ${JSON.stringify(linkInsert.data)}`);
    }
  }

  const sessions = {};
  for (const user of testUsers) {
    sessions[user.role] = await login(user.email, user.password);
  }

  const check = async (name, fn) => {
    try {
      const detail = await fn();
      report.push({ name, ok: true, detail });
    } catch (error) {
      report.push({ name, ok: false, detail: String(error.message || error) });
    }
  };

  await check("Gestor le pedidos das duas obras", async () => {
    const token = sessions.gestor.access_token;
    const a = await restUser(
      `pedidos_compra?select=id,obra_id&obra_id=eq.${encodeFilterValue(obraA.id)}&deleted_at=is.null`,
      token,
    );
    const b = await restUser(
      `pedidos_compra?select=id,obra_id&obra_id=eq.${encodeFilterValue(obraB.id)}&deleted_at=is.null`,
      token,
    );

    if (!a.ok || !b.ok) throw new Error(`query failed A=${a.status}, B=${b.status}`);
    return { obraA: a.data.length, obraB: b.data.length };
  });

  let created = {};
  const tag = Date.now();

  await check("Operacional cria fornecedor/material/vinculo/pedido na obra A", async () => {
    const token = sessions.operacional.access_token;
    const cnpj = String(tag).slice(-14).padStart(14, "0");

    const fornecedorRes = await restUser("fornecedores", token, {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        nome: `Fornecedor Smoke ${tag}`,
        cnpj,
        contatos: "smoke@test.local",
        entrega_propria: true,
      },
    });
    if (!fornecedorRes.ok) throw new Error(`fornecedor create failed: ${fornecedorRes.status} ${JSON.stringify(fornecedorRes.data)}`);

    const fornecedorId = fornecedorRes.data[0].id;

    const materialRes = await restUser("materiais", token, {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        nome: `Material Smoke ${tag}`,
        unidade: "un",
        estoque_minimo: 5,
      },
    });
    if (!materialRes.ok) throw new Error(`material create failed: ${materialRes.status} ${JSON.stringify(materialRes.data)}`);

    const materialId = materialRes.data[0].id;

    const mfRes = await restUser("material_fornecedor", token, {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        material_id: materialId,
        fornecedor_id: fornecedorId,
        preco_atual: 15.5,
        pedido_minimo: 2,
        lead_time_dias: 3,
      },
    });
    if (!mfRes.ok) throw new Error(`material_fornecedor create failed: ${mfRes.status} ${JSON.stringify(mfRes.data)}`);

    const pedidoRes = await restUser("pedidos_compra", token, {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        obra_id: obraA.id,
        material_id: materialId,
        fornecedor_id: fornecedorId,
        quantidade: 10,
        preco_unit: 15.5,
        total: 155,
      },
    });
    if (!pedidoRes.ok) throw new Error(`pedido create failed: ${pedidoRes.status} ${JSON.stringify(pedidoRes.data)}`);

    created = {
      fornecedorId,
      materialId,
      pedidoAId: pedidoRes.data[0].id,
    };

    return created;
  });

  await check("Consistencia inicial de materiais e pedido (tenant/obra)", async () => {
    assertCondition(created.fornecedorId && created.materialId && created.pedidoAId, "ids base ausentes");

    const fornecedor = await restService(
      `fornecedores?select=id,tenant_id&tenant_id=eq.${encodeFilterValue(TENANT_ID)}&id=eq.${encodeFilterValue(created.fornecedorId)}&limit=1`,
    );
    const material = await restService(
      `materiais?select=id,tenant_id&tenant_id=eq.${encodeFilterValue(TENANT_ID)}&id=eq.${encodeFilterValue(created.materialId)}&limit=1`,
    );
    const pedido = await restService(
      `pedidos_compra?select=id,tenant_id,obra_id,status,material_id,fornecedor_id&tenant_id=eq.${encodeFilterValue(TENANT_ID)}&id=eq.${encodeFilterValue(created.pedidoAId)}&limit=1`,
    );

    if (!fornecedor.ok || !material.ok || !pedido.ok) {
      throw new Error(
        `consulta de consistencia falhou fornecedor=${fornecedor.status} material=${material.status} pedido=${pedido.status}`,
      );
    }

    assertCondition((fornecedor.data || []).length === 1, "fornecedor inconsistente");
    assertCondition((material.data || []).length === 1, "material inconsistente");
    assertCondition((pedido.data || []).length === 1, "pedido inconsistente");

    const pedidoRow = pedido.data[0];
    assertCondition(pedidoRow.obra_id === obraA.id, "pedido sem obra esperada");
    assertCondition(pedidoRow.material_id === created.materialId, "pedido sem material esperado");
    assertCondition(pedidoRow.fornecedor_id === created.fornecedorId, "pedido sem fornecedor esperado");

    return {
      fornecedorTenantOk: true,
      materialTenantOk: true,
      pedidoTenantObraOk: true,
      statusInicialPedido: pedidoRow.status,
    };
  });

  await check("Operacional define prazos por etapa na obra A", async () => {
    if (!created.pedidoAId) throw new Error("pedidoAId missing");
    const token = sessions.operacional.access_token;

    const now = new Date();
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const in6h = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const in36h = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();

    const res = await restUser("pedido_prazos_etapa?on_conflict=pedido_id", token, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        tenant_id: TENANT_ID,
        obra_id: obraA.id,
        pedido_id: created.pedidoAId,
        prazo_aprovacao_mrv_previsto: in2h,
        prazo_aprovacao_fornecedor_previsto: in6h,
        prazo_producao_previsto: in24h,
        prazo_entrega_previsto: in36h,
        requer_frete_munk: true,
        prazo_agendar_frete_em: in24h,
      },
    });

    if (!res.ok) throw new Error(`prazos upsert failed: ${res.status} ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data) || res.data.length === 0) throw new Error("prazos upsert sem retorno");
    return { id: res.data[0].id, pedido_id: res.data[0].pedido_id };
  });

  await check("Operacional registra orcamento material da obra A", async () => {
    if (!created.materialId) throw new Error("materialId missing");
    const token = sessions.operacional.access_token;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

    const res = await restUser(
      "orcamento_material_obra_periodo?on_conflict=tenant_id,obra_id,material_id,periodo_inicio,periodo_fim",
      token,
      {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          tenant_id: TENANT_ID,
          obra_id: obraA.id,
          material_id: created.materialId,
          periodo_inicio: start.toISOString().slice(0, 10),
          periodo_fim: end.toISOString().slice(0, 10),
          valor_orcado: 1000,
          valor_realizado: 250,
        },
      },
    );

    if (!res.ok) throw new Error(`orcamento upsert failed: ${res.status} ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data) || res.data.length === 0) throw new Error("orcamento upsert sem retorno");
    return { id: res.data[0].id, valor_orcado: res.data[0].valor_orcado };
  });

  await check("Operacional registra incidente de substituicao na obra A", async () => {
    if (!created.pedidoAId || !created.materialId) throw new Error("pedido/material missing");
    const token = sessions.operacional.access_token;
    const res = await restUser("incidentes_substituicao_material", token, {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        obra_id: obraA.id,
        pedido_id: created.pedidoAId,
        material_planejado_id: created.materialId,
        material_substituto_id: created.materialId,
        motivo: "Smoke test substituicao controlada",
        quantidade_planejada: 2,
        quantidade_substituto: 2,
        custo_planejado_unit: 15.5,
        custo_substituto_unit: 16.5,
        necessita_reposicao: false,
      },
    });

    if (!res.ok) throw new Error(`incidente create failed: ${res.status} ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data) || res.data.length !== 1) throw new Error("incidente sem retorno unico");
    return { id: res.data[0].id, status: res.data[0].status };
  });

  await check("Engenheiro nao cria incidente de substituicao", async () => {
    const token = sessions.engenheiro.access_token;
    const res = await restUser("incidentes_substituicao_material", token, {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        obra_id: obraA.id,
        material_planejado_id: created.materialId,
        material_substituto_id: created.materialId,
        motivo: "Teste sem permissao",
        quantidade_planejada: 1,
        quantidade_substituto: 1,
        custo_planejado_unit: 10,
        custo_substituto_unit: 10,
        necessita_reposicao: false,
      },
    });

    if (!res.ok) {
      return { blockedBy: `error:${res.status}` };
    }
    if (Array.isArray(res.data) && res.data.length === 0) {
      return { blockedBy: "rls/no rows" };
    }
    throw new Error("engenheiro conseguiu criar incidente");
  });

  await check("Operacional nao le pedidos da obra B", async () => {
    const token = sessions.operacional.access_token;
    const res = await restUser(
      `pedidos_compra?select=id&obra_id=eq.${encodeFilterValue(obraB.id)}&deleted_at=is.null`,
      token,
    );
    if (!res.ok) throw new Error(`query failed ${res.status}`);
    if ((res.data || []).length > 0) throw new Error(`unexpected rows: ${res.data.length}`);
    return { rows: res.data.length };
  });

  await check("Engenheiro aprova pedido e define codigo", async () => {
    if (!created.pedidoAId) throw new Error("pedidoAId missing");
    const token = sessions.engenheiro.access_token;

    const updateRes = await restUser(`pedidos_compra?id=eq.${encodeFilterValue(created.pedidoAId)}`, token, {
      method: "PATCH",
      prefer: "return=representation",
      body: {
        status: "aprovado",
        codigo_compra: `ENG-${tag}`,
      },
    });

    if (!updateRes.ok) throw new Error(`approve failed: ${updateRes.status} ${JSON.stringify(updateRes.data)}`);
    if (!Array.isArray(updateRes.data) || updateRes.data.length !== 1) {
      throw new Error(`approve affected ${Array.isArray(updateRes.data) ? updateRes.data.length : 0} rows`);
    }

    return { id: updateRes.data[0].id, status: updateRes.data[0].status, codigo: updateRes.data[0].codigo_compra };
  });

  await check("Engenheiro nao altera quantidade do pedido", async () => {
    const token = sessions.engenheiro.access_token;
    const patchRes = await restUser(`pedidos_compra?id=eq.${encodeFilterValue(created.pedidoAId)}`, token, {
      method: "PATCH",
      prefer: "return=representation",
      body: {
        quantidade: 999,
      },
    });

    if (!patchRes.ok) {
      return { blockedBy: `error:${patchRes.status}` };
    }

    if (Array.isArray(patchRes.data) && patchRes.data.length === 0) {
      return { blockedBy: "rls/no rows" };
    }

    throw new Error("engenheiro conseguiu alterar quantidade");
  });

  await check("Preparar alerta para ACK na obra A", async () => {
    const res = await restService("notificacoes", {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        obra_id: obraA.id,
        pedido_id: created.pedidoAId,
        tipo: "smoke_ack",
        severidade: "warning",
        titulo: `Smoke ACK ${tag}`,
        mensagem: "Teste de reconhecimento de alerta no smoke RBAC",
        status: "aberta",
        proxima_repeticao_em: new Date(Date.now() + 3600000).toISOString(),
        escalar_em: new Date(Date.now() + 3600000).toISOString(),
        email_critico_em: new Date(Date.now() + 4 * 3600000).toISOString(),
      },
    });

    if (!res.ok) throw new Error(`create notificacao failed: ${res.status} ${JSON.stringify(res.data)}`);
    created.notificationAId = res.data[0].id;
    return { id: created.notificationAId };
  });

  await check("Engenheiro reconhece alerta da obra A", async () => {
    if (!created.notificationAId) throw new Error("notificationAId missing");
    const token = sessions.engenheiro.access_token;
    const res = await rpcUser("ack_notificacao", token, {
      _notificacao_id: created.notificationAId,
      _nota: "OK smoke",
    });
    if (!res.ok) throw new Error(`ack failed: ${res.status} ${JSON.stringify(res.data)}`);
    return { id: res.data.id, status: res.data.status, ack_em: res.data.ack_em };
  });

  await check("Notificacao ACK consistente com tenant/obra/pedido", async () => {
    if (!created.notificationAId || !created.pedidoAId) {
      throw new Error("notification/pedido id missing");
    }

    const notification = await restService(
      `notificacoes?select=id,status,ack_em,tenant_id,obra_id,pedido_id&tenant_id=eq.${encodeFilterValue(TENANT_ID)}&id=eq.${encodeFilterValue(created.notificationAId)}&limit=1`,
    );
    if (!notification.ok) {
      throw new Error(`consulta notificacao falhou: ${notification.status} ${JSON.stringify(notification.data)}`);
    }
    assertCondition((notification.data || []).length === 1, "notificacao nao encontrada no tenant");
    const row = notification.data[0];
    assertCondition(row.obra_id === obraA.id, "notificacao sem obra esperada");
    assertCondition(row.pedido_id === created.pedidoAId, "notificacao sem pedido esperado");
    assertCondition(row.status === "acknowledged", `status inesperado apos ack: ${row.status}`);
    assertCondition(!!row.ack_em, "ack_em ausente apos reconhecimento");

    return {
      status: row.status,
      ackEmPresent: true,
      tenantScopeOk: true,
    };
  });

  await check("Almoxarife nao le pedidos da obra A", async () => {
    const token = sessions.almoxarife.access_token;
    const res = await restUser(
      `pedidos_compra?select=id&obra_id=eq.${encodeFilterValue(obraA.id)}&deleted_at=is.null`,
      token,
    );
    if (!res.ok) throw new Error(`query failed ${res.status}`);
    if ((res.data || []).length > 0) throw new Error(`unexpected rows: ${res.data.length}`);
    return { rows: res.data.length };
  });

  await check("Almoxarife nao reconhece alerta da obra A", async () => {
    if (!created.notificationAId) throw new Error("notificationAId missing");
    const token = sessions.almoxarife.access_token;
    const res = await rpcUser("ack_notificacao", token, {
      _notificacao_id: created.notificationAId,
      _nota: "nao deve ack",
    });

    if (!res.ok) {
      return { blockedBy: `error:${res.status}` };
    }

    throw new Error("almoxarife conseguiu ack de alerta sem permissao");
  });

  let pedidoBId = null;
  await check("Preparar pedido aprovado na obra B para almoxarife", async () => {
    if (!created.materialId || !created.fornecedorId) {
      throw new Error("material/fornecedor missing");
    }

    const res = await restService("pedidos_compra", {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        obra_id: obraB.id,
        material_id: created.materialId,
        fornecedor_id: created.fornecedorId,
        quantidade: 4,
        preco_unit: 15.5,
        total: 62,
        status: "aprovado",
      },
    });

    if (!res.ok) throw new Error(`create pedido B failed: ${res.status} ${JSON.stringify(res.data)}`);
    pedidoBId = res.data[0].id;
    return { pedidoBId };
  });

  await check("Almoxarife marca pedido da obra B como entregue", async () => {
    const token = sessions.almoxarife.access_token;
    const patchRes = await restUser(`pedidos_compra?id=eq.${encodeFilterValue(pedidoBId)}`, token, {
      method: "PATCH",
      prefer: "return=representation",
      body: {
        status: "entregue",
        codigo_compra: `ALM-${tag}`,
      },
    });

    if (!patchRes.ok) throw new Error(`entrega failed: ${patchRes.status} ${JSON.stringify(patchRes.data)}`);
    if (!Array.isArray(patchRes.data) || patchRes.data.length !== 1) {
      throw new Error("almoxarife nao conseguiu atualizar pedido da obra B");
    }

    return { id: patchRes.data[0].id, status: patchRes.data[0].status };
  });

  await check("Almoxarife atualiza estoque da obra B", async () => {
    const token = sessions.almoxarife.access_token;
    const existing = await restUser(
      `estoque_obra_material?select=id,estoque_atual&obra_id=eq.${encodeFilterValue(obraB.id)}&material_id=eq.${encodeFilterValue(created.materialId)}`,
      token,
    );

    if (!existing.ok) throw new Error(`query estoque failed: ${existing.status} ${JSON.stringify(existing.data)}`);

    if (existing.data.length > 0) {
      const row = existing.data[0];
      const upd = await restUser(`estoque_obra_material?id=eq.${encodeFilterValue(row.id)}`, token, {
        method: "PATCH",
        prefer: "return=representation",
        body: { estoque_atual: Number(row.estoque_atual) + 1 },
      });

      if (!upd.ok) throw new Error(`update estoque failed: ${upd.status} ${JSON.stringify(upd.data)}`);
      return { mode: "update", id: row.id };
    }

    const ins = await restUser("estoque_obra_material", token, {
      method: "POST",
      prefer: "return=representation",
      body: {
        tenant_id: TENANT_ID,
        obra_id: obraB.id,
        material_id: created.materialId,
        estoque_atual: 1,
      },
    });

    if (!ins.ok) throw new Error(`insert estoque failed: ${ins.status} ${JSON.stringify(ins.data)}`);
    return { mode: "insert", id: ins.data[0].id };
  });

  await check("Estoque da obra B consistente apos atualizacao", async () => {
    const token = sessions.almoxarife.access_token;
    const estoque = await restUser(
      `estoque_obra_material?select=id,tenant_id,obra_id,material_id,estoque_atual&tenant_id=eq.${encodeFilterValue(TENANT_ID)}&obra_id=eq.${encodeFilterValue(obraB.id)}&material_id=eq.${encodeFilterValue(created.materialId)}&limit=1`,
      token,
    );

    if (!estoque.ok) throw new Error(`query estoque consistency failed: ${estoque.status}`);
    assertCondition((estoque.data || []).length === 1, "estoque da obra B nao localizado");
    const row = estoque.data[0];
    assertCondition(Number(row.estoque_atual) >= 1, "estoque_atual invalido apos update");
    assertCondition(row.tenant_id === TENANT_ID, "tenant_id inconsistente no estoque");
    assertCondition(row.obra_id === obraB.id, "obra_id inconsistente no estoque");
    assertCondition(row.material_id === created.materialId, "material_id inconsistente no estoque");

    return {
      estoqueAtual: Number(row.estoque_atual),
      tenantScopeOk: true,
    };
  });

  const ok = report.filter((item) => item.ok).length;
  const fail = report.length - ok;

  console.log("\n=== Smoke RBAC Report ===");
  for (const item of report) {
    console.log(`${item.ok ? "PASS" : "FAIL"} - ${item.name}`);
    if (item.detail !== undefined) {
      console.log(`  ${typeof item.detail === "string" ? item.detail : JSON.stringify(item.detail)}`);
    }
  }
  console.log(`\nSummary: ${ok}/${report.length} passed, ${fail} failed`);

  if (fail > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});



