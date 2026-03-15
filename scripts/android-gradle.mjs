import { spawnSync } from "node:child_process";
import { join } from "node:path";

const androidDir = join(process.cwd(), "promo_APP_Android");
const gradleWrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const tasks = process.argv.slice(2);

if (!tasks.length) {
  console.error("Informe ao menos uma task Gradle. Ex.: node scripts/android-gradle.mjs assembleDebug");
  process.exit(1);
}

const result = spawnSync(gradleWrapper, tasks, {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
