import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PASS = "PASS";
const FAIL = "FAIL";
const MANUAL = "MANUAL";

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return `run-${stamp}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    date: nowIsoDate(),
    runId: nowRunId(),
    waves: ["wave1", "wave2", "wave4"],
  };

  for (const arg of args) {
    if (arg.startsWith("--date=")) {
      parsed.date = arg.split("=")[1];
    } else if (arg.startsWith("--run-id=")) {
      parsed.runId = arg.split("=")[1];
    } else if (arg.startsWith("--waves=")) {
      parsed.waves = arg
        .split("=")[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return parsed;
}

function runCommand(command, cwd, logPath) {
  const startedAt = new Date();
  const result = spawnSync(command, {
    cwd,
    encoding: "utf8",
    shell: true,
    env: process.env,
    maxBuffer: 1024 * 1024 * 100,
  });
  const endedAt = new Date();

  const parts = [
    `command: ${command}`,
    `cwd: ${cwd}`,
    `started_at: ${startedAt.toISOString()}`,
    `ended_at: ${endedAt.toISOString()}`,
    `exit_code: ${typeof result.status === "number" ? result.status : "null"}`,
    "",
    "===== STDOUT =====",
    result.stdout ?? "",
    "",
    "===== STDERR =====",
    result.stderr ?? "",
  ];
  fs.writeFileSync(logPath, parts.join("\n"), "utf8");

  return {
    status: result.status === 0 ? PASS : FAIL,
    exitCode: typeof result.status === "number" ? result.status : -1,
    durationMs: endedAt.getTime() - startedAt.getTime(),
    logPath,
  };
}

const WAVE_COMMANDS = {
  wave1: [
    {
      id: "cleanup_full_pass",
      label: "Sanidade automatizada full pass",
      command: "npm run cleanup:full-pass",
    },
  ],
  wave2: [
    {
      id: "supabase_test",
      label: "Conectividade e leitura Supabase",
      command: "npm run supabase:test",
    },
    {
      id: "supabase_validate_access",
      label: "Validacao de acesso e sessao",
      command: "npm run supabase:validate:access",
    },
    {
      id: "smoke_rbac",
      label: "Smoke RBAC multi-tenant",
      command: "npm run smoke:rbac",
    },
    {
      id: "smoke_tenant_isolation",
      label: "Isolamento tenant/obra (tabelas criticas)",
      command: "npm run smoke:tenant:isolation",
    },
    {
      id: "governance_health",
      label: "Health check de governanca",
      command: "npm run governance:health",
    },
    {
      id: "alerts_dispatch_dry",
      label: "Dry-run de alertas",
      command: "npm run alerts:dispatch:dry",
    },
  ],
  wave3: [
    {
      id: "wave3_web_persona",
      label: "Regressao web por persona",
      command: "npm run wave3:web:persona",
    },
    {
      id: "wave3_desktop_shell",
      label: "Smoke de abertura desktop shell",
      command: "npm run wave3:desktop:smoke",
    },
    {
      id: "wave3_android_functional",
      label: "Validacao funcional minima Android",
      command: "npm run wave3:android:functional",
    },
  ],
  wave4: [
    {
      id: "web_ci_verify",
      label: "Gate web pre-release",
      command: "npm --prefix promo_APP_Web run ci:verify",
    },
    {
      id: "smoke_rbac_final",
      label: "Smoke RBAC final",
      command: "npm run smoke:rbac",
    },
    {
      id: "alerts_dispatch_dry_final",
      label: "Dry-run de alertas final",
      command: "npm run alerts:dispatch:dry",
    },
  ],
};

function writeManualChecklist(runDir) {
  const wave3Path = path.join(runDir, "wave3-manual-checklist.md");
  const wave4Path = path.join(runDir, "wave4-manual-checklist.md");

  const wave3 = `# Wave 3 - Checklist Manual por Persona

Status inicial: ${MANUAL}

## Personas
- [ ] master
- [ ] gestor
- [ ] operacional
- [ ] almoxarife
- [ ] engenheiro

## Web e Android (cada persona)
- [ ] login/logout
- [ ] acesso apenas as obras vinculadas
- [ ] pedidos (listar/criar/editar conforme permissao)
- [ ] recebimento com codigo_compra obrigatorio
- [ ] estoque (consulta e atualizacao conforme papel)
- [ ] cadastros (fornecedor/material/material x fornecedor)
- [ ] usuarios e acessos (somente perfis autorizados)
- [ ] fluxo sem-acesso quando sem grants

## Desktop e Owner
- [ ] promo_APP_Windows abre e autentica
- [ ] promo_APP_Linux shell carrega web embutido
- [ ] promo_APP_OwnerWindows executa RPCs owner
- [ ] owner sem CRUD operacional direto

## Evidencias
- Screenshots:
- Notas:
- Bugs abertos:
`;

  const wave4 = `# Wave 4 - Itens Manuais de Pre-Release e Rollback

Status inicial: ${MANUAL}

## Pre-release
- [ ] Confirmar CI verde: web-ci, android-native-ci, desktop-ci, owner-windows-ci, linux-ci
- [ ] Validar rotas criticas em homologacao apos build final
- [ ] Revisar riscos residuais e bloqueios

