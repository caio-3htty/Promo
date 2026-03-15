import { spawnSync } from "node:child_process";

const run = (command, args) =>
  spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

if (process.platform === "linux") {
  const result = run("npm", ["--prefix", "promo_APP_Linux", "run", "desktop:build:linux"]);
  process.exit(result.status ?? 1);
}

console.warn(
  "INFO: Build Linux oficial ocorre no CI Ubuntu. Neste ambiente local, executando apenas desktop:prepare:web.",
);
const result = run("npm", ["--prefix", "promo_APP_Linux", "run", "desktop:prepare:web"]);
process.exit(result.status ?? 1);
