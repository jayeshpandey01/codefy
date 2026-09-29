#!/usr/bin/env node
"use strict";

/**
 * Single source of truth for the product version is
 * apps/vscode-extension/package.json ("version"). This script copies that
 * value into every other manifest that needs to agree with it:
 *   - packages/types, packages/core, packages/ui, apps/desktop-app package.json
 *   - apps/desktop-app/src-tauri/Cargo.toml [package].version
 *
 * apps/desktop-app/src-tauri/tauri.conf.json does NOT need updating here --
 * its "version" field is set to the path "../package.json", so Tauri reads
 * the desktop app's package.json version directly at build time.
 *
 * Run via `pnpm version:sync` (repo root), typically right before a release
 * build in CI, after release-please has bumped the extension's version.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relPath), "utf8"));
}

function writeJson(relPath, data) {
  writeFileSync(path.join(repoRoot, relPath), JSON.stringify(data, null, 2) + "\n");
}

const sourcePath = "apps/vscode-extension/package.json";
const version = readJson(sourcePath).version;

if (!version) {
  console.error(`[version:sync] could not read "version" from ${sourcePath}`);
  process.exit(1);
}

const targets = [
  "packages/types/package.json",
  "packages/core/package.json",
  "packages/ui/package.json",
  "apps/desktop-app/package.json",
];

for (const relPath of targets) {
  const pkg = readJson(relPath);
  if (pkg.version === version) continue;
  pkg.version = version;
  writeJson(relPath, pkg);
  console.log(`[version:sync] ${relPath} -> ${version}`);
}

const cargoPath = "apps/desktop-app/src-tauri/Cargo.toml";
const cargoAbs = path.join(repoRoot, cargoPath);
const cargoToml = readFileSync(cargoAbs, "utf8");
const cargoVersionLine = /^version = ".*"$/m;

if (!cargoVersionLine.test(cargoToml)) {
  console.error(`[version:sync] could not find a "version = ..." line in ${cargoPath}`);
  process.exit(1);
}

const nextCargoToml = cargoToml.replace(cargoVersionLine, `version = "${version}"`);
if (nextCargoToml !== cargoToml) {
  writeFileSync(cargoAbs, nextCargoToml);
  console.log(`[version:sync] ${cargoPath} -> ${version}`);
}

console.log(`[version:sync] synced ${version}`);
