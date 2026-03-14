import fs from "node:fs";
import path from "node:path";

const targets = ["dist", "node_modules", ".cache"];

for (const target of targets) {
  const fullPath = path.resolve(process.cwd(), target);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`Removed ${target}`);
  }
}

console.log("Web cleanup done.");
