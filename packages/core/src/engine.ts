import type { EngineScanMetrics, Finding, SecretFinding } from "@whoami/types";

import {
  createAstGrepAdapter,
  type IAstGrepAdapter,
} from "./ast-grep/index.js";
import { DeterministicOnlyProvider } from "./llm/deterministic-only.provider.js";
import { OpenRouterTriageProvider } from "./llm/openrouter.provider.js";
import type { ILlmTriageProvider } from "./llm/provider.js";
import { Logger } from "./logging/logger.js";
import { detectSyntaxErrors } from "./parser/syntax-errors.js";
import { getLanguageForFile } from "./parser/wasm-loader.js";
import { ALL_RULES, RULE_METADATA_BY_ID } from "./rules/registry.js";
import { scanForSecrets } from "./secrets/detector.js";
import { buildCandidatePaths } from "./taint/propagate.js";
import { resolveSanitizerStatus } from "./taint/sanitizer-filter.js";
import { getSinkRuleBinding } from "./taint/sinks.js";

export interface CreateAnalysisEngineOptions {
  /** Defaults to OpenRouterTriageProvider when OPENROUTER_API_KEY is set, else DeterministicOnlyProvider. */
  readonly llmProvider?: ILlmTriageProvider;
  /** Optional structured Logger for scan lifecycle tracing and metrics. */
  readonly logger?: Logger;
}

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly secrets: readonly SecretFinding[];
  readonly metrics?: EngineScanMetrics;
}

export interface AnalysisEngine {
  /**
   * Runs multi-language syntax error detection, ast-grep security rules,
   * the taint pipeline, and the secret scanner against one file's source text.
   */
  scanFile(filePath: string, sourceCode: string): Promise<ScanResult>;
}

function resolveDefaultLlmProvider(): ILlmTriageProvider {
  if (process.env["OPENROUTER_API_KEY"]) {
    return new OpenRouterTriageProvider();
  }
  return new DeterministicOnlyProvider();
}

