#!/usr/bin/env node
"use strict";

/**
 * Strips every `@ast-grep/napi-<platform>` optionalDependency folder except
 * the one matching the packaging target, out of a deployed node_modules
 * tree (see scripts/package.js). `vsce package --target <platform>` doesn't
 * understand pnpm's node_modules layout well enough to do this pruning
 * itself, so it's done by hand before vsce runs.
 *
 * Usage: node prune-native.js <target> [deployRoot]
 */

const fs = require("node:fs");
const path = require("node:path");

/** vsce/vscode packaging target -> the @ast-grep/napi-* optionalDependency it needs. */
const PLATFORM_PACKAGES = {
  "win32-x64": "@ast-grep/napi-win32-x64-msvc",
  "win32-arm64": "@ast-grep/napi-win32-arm64-msvc",
  "win32-ia32": "@ast-grep/napi-win32-ia32-msvc",
  "darwin-x64": "@ast-grep/napi-darwin-x64",
  "darwin-arm64": "@ast-grep/napi-darwin-arm64",
  "linux-x64": "@ast-grep/napi-linux-x64-gnu",
  "linux-arm64": "@ast-grep/napi-linux-arm64-gnu",
};

function main() {
  const target = process.argv[2];
  const deployRoot = process.argv[3]
    ? path.resolve(process.argv[3])
    : process.cwd();

  const keep = PLATFORM_PACKAGES[target];
  if (!keep) {
    console.error(
      `Usage: node prune-native.js <${Object.keys(PLATFORM_PACKAGES).join("|")}> [deployRoot]`,
    );
    process.exitCode = 1;
    return;
  }

  const scopeDir = path.join(deployRoot, "node_modules", "@ast-grep");
  if (!fs.existsSync(scopeDir)) {
    console.warn(
      `[prune-native] ${scopeDir} does not exist -- nothing to prune.`,
    );
    return;
  }

  let removed = 0;
  for (const entry of fs.readdirSync(scopeDir)) {
    if (!entry.startsWith("napi-")) continue; // leave the main @ast-grep/napi package alone
    const pkgName = `@ast-grep/${entry}`;
    if (pkgName === keep) continue;
    fs.rmSync(path.join(scopeDir, entry), { recursive: true, force: true });
    console.log(`[prune-native] removed ${pkgName}`);
    removed += 1;
  }

  console.log(
    `[prune-native] kept ${keep} for target "${target}" (removed ${removed} other platform package(s))`,
  );
}

main();
