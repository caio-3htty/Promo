import { spawnSync } from "node:child_process";

const PASS = "PASS";
const FAIL = "FAIL";

const STEPS = [
  {
    id: "web_rbac_unit",
    label: "Web RBAC policy tests",
    command: "npm --prefix promo_APP_Web run test -- --run src/test/rbac.test.ts",
  },
  {
    id: "web_routes_build",
    label: "Web production build smoke",
    command: "npm --prefix promo_APP_Web run build",
  },
  {
    id: "persona_access_login",
    label: "Persona login/access validation",
    command: "npm run supabase:validate:access",
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
  for (const step of STEPS) {
    console.log(`\n[wave3:web] ${step.label}`);
    console.log(`command: ${step.command}`);
    const out = run(step.command);
    const status = out.ok ? PASS : FAIL;
    console.log(`status: ${status} | exit: ${out.code} | duration_ms: ${out.durationMs}`);
    if (!out.ok) {
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(`Wave3 web persona failed (${failures}/${STEPS.length}).`);
    process.exit(1);
  }

  console.log(`Wave3 web persona passed (${STEPS.length}/${STEPS.length}).`);
}

main();
