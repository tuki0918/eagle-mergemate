import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const distributableFiles = [
  "manifest.json",
  "logo.png",
  "web/index.html",
  "web/styles.css",
  "web/app.js",
  "web/align-worker.js",
  "src/index.js",
  "src/core.js",
  "src/web-utils.js",
];

for (const file of distributableFiles) {
  if (!existsSync(join(root, file))) {
    throw new Error(`Missing distributable file: ${file}`);
  }
}

rmSync(dist, { recursive: true, force: true });

for (const file of distributableFiles) {
  const destination = join(dist, file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, file), destination);
}

console.log(`Built dist/ with ${distributableFiles.length} plugin files.`);
