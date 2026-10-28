import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const expectedFiles = [
  "logo.png",
  "manifest.json",
  "src/core.js",
  "src/index.js",
  "src/web-utils.js",
  "web/align-worker.js",
  "web/app.js",
  "web/index.html",
  "web/styles.css",
];

function listFiles(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath, base);
    }
    return [relative(base, entryPath).split(sep).join("/")];
  });
}

test("build writes only the Eagle runtime files to dist", () => {
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "stale.txt"), "stale");

  execFileSync(process.execPath, [join(root, "scripts/build.js")]);

  assert.deepEqual(listFiles(dist).sort(), expectedFiles);
  for (const file of expectedFiles) {
    assert.deepEqual(
      readFileSync(join(dist, file)),
      readFileSync(join(root, file)),
      `${file} should match its source`,
    );
  }
});
