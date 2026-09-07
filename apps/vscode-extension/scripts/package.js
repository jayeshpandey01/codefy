#!/usr/bin/env node
"use strict";

/**
 * Packaging pipeline for a single-platform .vsix:
 *   1. `pnpm deploy --filter @whoami/vscode-extension --prod out/deploy`
 *      (run from the repo root) -- materializes a real, non-symlinked
 *      node_modules tree at <repoRoot>/out/deploy, because @ast-grep/napi's
 *      platform optionalDependencies and vsce's own packaging step don't
 *      understand pnpm's symlinked store layout.
 *   2. scripts/prune-native.js strips every @ast-grep/napi-<platform>
 *      folder except the target's, out of that deployed tree.
 *   3. `vsce package --target <target> --no-dependencies` run from inside
 *      <repoRoot>/out/deploy, writing the .vsix to <repoRoot>/dist-vsix/
 *      (equivalent to the documented `-o ../../dist-vsix/` relative form
 *      when vsce is invoked with cwd=out/deploy).
 *
 * Usage: node scripts/package.js <target>   e.g. win32-x64
 */

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/package.js <target>   e.g. win32-x64");
  process.exitCode = 1;
  return;
}

function run(command, args, options) {
  console.log(`[package] $ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    ...options,
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

const deployDirRelative = path.join("out", "deploy");
const deployDir = path.join(repoRoot, deployDirRelative);
const vsixOutDir = path.join(repoRoot, "dist-vsix");

console.log(`[package] deploying @whoami/vscode-extension -> ${deployDir}`);
run(
  "pnpm",
  [
    "deploy",
    "--filter",
    "@whoami/vscode-extension",
    "--prod",
    deployDirRelative,
  ],
  {
    cwd: repoRoot,
  },
);

console.log(
  `[package] pruning @ast-grep/napi platform packages for "${target}"`,
);
run("node", [
  path.join(appRoot, "scripts", "prune-native.js"),
  target,
  deployDir,
]);

console.log(`[package] vsce package --target ${target}`);
run(
  "npx",
  [
    "vsce",
    "package",
    "--target",
    target,
    "--no-dependencies",
    "-o",
    vsixOutDir,
  ],
  {
    cwd: deployDir,
  },
);

console.log(`[package] done -- .vsix written under ${vsixOutDir}`);
