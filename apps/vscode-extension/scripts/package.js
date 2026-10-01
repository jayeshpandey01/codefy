#!/usr/bin/env node
"use strict";

/**
 * Packaging pipeline for a single-platform .vsix:
 *   1. `pnpm deploy --filter whoami --prod out/deploy`
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

const target = process.argv[2] && process.argv[2] !== "universal" ? process.argv[2] : null;

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

const fs = require("node:fs");
const deployDirRelative = path.join("out", "deploy");
const deployDir = path.join(repoRoot, deployDirRelative);
const vsixOutDir = path.join(repoRoot, "dist-vsix");

if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true, force: true });
}

console.log(`[package] deploying codefy-whoami -> ${deployDir}`);
run(
  "pnpm",
  [
    "--config.confirm-modules-purge=false",
    "deploy",
    "--filter",
    "codefy-whoami",
    "--prod",
    "--legacy",
    deployDirRelative,
  ],
  {
    cwd: repoRoot,
  },
);

if (target) {
  console.log(
    `[package] pruning @ast-grep/napi platform packages for "${target}"`,
  );
  run("node", [
    path.join(appRoot, "scripts", "prune-native.js"),
    target,
    deployDir,
  ]);
}

// Remove scripts from deploy package.json so vsce doesn't attempt to run dev scripts
const deployPkgJsonPath = path.join(deployDir, "package.json");
if (fs.existsSync(deployPkgJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(deployPkgJsonPath, "utf-8"));
  delete pkg.scripts;
  fs.writeFileSync(deployPkgJsonPath, JSON.stringify(pkg, null, 2), "utf-8");
}

// Ensure icon, license, readme, media are in deployDir
for (const asset of ["icon.png", "README.md", "LICENSE", "media"]) {
  const src = path.join(appRoot, asset);
  const dest = path.join(deployDir, asset);
  if (fs.existsSync(src)) {
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

console.log(`[package] @vscode/vsce package ${target ? `--target ${target}` : "(universal)"}`);
if (!fs.existsSync(vsixOutDir)) {
  fs.mkdirSync(vsixOutDir, { recursive: true });
}

const vsceArgs = [
  "--yes",
  "@vscode/vsce",
  "package",
  "--no-dependencies",
  "-o",
  vsixOutDir,
];
if (target) {
  vsceArgs.push("--target", target);
}

run("npx", vsceArgs, {
  cwd: deployDir,
});

// Copy output vsix to repo root and app directory for easy upload
const files = fs.readdirSync(vsixOutDir).filter(f => f.endsWith(".vsix"));
for (const file of files) {
  const src = path.join(vsixOutDir, file);
  fs.copyFileSync(src, path.join(repoRoot, file));
  fs.copyFileSync(src, path.join(appRoot, file));
  console.log(`[package] copied ${file} -> repo root & apps/vscode-extension/`);
}

console.log(`[package] done -- .vsix written under ${vsixOutDir}`);
