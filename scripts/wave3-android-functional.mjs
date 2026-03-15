import { spawnSync } from "node:child_process";

const PASS = "PASS";
const FAIL = "FAIL";

const STEPS = [
  {
    id: "android_env_doctor",
    label: "Android environment doctor",
    command: "npm run android:doctor",
  },
  {
    id: "android_data_repo_smoke",
    label: "Android repository smoke",
    command:
      "node scripts/android-gradle.mjs :data:testDebugUnitTest --tests com.prumo.data.RepositorySmokeTest",
  },
  {
    id: "android_auth_vm",
    label: "Android auth ViewModel test",
    command:
      "node scripts/android-gradle.mjs :feature-auth:testDebugUnitTest --tests com.prumo.feature.auth.LoginViewModelTest",
  },
  {
    id: "android_pedidos_validation",
    label: "Android pedidos selection validation",
    command:
      "node scripts/android-gradle.mjs :feature-pedidos:testDebugUnitTest --tests com.prumo.feature.pedidos.PedidoSelectionValidationTest",
  },
  {
    id: "android_estoque_vm",
    label: "Android estoque ViewModel test",
    command:
      "node scripts/android-gradle.mjs :feature-estoque:testDebugUnitTest --tests com.prumo.feature.estoque.EstoqueViewModelTest",
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

function main() {
  let failures = 0;
  let executed = 0;
  for (const step of STEPS) {
    executed += 1;
    console.log(`\n[wave3:android] ${step.label}`);
    console.log(`command: ${step.command}`);
    const out = run(step.command);
    const status = out.ok ? PASS : FAIL;
    console.log(`status: ${status} | exit: ${out.code} | duration_ms: ${out.durationMs}`);
    if (!out.ok) {
      failures += 1;
      break;
    }
  }

  if (failures > 0) {
    console.error(`Wave3 android functional failed (${failures}/${executed}).`);
    process.exit(1);
  }

  console.log(`Wave3 android functional passed (${STEPS.length}/${STEPS.length}).`);
}

main();
