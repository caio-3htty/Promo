import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PASS = "PASS";
const FAIL = "FAIL";

const STEPS = [
  {
    id: "windows_prepare",
    label: "Windows shell prepare web",
    command: "npm --prefix promo_APP_Windows run desktop:prepare:web",
    artifact: "promo_APP_Windows/web-dist/index.html",
  },
  {
    id: "owner_build",
    label: "Owner Windows shell build",
    command: "npm --prefix promo_APP_OwnerWindows run build",
    artifact: "promo_APP_OwnerWindows/dist/index.html",
  },
  {
    id: "linux_prepare",
    label: "Linux shell prepare web",
    command: "npm --prefix promo_APP_Linux run desktop:prepare:web",
    artifact: "promo_APP_Linux/web-dist/index.html",
  },
];

function run(command) {
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd: process.cwd(),
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  return {
    ok: result.status === 0,
    code: typeof result.status === "number" ? result.status : -1,
    durationMs: Date.now() - startedAt,
  };
}

function assertArtifact(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`missing artifact: ${relativePath}`);
  }
}

function main() {
  let failures = 0;

  for (const step of STEPS) {
    console.log(`\n[wave3:desktop] ${step.label}`);
    console.log(`command: ${step.command}`);

    const out = run(step.command);
    if (!out.ok) {
      failures += 1;
      console.log(`status: ${FAIL} | exit: ${out.code} | duration_ms: ${out.durationMs}`);
      continue;
    }

    try {
      assertArtifact(step.artifact);
      console.log(`artifact: ${step.artifact}`);
      console.log(`status: ${PASS} | exit: ${out.code} | duration_ms: ${out.durationMs}`);
    } catch (error) {
      failures += 1;
      console.log(`status: ${FAIL} | exit: ${out.code} | duration_ms: ${out.durationMs}`);
      console.error(String(error.message || error));
    }
  }

  if (failures > 0) {
    console.error(`Wave3 desktop shell smoke failed (${failures}/${STEPS.length}).`);
    process.exit(1);
  }

  console.log(`Wave3 desktop shell smoke passed (${STEPS.length}/${STEPS.length}).`);
}

main();
