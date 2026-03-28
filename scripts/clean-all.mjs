import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workspaceRoot = process.cwd();

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: workspaceRoot,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const runCleanIfPresent = (relativeDir) => {
  const targetDir = resolve(workspaceRoot, relativeDir);
  if (!existsSync(targetDir)) {
    console.log(`skip ${relativeDir} (not found)`);
    return;
  }
  console.log(`clean ${relativeDir}`);
  run("npm", ["--prefix", relativeDir, "run", "clean", "--if-present"]);
};

run("npm", ["run", "clean"]);

[
  "promo_APP_Web",
  "promo_APP_OwnerWindows",
  "promo_APP_Windows",
  "promo_APP_Linux",
].forEach(runCleanIfPresent);

if (existsSync(join(workspaceRoot, "promo_APP_Android"))) {
  run("node", ["scripts/clean-android-native.mjs"]);
} else {
  console.log("skip promo_APP_Android (not found)");
}

console.log("Workspace clean:all completed.");
