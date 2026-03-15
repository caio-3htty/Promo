import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const base = join(process.cwd(), "promo_APP_Android");
const targets = [
  ".gradle",
  "app/build",
  "core/build",
  "data/build",
  "feature-auth/build",
  "feature-estoque/build",
  "feature-obras/build",
  "feature-pedidos/build",
];

for (const target of targets) {
  const fullPath = join(base, target);
  if (!existsSync(fullPath)) continue;
  rmSync(fullPath, { recursive: true, force: true });
  console.log(`removed ${fullPath}`);
}