## Rollback drill
- [ ] Executar redeploy da ultima build estavel (teste)
- [ ] Confirmar aplicacao volta operacional
- [ ] Registrar tempo de rollback e impacto

## Evidencias
- Link deploy teste:
- Link rollback:
- Responsavel:
- Observacoes:
`;

  fs.writeFileSync(wave3Path, wave3, "utf8");
  fs.writeFileSync(wave4Path, wave4, "utf8");
}

function toDuration(secondsTotal) {
  const m = Math.floor(secondsTotal / 60);
  const s = Math.round(secondsTotal % 60);
  return `${m}m ${s}s`;
}

function writeSummary(runDir, results, selectedWaves) {
  const jsonPath = path.join(runDir, "summary.json");
  const mdPath = path.join(runDir, "summary.md");

  const total = results.length;
  const passed = results.filter((item) => item.status === PASS).length;
  const failed = results.filter((item) => item.status === FAIL).length;
  const totalSeconds = results.reduce((acc, item) => acc + item.durationMs / 1000, 0);

  const payload = {
    generatedAt: new Date().toISOString(),
    selectedWaves,
    total,
    passed,
    failed,
    results,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const lines = [];
  lines.push("# Resultado Consolidado de Testes");
  lines.push("");
  lines.push(`- Waves executadas: ${selectedWaves.join(", ")}`);
  lines.push(`- Resultado: ${failed === 0 ? PASS : FAIL}`);
  lines.push(`- Pass: ${passed}`);
  lines.push(`- Fail: ${failed}`);
  lines.push(`- Duracao total: ${toDuration(totalSeconds)}`);
  lines.push("");
  lines.push("| Wave | Step | Status | Exit | Duracao(s) | Log |");
  lines.push("| --- | --- | --- | --- | ---: | --- |");
  for (const item of results) {
    const relLog = path
      .relative(runDir, item.logPath)
      .split(path.sep)
      .join("/");
    lines.push(
      `| ${item.wave} | ${item.id} | ${item.status} | ${item.exitCode} | ${(item.durationMs / 1000).toFixed(1)} | [${relLog}](${relLog}) |`,
    );
  }

  lines.push("");
  lines.push("## Contrato de ambiente validado");
  lines.push("- SUPABASE_URL");
  lines.push("- SUPABASE_ANON_KEY");
  lines.push("- SUPABASE_SERVICE_ROLE_KEY");
  lines.push("- RESEND_API_KEY");
  lines.push("- VITE_SUPABASE_URL");
  lines.push("- VITE_SUPABASE_PUBLISHABLE_KEY");
  lines.push("");
  lines.push("## Itens manuais complementares");
  lines.push("- wave4-manual-checklist.md (obrigatorio para pre-release e rollback)");
  lines.push("- wave3-manual-checklist.md (opcional para auditoria de UX por persona)");

  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
}

function appendStatusHistory(rootDir, payload) {
  const historyPath = path.join(rootDir, "docs", "test-runs", "status-history.md");
  const header = [
    "# Historico de Execucoes das Waves",
    "",
    "| Generated At | Date | Run ID | Waves | Result | Pass | Fail |",
    "| --- | --- | --- | --- | --- | ---: | ---: |",
  ];

  const line = `| ${payload.generatedAt} | ${payload.date} | ${payload.runId} | ${payload.waves.join(", ")} | ${payload.result} | ${payload.pass} | ${payload.fail} |`;

  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, [...header, line, ""].join("\n"), "utf8");
    return;
  }

  const current = fs.readFileSync(historyPath, "utf8").trimEnd();
  fs.writeFileSync(historyPath, `${current}\n${line}\n`, "utf8");
}

function main() {
  const { date, runId, waves } = parseArgs();
  const root = process.cwd();
  const runDir = path.join(root, "docs", "test-runs", date, runId);
  ensureDir(runDir);

  const selected = waves.filter((wave) => WAVE_COMMANDS[wave]);
  if (!selected.length) {
    console.error("Nenhuma wave valida selecionada.");
    process.exit(1);
  }

  const results = [];

  for (const wave of selected) {
    const waveDir = path.join(runDir, wave);
    ensureDir(waveDir);

    for (const step of WAVE_COMMANDS[wave]) {
      const logPath = path.join(waveDir, `${step.id}.log`);
      console.log(`[${wave}] ${step.label} -> ${step.command}`);
      const output = runCommand(step.command, root, logPath);
      results.push({
        wave,
        id: step.id,
        label: step.label,
        status: output.status,
        exitCode: output.exitCode,
        durationMs: output.durationMs,
        logPath: output.logPath,
      });
    }
  }

  writeManualChecklist(runDir);
  writeSummary(runDir, results, selected);

  const hasFailure = results.some((item) => item.status === FAIL);
  appendStatusHistory(root, {
    generatedAt: new Date().toISOString(),
    date,
    runId,
    waves: selected,
    result: hasFailure ? FAIL : PASS,
    pass: results.filter((item) => item.status === PASS).length,
    fail: results.filter((item) => item.status === FAIL).length,
  });

  console.log(`Master test run: ${hasFailure ? FAIL : PASS}`);
  console.log(`Summary: ${path.join(runDir, "summary.md")}`);
  process.exit(hasFailure ? 1 : 0);
}

main();
