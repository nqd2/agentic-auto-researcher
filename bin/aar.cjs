#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const entry = path.join(__dirname, "..", "dist", "cli.js");

if (!existsSync(entry)) {
  console.error(
    "AAR CLI is not built yet. Run `npm run build` before using this package.",
  );
  process.exit(1);
}

const bunCandidates = process.platform === "win32" ? ["bun"] : ["bun"];

let result;
for (const bunCmd of bunCandidates) {
  result = spawnSync(bunCmd, [entry, ...process.argv.slice(2)], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === "win32",
  });
  if (!result.error || result.error.code !== "ENOENT") break;
}

if (result?.error && result.error.code === "ENOENT") {
  console.error(
    "Bun is required to run this package. Install Bun first: https://bun.sh",
  );
  process.exit(1);
}

if (result?.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result?.status ?? 0);
