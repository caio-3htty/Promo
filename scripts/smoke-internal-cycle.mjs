#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PASS = "PASS";
const FAIL = "FAIL";

const STEPS = [
  {
    id: "smoke_web_signup",
    label: "Signup web (conta limpa + aprovacao)",
    command: "npm run smoke:web:signup",
  },
  {
    id: "smoke_rbac",
    label: "RBAC interno (materiais + estoque + notificacoes)",
    command: "npm run smoke:rbac",
  },
  {
    id: "alerts_dispatch_dry",
    label: "Alertas dry-run",
    command: "npm run alerts:dispatch:dry",
  },
];

const runCommand = (command) => {
  const startedAt = new Date();
  const result = spawnSync(command, {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1024 * 1024 * 50,
  });
  const endedAt = new Date();

  return {
    ok: result.status === 0,
    code: typeof result.status === "number" ? result.status : -1,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

const summarizeFailure = (stderr, stdout) => {
  const lines = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "falha sem detalhes";
  return lines[lines.length - 1].slice(0, 240);
};

const formatDuration = (ms) => `${(ms / 1000).toFixed(1)}s`;

const buildReport = (results, generatedAt) => {
  const failCount = results.filter((item) => item.status === FAIL).length;
  const passCount = results.length - failCount;
  const lines = [];

  lines.push(`# Validacao interna: materiais + conta limpa + notificacoes (${generatedAt.slice(0, 10)})`);
  lines.push("");
  lines.push(`- Gerado em: \`${generatedAt}\``);
  lines.push(`- Ambiente: producao isolada (smoke write com cleanup)`);
  lines.push(`- Resultado geral: **${failCount === 0 ? PASS : FAIL}**`);
  lines.push("");
  lines.push("| Etapa | Comando | Status | Duracao | Causa-raiz (se FAIL) |");
  lines.push("| --- | --- | --- | ---: | --- |");
  for (const item of results) {
    lines.push(
      `| ${item.label} | \`${item.command}\` | ${item.status} | ${formatDuration(item.durationMs)} | ${
        item.failureReason || "-"
      } |`,
    );
  }
  lines.push("");
  lines.push("## Resumo");
  lines.push(`- PASS: ${passCount}`);
  lines.push(`- FAIL: ${failCount}`);
  lines.push("");
  lines.push("## Pendencias");
  lines.push(
    failCount === 0
      ? "- Nenhuma pendencia bloqueante neste ciclo."
      : "- Revisar causas-raiz acima e aplicar loop de correcao imediata (reteste alvo + rodada completa).",
  );
  lines.push("");

  return lines.join("\n");
};

const main = () => {
  const generatedAt = new Date().toISOString();
  const reportDate = generatedAt.slice(0, 10);
  const reportDir = path.join(process.cwd(), "docs", "reports");
  const reportPath = path.join(
    reportDir,
    `validacao-interna-materiais-notificacoes-${reportDate}.md`,
  );

  const results = [];

  for (const step of STEPS) {
    console.log(`\n[internal-cycle] ${step.label}`);
    console.log(`command: ${step.command}`);
    const out = runCommand(step.command);
    const status = out.ok ? PASS : FAIL;
    const failureReason = out.ok ? "" : summarizeFailure(out.stderr, out.stdout);
    console.log(`status: ${status} | exit: ${out.code} | duration: ${formatDuration(out.durationMs)}`);
    if (!out.ok) {
      console.log(`failure: ${failureReason}`);
    }
    results.push({
      id: step.id,
      label: step.label,
      command: step.command,
      status,
      exitCode: out.code,
      durationMs: out.durationMs,
      startedAt: out.startedAt,
      endedAt: out.endedAt,
      failureReason,
    });
  }

  fs.mkdirSync(reportDir, { recursive: true });
  const report = buildReport(results, generatedAt);
  fs.writeFileSync(reportPath, report, "utf8");
  console.log(`\nreport: ${reportPath}`);

  const failed = results.some((item) => item.status === FAIL);
  process.exit(failed ? 1 : 0);
};

main();
