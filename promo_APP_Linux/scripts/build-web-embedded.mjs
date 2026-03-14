import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function resolveWebClientDir() {
  const candidates = [
    process.env.PROMO_APP_WEB_DIR,
    path.resolve(projectRoot, "..", "promo_APP_Web"),
    path.resolve(projectRoot, "promo_APP_Web"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const packageJsonPath = path.join(candidate, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      return candidate;
    }
  }

  throw new Error(
    "Could not locate promo_APP_Web. Set PROMO_APP_WEB_DIR or place repo at ../promo_APP_Web.",
  );
}

const webClientDir = resolveWebClientDir();
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, ["run", "build:embedded"], {
  cwd: webClientDir,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

