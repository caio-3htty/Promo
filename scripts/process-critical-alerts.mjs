#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

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

loadDotEnv(path.resolve(process.cwd(), ".env"));

const REQUIRED_KEYS = ["SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY"];
const missingKeys = REQUIRED_KEYS.filter((key) => !process.env[key]);
if (missingKeys.length > 0) {
  console.error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  process.exit(1);
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_ID = process.env.SUPABASE_TENANT_ID || null;
const FALLBACK_EMAIL = process.env.CRITICAL_ALERT_FALLBACK_EMAIL || null;
const DRY_RUN = process.argv.includes("--dry-run");
const BASE_URL = `https://${PROJECT_REF}.supabase.co`;

const jsonHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

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

async function rpc(name, payload) {
  return requestJson(`${BASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload ?? {}),
  });
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const email = row.engineer_email || FALLBACK_EMAIL;
    if (!email) continue;
    const key = `${row.notificacao_id}:${email.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, { ...row, target_email: email });
    }
  }
  return [...map.values()];
}

async function sendCriticalEmail(notificationId, to, title) {
  const subject = `[PRUMO][CRITICO] ${title}`;
  return requestJson(`${BASE_URL}/functions/v1/critical-email`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      notificationId,
      to,
      subject,
    }),
  });
}

async function main() {
  const cycle = await rpc("executar_ciclo_notificacoes", { _tenant_id: TENANT_ID });
  if (!cycle.ok) {
    throw new Error(`executar_ciclo_notificacoes failed: ${cycle.status} ${JSON.stringify(cycle.data)}`);
  }

  const pending = await rpc("pending_critical_notification_emails", {
    _tenant_id: TENANT_ID,
    _limit: 100,
  });
  if (!pending.ok) {
    throw new Error(`pending_critical_notification_emails failed: ${pending.status} ${JSON.stringify(pending.data)}`);
  }

  const rows = dedupeRows(Array.isArray(pending.data) ? pending.data : []);
  const report = [];

  for (const row of rows) {
    if (DRY_RUN) {
      report.push({
        notificationId: row.notificacao_id,
        to: row.target_email,
        ok: true,
        mode: "dry-run",
      });
      continue;
    }

    const sent = await sendCriticalEmail(row.notificacao_id, row.target_email, row.titulo);
    report.push({
      notificationId: row.notificacao_id,
      to: row.target_email,
      ok: sent.ok,
      status: sent.status,
      detail: sent.data,
    });
  }

  const ok = report.filter((row) => row.ok).length;
  const fail = report.length - ok;

  console.log("\n=== Notification Cycle Report ===");
  console.log(JSON.stringify(cycle.data, null, 2));
  console.log(`Pending critical deliveries: ${rows.length}`);

  for (const row of report) {
    const state = row.ok ? "PASS" : "FAIL";
    console.log(`${state} ${row.notificationId} -> ${row.to}`);
    if (!row.ok && row.detail) {
      console.log(`  ${JSON.stringify(row.detail)}`);
    }
  }

  console.log(`\nSummary: ${ok}/${report.length} sent, ${fail} failed`);

  if (fail > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
