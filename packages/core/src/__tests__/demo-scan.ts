import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createAnalysisEngine } from "../engine.js";
import type { Finding } from "@whoami/types";

const SCANNABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".css",
  ".json",
  ".html",
  ".yaml",
  ".yml",
]);

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
]);

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...(await collectFiles(fullPath)));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SCANNABLE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function runImaginScan() {
  const targetDir = process.env.SCAN_TARGET_DIR || path.resolve(__dirname, "fixtures");
  console.log(`\n======================================================================`);
  console.log(`🔎 WHOAMI VERCEL-DIAGNOSTIC ENGINE SCAN`);
  console.log(`Target: ${targetDir}`);
  console.log(`======================================================================\n`);

  const engine = createAnalysisEngine();
  const files = await collectFiles(targetDir);
  console.log(`Found ${files.length} scannable files in workspace.\n`);

  const allFindings: Finding[] = [];
  let totalSecrets = 0;

  for (const file of files) {
    try {
      const code = await fs.readFile(file, "utf8");
      const relPath = path.relative(targetDir, file);
      const result = await engine.scanFile(relPath, code);

      for (const f of result.findings) {
        allFindings.push(f);
      }
      totalSecrets += result.secrets.length;
    } catch (err: unknown) {
      // skip unreadable
    }
  }

  console.log(`\n📊 SCAN RESULTS: ${allFindings.length} Issues Detected, ${totalSecrets} Secrets\n`);

  allFindings.forEach((f, idx) => {
    const scope = f.scope || "security";
    const code = f.code || f.ruleId;
    const steps = f.trace.steps;
    const location = steps.length > 0 ? `${steps[steps.length - 1]?.filePath}:${steps[steps.length - 1]?.line}` : "file";

    console.log(`----------------------------------------------------------------------`);
    console.log(`[#${idx + 1}] [${f.severity.toUpperCase()}] [${scope}:${code}] ${f.title}`);
    console.log(`📍 Location: ${location}`);
    if (f.cwe) console.log(`🏷️  CWE:      ${f.cwe}`);

    if (f.reason) {
      console.log(`\n🚨 Root Cause / Reason:`);
      console.log(`   ${f.reason}`);
    }

    if (f.hint) {
      console.log(`\n💡 Actionable Guidance:`);
      console.log(`   ${f.hint}`);
    }

    if (f.fix) {
      console.log(`\n🛠️  Suggested Fix:`);
      console.log(`   ${f.fix.split("\n").join("\n   ")}`);
    }

    if (steps.length > 0) {
      console.log(`\n📈 Taint Flow Graph:`);
      const flowDiagram = steps
        .map((s) => `[${s.role.toUpperCase()}: ${s.label} @ L${s.line}]`)
        .join("\n       │\n       ▼\n   ");
      console.log(`   ${flowDiagram}`);
    }

    if (f.ruleYaml) {
      console.log(`\n📜 Triggered AST Rule Definition (ast-grep YAML):`);
      console.log(`   ${f.ruleYaml.trim().split("\n").join("\n   ")}`);
    }

    if (f.link) {
      console.log(`\n🔗 Documentation / Advisory:`);
      console.log(`   ${f.link}`);
    }
  });

  console.log(`\n======================================================================\n`);
}

runImaginScan().catch(console.error);

