#!/usr/bin/env node

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "awkvzbpnihtgceqdwisc";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TENANT_ID = process.env.SUPABASE_TENANT_ID || "11111111-1111-1111-1111-111111111111";

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
  process.exit(1);
}

const BASE_URL = `https://${PROJECT_REF}.supabase.co`;

const testUsers = [
  {
    role: "gestor",
    email: "caiofrossoni+gestor@gmail.com",
    password: "Prumo@2026!Gestor",
    fullName: "Gestor Teste",
    scope: "AB",
  },
  {
    role: "operacional",
    email: "caiofrossoni+operacional@gmail.com",
    password: "Prumo@2026!Oper",
    fullName: "Operacional Teste",
    scope: "A",
  },
  {
    role: "engenheiro",
    email: "caiofrossoni+engenheiro@gmail.com",
    password: "Prumo@2026!Eng",
    fullName: "Engenheiro Teste",
    scope: "A",
  },
  {
    role: "almoxarife",
    email: "caiofrossoni+almoxarife@gmail.com",
    password: "Prumo@2026!Almo",
    fullName: "Almoxarife Teste",
    scope: "B",
  },
];

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

  await check("Gestor lê pedidos das duas obras", async () => {
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

  await check("Operacional cria fornecedor/material/vínculo/pedido na obra A", async () => {
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

  await check("Operacional não lê pedidos da obra B", async () => {
    const token = sessions.operacional.access_token;
    const res = await restUser(
      `pedidos_compra?select=id&obra_id=eq.${encodeFilterValue(obraB.id)}&deleted_at=is.null`,
      token,
    );
    if (!res.ok) throw new Error(`query failed ${res.status}`);
    if ((res.data || []).length > 0) throw new Error(`unexpected rows: ${res.data.length}`);
    return { rows: res.data.length };
  });

  await check("Engenheiro aprova pedido e define código", async () => {
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

  await check("Engenheiro não altera quantidade do pedido", async () => {
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

  await check("Almoxarife não lê pedidos da obra A", async () => {
    const token = sessions.almoxarife.access_token;
    const res = await restUser(
      `pedidos_compra?select=id&obra_id=eq.${encodeFilterValue(obraA.id)}&deleted_at=is.null`,
      token,
    );
    if (!res.ok) throw new Error(`query failed ${res.status}`);
    if ((res.data || []).length > 0) throw new Error(`unexpected rows: ${res.data.length}`);
    return { rows: res.data.length };
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
      throw new Error("almoxarife não conseguiu atualizar pedido da obra B");
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
