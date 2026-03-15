import fs from "node:fs";
import path from "node:path";

function loadDotEnvFile(filePath) {
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

function parseProjectRefFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).host.toLowerCase();
    if (!host.endsWith(".supabase.co")) return null;
    return host.replace(".supabase.co", "");
  } catch {
    return null;
  }
}

export function bootstrapEnv({
  cwd = process.cwd(),
  defaultProjectRef = "awkvzbpnihtgceqdwisc",
} = {}) {
  const files = [
    path.resolve(cwd, ".env.local"),
    path.resolve(cwd, ".env"),
    path.resolve(cwd, "promo_APP_Web/.env.local"),
    path.resolve(cwd, "promo_APP_Web/.env"),
    path.resolve(cwd, "promo_APP_Android/.env.local"),
    path.resolve(cwd, "promo_APP_Android/.env"),
    path.resolve(cwd, "promo_APP_Windows/.env.local"),
    path.resolve(cwd, "promo_APP_Windows/.env"),
    path.resolve(cwd, "promo_APP_OwnerWindows/.env.local"),
    path.resolve(cwd, "promo_APP_OwnerWindows/.env"),
    path.resolve(cwd, "promo_APP_Linux/.env.local"),
    path.resolve(cwd, "promo_APP_Linux/.env"),
  ];

  for (const file of files) {
    loadDotEnvFile(file);
  }

  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
  if (!process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      "";
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SECRET_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY;
  }

  if (!process.env.SUPABASE_PROJECT_REF) {
    process.env.SUPABASE_PROJECT_REF = parseProjectRefFromUrl(process.env.SUPABASE_URL) || "";
  }

  if (!process.env.SUPABASE_PROJECT_REF && defaultProjectRef) {
    process.env.SUPABASE_PROJECT_REF = defaultProjectRef;
  }

  if (!process.env.SUPABASE_URL && process.env.SUPABASE_PROJECT_REF) {
    process.env.SUPABASE_URL = `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co`;
  }

  return process.env;
}

export function missingRequired(keys) {
  return keys.filter((key) => !process.env[key]);
}

