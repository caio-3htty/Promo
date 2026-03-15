import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const androidOnly = args.has("--android");

const errors = [];
const warnings = [];

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
  const major = parseMajor(process.versions.node);
  if (!major || major < 20) {
    errors.push(`Node.js >= 20 e obrigatorio. Atual: ${process.versions.node}`);
  }

  if (!hasCommand("npm", ["--version"])) {
    errors.push("npm nao encontrado no PATH.");
    return;
  }

  const npmVersion = run("npm", ["--version"]).stdout.trim();
  const npmMajor = parseMajor(npmVersion);
  if (!npmMajor || npmMajor < 10) {
    errors.push(`npm >= 10 e obrigatorio. Atual: ${npmVersion || "desconhecido"}`);
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

  if (!javaInPath && !javaFromHome) {
    errors.push("Java nao encontrado no PATH. Defina JAVA_HOME e inclua %JAVA_HOME%\\bin no PATH.");
  }

  if (!process.env.JAVA_HOME) {
    warnings.push("JAVA_HOME nao esta definido. Recomendado configurar para JDK 17+.");
  }

  const sdkDir =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    parseSdkDirFromLocalProperties();

  if (!sdkDir) {
    errors.push(
      "Android SDK nao encontrado. Defina ANDROID_HOME/ANDROID_SDK_ROOT ou crie promo_APP_Android/local.properties com sdk.dir=...",
    );
  }
};

if (!androidOnly) {
  checkNode();
}
checkAndroid();

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

process.exit(errors.length ? 1 : 0);