export function createAnalysisEngine(
  options: CreateAnalysisEngineOptions = {},
): AnalysisEngine {
  const llmProvider = options.llmProvider ?? resolveDefaultLlmProvider();
  const logger = options.logger?.child("core-engine");
  const astGrepAdapter: IAstGrepAdapter = createAstGrepAdapter();

  let readyPromise: Promise<void> | undefined;
  async function ensureReady(): Promise<void> {
    if (!readyPromise) {
      readyPromise = Promise.resolve(astGrepAdapter.initialize?.());
    }
    await readyPromise;
  }

  return {
    async scanFile(filePath: string, sourceCode: string): Promise<ScanResult> {
      const scanStartTime = Date.now();
      const scanId = `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const scanLogger = logger?.with({ scanId, filePath });

      scanLogger?.debug("Starting file analysis scan", {
        fileSizeBytes: sourceCode.length,
      });

      await ensureReady();

      const findings: Finding[] = [];
      const createdAt = new Date().toISOString();
      const languageId = getLanguageForFile(filePath);

      let syntaxCheckDurationMs = 0;
      let syntaxErrorsCount = 0;

      if (languageId) {
        const syntaxStartTime = Date.now();
        const syntaxErrors = await detectSyntaxErrors(
          filePath,
          sourceCode,
          languageId,
        );
        syntaxCheckDurationMs = Date.now() - syntaxStartTime;
        syntaxErrorsCount = syntaxErrors.length;
        findings.push(...syntaxErrors);

        if (syntaxErrorsCount > 0) {
          scanLogger?.debug("Syntax errors detected", {
            count: syntaxErrorsCount,
            syntaxCheckDurationMs,
          });
        }
      }

      let astGrepDurationMs = 0;
      let taintDurationMs = 0;

      // Security taint rules (for JS/TS files)
      const isJsTs =
        languageId === "typescript" ||
        languageId === "tsx" ||
        languageId === "javascript";
      if (isJsTs) {
        for (const ruleYaml of ALL_RULES) {
          const matchStart = Date.now();
          const matches = astGrepAdapter.findMatches(sourceCode, ruleYaml);
          astGrepDurationMs += Date.now() - matchStart;

          if (matches.length === 0) continue;

          const ruleId = matches[0]!.ruleId;
          const binding = getSinkRuleBinding(ruleId);
          if (!binding) continue;

          const taintStart = Date.now();
          const candidatePaths = await buildCandidatePaths({
            filePath,
            sourceCode,
            binding,
            matches,
          });

          for (const path of candidatePaths) {
            const status = await resolveSanitizerStatus(path, llmProvider);
            if (status === "discarded") continue;

            const meta = RULE_METADATA_BY_ID[binding.ruleId];

            findings.push({
              id: path.id,
              ruleId: binding.ruleId,
              status,
              severity: binding.severity,
              title: binding.title,
              description: binding.description,
              cwe: binding.cwe,
              ruleYaml: meta?.ruleYaml ?? ruleYaml,
              code: meta?.code ?? binding.ruleId,
              scope: meta?.scope ?? "security",
              reason: meta?.reason,
              hint: meta?.hint,
              fix: meta?.fix,
              link: meta?.link,
              trace: { steps: path.steps, sinkClass: path.sinkClass },
              createdAt,
            });
          }
          taintDurationMs += Date.now() - taintStart;
        }
      }

      const secretStart = Date.now();
      const secrets = scanForSecrets(sourceCode, filePath);
      const secretScanDurationMs = Date.now() - secretStart;

      for (const secret of secrets) {
        const fileBasename = filePath.split(/[/\\]/).pop() || filePath;
        const kindLabel = secret.kind.replace(/-/g, " ");
        findings.push({
          id: `secret-${secret.id}`,
          ruleId: `secret-${secret.kind}`,
          status: "confirmed",
          severity: "critical",
          title: `Hardcoded Secret Detected (${kindLabel})`,
          description: `Detected sensitive credential pattern (${secret.kind}) in ${fileBasename} at line ${secret.line}. Rotate it immediately and move it to environment variables or a secret vault.`,
          cwe: "CWE-798",
          code: `SECRET_${secret.kind.toUpperCase().replace(/-/g, "_")}`,
          scope: "secrets",
          reason: `A plaintext credential (${secret.kind}) was found hardcoded in source code, potentially exposing access to unauthorized parties.`,
          hint: "Rotate this secret immediately, revoke previous credentials, and configure dynamic environment variables or secret management vaults (e.g. AWS Secrets Manager, HashiCorp Vault).",
          fix: `// Move ${secret.kind} to process.env\nconst secret = process.env.API_SECRET_KEY;`,
          trace: {
            sinkClass: "secret-exposure",
            steps: [
              {
                filePath,
                line: secret.line,
                label: `Hardcoded Secret (${secret.kind})`,
                role: "source",
              },
              {
                filePath,
                line: secret.line,
                label: `Exposed Credential Location in ${fileBasename}:${secret.line}`,
                role: "sink",
              },
            ],
          },
          createdAt,
        });
      }

      const totalDurationMs = Date.now() - scanStartTime;

      const metrics: EngineScanMetrics = {
        scanId,
        filePath,
        language: languageId || "unknown",
        fileSizeBytes: sourceCode.length,
        parseDurationMs: 0,
        astGrepDurationMs,
        taintDurationMs,
        secretScanDurationMs,
        syntaxCheckDurationMs,
        totalDurationMs,
        findingsCount: findings.length,
        secretsCount: secrets.length,
        syntaxErrorsCount,
      };

      scanLogger?.info("File analysis scan completed", {
        findingsCount: findings.length,
        secretsCount: secrets.length,
        totalDurationMs,
      });

      return { findings, secrets, metrics };
    },
  };
}
