import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const targetDir = path.resolve(projectRoot, "web-dist");

function resolveWebDistDir() {
  const webClientCandidates = [
    process.env.PROMO_APP_WEB_DIR,
    path.resolve(projectRoot, "..", "promo_APP_Web"),
    path.resolve(projectRoot, "promo_APP_Web"),
  ].filter(Boolean);

  for (const candidate of webClientCandidates) {
    const distPath = path.join(candidate, "dist");
    if (fs.existsSync(distPath)) {
      return distPath;
    }
  }

  return path.resolve(projectRoot, "..", "promo_APP_Web", "dist");
}

const sourceDir = resolveWebDistDir();

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Web build not found at ${sourceDir}. Run build:web:embedded first.`);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Synced web dist: ${sourceDir} -> ${targetDir}`);

