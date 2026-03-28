import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const androidOnly = args.has("--android");
const nodeOnly = args.has("--node-only");

if (androidOnly && nodeOnly) {
  console.error("ERROR: use apenas um modo por vez: --android ou --node-only.");
  process.exit(1);
}

const MIN_NODE_MAJOR = 20;
const MIN_NPM_MAJOR = 10;

const errors = [];
const warnings = [];
const checks = [];

const run = (command, commandArgs = []) => {
  return spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
};

const hasCommand = (command, commandArgs = ["--version"]) => {
  const result = run(command, commandArgs);
  return result.status === 0;
};

const parseMajor = (value) => {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
};

const checkNode = () => {
  const nodeVersion = process.versions.node;
  const nodeMajor = parseMajor(nodeVersion);
  const nodeOk = Boolean(nodeMajor && nodeMajor >= MIN_NODE_MAJOR);
  checks.push({
    label: "Node.js",
    expected: `>= ${MIN_NODE_MAJOR}`,
    current: nodeVersion,
    ok: nodeOk,
  });

  if (!nodeOk) {
    errors.push(`Node.js >= ${MIN_NODE_MAJOR} e obrigatorio. Atual: ${nodeVersion}`);
  }

  if (!hasCommand("npm", ["--version"])) {
    checks.push({
      label: "npm",
      expected: `>= ${MIN_NPM_MAJOR}`,
      current: "nao encontrado",
      ok: false,
    });
    errors.push("npm nao encontrado no PATH.");
    return;
  }

  const npmVersion = run("npm", ["--version"]).stdout.trim();
  const npmMajor = parseMajor(npmVersion);
  const npmOk = Boolean(npmMajor && npmMajor >= MIN_NPM_MAJOR);
  checks.push({
    label: "npm",
    expected: `>= ${MIN_NPM_MAJOR}`,
    current: npmVersion || "desconhecido",
    ok: npmOk,
  });

  if (!npmOk) {
    errors.push(`npm >= ${MIN_NPM_MAJOR} e obrigatorio. Atual: ${npmVersion || "desconhecido"}`);
  }
};

const parseSdkDirFromLocalProperties = () => {
  const file = join(process.cwd(), "promo_APP_Android", "local.properties");
  if (!existsSync(file)) return null;
  const content = readFileSync(file, "utf8");
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("sdk.dir="));
  if (!line) return null;
  return line.replace("sdk.dir=", "").trim().replace(/\\\\/g, "\\");
};

const hasJavaFromHome = () => {
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) return false;

  return (
    existsSync(join(javaHome, "bin", "java.exe")) ||
    existsSync(join(javaHome, "bin", "java"))
  );
};

const checkAndroid = () => {
  const javaInPath = hasCommand("java", ["-version"]);
  const javaFromHome = hasJavaFromHome();
  const javaOk = javaInPath || javaFromHome;
  checks.push({
    label: "Java (JDK 17+)",
    expected: "instalado no PATH ou JAVA_HOME",
    current: javaOk ? "encontrado" : "nao encontrado",
    ok: javaOk,
  });

  if (!javaOk) {
    errors.push("Java nao encontrado no PATH. Defina JAVA_HOME e inclua %JAVA_HOME%\\bin no PATH.");
  }

  if (!process.env.JAVA_HOME) {
    warnings.push("JAVA_HOME nao esta definido. Recomendado configurar para JDK 17+.");
  }

  const sdkDir =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    parseSdkDirFromLocalProperties();

  const sdkOk = Boolean(sdkDir);
  checks.push({
    label: "Android SDK",
    expected: "ANDROID_HOME/ANDROID_SDK_ROOT ou promo_APP_Android/local.properties",
    current: sdkOk ? sdkDir : "nao encontrado",
    ok: sdkOk,
  });

  if (!sdkOk) {
    errors.push(
      "Android SDK nao encontrado. Defina ANDROID_HOME/ANDROID_SDK_ROOT ou crie promo_APP_Android/local.properties com sdk.dir=...",
    );
  }
};

const findWingetNodeCandidates = () => {
  if (process.platform !== "win32") {
    return [];
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return [];
  }

  const wingetPackagesRoot = join(localAppData, "Microsoft", "WinGet", "Packages");
  if (!existsSync(wingetPackagesRoot)) {
    return [];
  }

  const packageDirs = readdirSync(wingetPackagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("OpenJS.NodeJS"))
    .map((entry) => join(wingetPackagesRoot, entry.name));

  const candidates = [];
  for (const packageDir of packageDirs) {
    const innerDirs = readdirSync(packageDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("node-v"))
      .map((entry) => join(packageDir, entry.name));

    for (const candidateDir of innerDirs) {
      const nodeExe = join(candidateDir, "node.exe");
      const npmCmd = join(candidateDir, "npm.cmd");
      if (existsSync(nodeExe) && existsSync(npmCmd)) {
        candidates.push(candidateDir);
      }
    }
  }

  return candidates.sort((a, b) => b.localeCompare(a));
};

const printSummary = (modeLabel) => {
  console.log(`[env:doctor] modo: ${modeLabel}`);
  for (const check of checks) {
    const status = check.ok ? "OK" : "FAIL";
    console.log(`- ${check.label}: ${check.current} (esperado ${check.expected}) => ${status}`);
  }
};

const printFixHints = () => {
  if (!errors.length) {
    return;
  }

  const hasNodeOrNpmError = errors.some((entry) => entry.includes("Node.js") || entry.includes("npm"));
  const hasAndroidError = errors.some((entry) => entry.includes("Java") || entry.includes("Android SDK"));

  console.log("\nAcoes sugeridas:");

  if (hasNodeOrNpmError) {
    if (process.platform === "win32") {
      const wingetCandidates = findWingetNodeCandidates();
      if (wingetCandidates.length) {
        console.log(`- Opcao imediata nesta sessao: $env:PATH=\"${wingetCandidates[0]};$env:PATH\"`);
      }
      console.log("- Instale um version manager: winget install CoreyButler.NVMforWindows");
      console.log("- Instale e use Node 20: nvm install 20 && nvm use 20");
      console.log("- Alternativa sem NVM: winget install OpenJS.NodeJS.20 (requer elevacao).");
      console.log("- Se ainda estiver usando C:\\Program Files\\nodejs, atualize/remova o Node 18 antigo.");
      console.log("- Atualize npm: npm i -g npm@10");
    } else {
      console.log("- Use nvm/fnm/asdf para Node 20 e npm 10.");
    }
    console.log("- Revalide: node -v && npm -v && npm run env:doctor");
  }

  if (hasAndroidError) {
    console.log("- Defina JAVA_HOME para JDK 17+ e inclua JAVA_HOME/bin no PATH.");
    console.log("- Defina ANDROID_HOME/ANDROID_SDK_ROOT ou configure promo_APP_Android/local.properties.");
    console.log("- Revalide: npm run android:doctor");
  }
};

const mode = androidOnly ? "android-only" : nodeOnly ? "node-only" : "full";

if (nodeOnly) {
  checkNode();
} else if (androidOnly) {
  checkAndroid();
} else {
  checkNode();
  checkAndroid();
}

printSummary(mode);

if (!errors.length && !warnings.length) {
  console.log("OK: ambiente validado.");
  process.exit(0);
}

for (const warning of warnings) {
  console.warn(`WARN: ${warning}`);
}
for (const error of errors) {
  console.error(`ERROR: ${error}`);
}

printFixHints();

process.exit(errors.length ? 1 : 0);
