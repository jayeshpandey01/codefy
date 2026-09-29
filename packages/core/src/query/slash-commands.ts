import type { ChatResult, SlashCommandSpec } from "@whoami/types";
import { SLASH_COMMANDS } from "@whoami/types";

export { SLASH_COMMANDS };
export type { SlashCommandSpec };

export interface ParsedSlashCommand {
  readonly spec: SlashCommandSpec;
  readonly args: string;
}

export interface UnknownSlashCommand {
  readonly unknownCommand: string;
}

/**
 * Recognizes `/command args...` syntax against the canonical
 * `SLASH_COMMANDS` registry (`@whoami/types`). Returns `undefined` for
 * plain-text input (not a slash command at all — the caller should fall
 * through to the normal NLU/RAG pipeline), a `ParsedSlashCommand` for a
 * known command, or an `UnknownSlashCommand` for `/whatever` text that
 * doesn't match anything — the caller must render that honestly (point at
 * `/help`), never forward it into the fuzzy intent classifier, which is
 * exactly the bug this module exists to fix: "/help" and "/vuln <url>" were
 * previously tokenized like any other sentence and could land on
 * EXPLAIN_FINDING by TF-IDF similarity, producing a confusing "Which
 * finding?" reply for input that was never a question about a finding.
 */
export function parseSlashCommand(
  rawQuery: string,
): ParsedSlashCommand | UnknownSlashCommand | undefined {
  const trimmed = rawQuery.trim();
  if (!trimmed.startsWith("/")) return undefined;

  const spaceIdx = trimmed.indexOf(" ");
  const commandToken = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  const spec = SLASH_COMMANDS.find((c) => c.name === commandToken);
  if (!spec) return { unknownCommand: commandToken };
  return { spec, args };
}

function formatCommandLine(spec: SlashCommandSpec): string {
  const usage = spec.argsHint ? `${spec.name} ${spec.argsHint}` : spec.name;
  const suffix = spec.requiresHackerbot ? " _(not connected yet)_" : "";
  return `- \`${usage}\` — ${spec.description}${suffix}`;
}

const CATEGORY_HEADING: Record<SlashCommandSpec["category"], string> = {
  general: "**General:**",
  sast: "**SAST tools** (static analysis on source code):",
  dast: "**DAST tools** (dynamic probing of a live target):",
};

/**
 * The exact command Hackerbot would actually run for a given invocation —
 * `/vuln <url> <profile>` for every per-tool alias (profile preset from the
 * registry), or the literal typed command for /vuln/scan/axiom themselves.
 */
function resolveEquivalentInvocation(parsed: ParsedSlashCommand): string {
  const url = parsed.args.split(/\s+/)[0] || "<url>";
  if (parsed.spec.profile) {
    return `/vuln ${url} ${parsed.spec.profile}`;
  }
  const usage = parsed.spec.argsHint
    ? `${parsed.spec.name} ${parsed.spec.argsHint}`
    : parsed.spec.name;
  return parsed.args ? `${parsed.spec.name} ${parsed.args}` : usage;
}

/**
 * Executes a recognized slash command deterministically — no LLM call, no
 * NLU classification, ever. `/help` is fully answerable locally; the
 * Hackerbot-backed commands are real (researched against Hackerbot's own
 * API and the live orchestrator's profile list — see
 * `packages/types/src/chat-query.ts`'s module docstring — not invented)
 * but honestly report that they aren't wired up yet rather than silently
 * doing nothing or misrouting.
 */
export function executeSlashCommand(parsed: ParsedSlashCommand): ChatResult {
  if (parsed.spec.name === "/help") {
    const sections = (["general", "sast", "dast"] as const).map((category) => {
      const lines = SLASH_COMMANDS.filter((c) => c.category === category)
        .map(formatCommandLine)
        .join("\n");
      return `${CATEGORY_HEADING[category]}\n${lines}`;
    });
    return {
      capability: "SUPPORTED",
      findings: [],
      explanation:
        `${sections.join("\n\n")}\n\n` +
        "Every SAST/DAST tool command above is shorthand for `/vuln <url> <profile>` with that " +
        "tool's profile preset — you can also call `/vuln` directly with any profile name.\n\n" +
        "You can also just ask in plain English — e.g. \"show critical findings\" or \"why is F-10291 confirmed?\".",
    };
  }

  if (parsed.spec.requiresHackerbot) {
    const equivalent = resolveEquivalentInvocation(parsed);
    return {
      capability: "UNSUPPORTED",
      findings: [],
      explanation:
        `\`${parsed.spec.name}\` isn't connected yet — it needs a security-session integration ` +
        `that hasn't been built. Once it is, this will run \`${equivalent}\`.`,
      suggestions: ["/help"],
    };
  }

  // Exhaustive per SLASH_COMMANDS today (/help handled above, everything
  // else currently requires Hackerbot) — this only triggers if a future
  // command is added to the registry without a matching execution branch.
  return {
    capability: "UNSUPPORTED",
    findings: [],
    explanation: `\`${parsed.spec.name}\` is registered but has no execution handler yet.`,
    suggestions: ["/help"],
  };
}

export function executeUnknownSlashCommand(unknown: UnknownSlashCommand): ChatResult {
  return {
    capability: "UNSUPPORTED",
    findings: [],
    explanation: `Unknown command \`${unknown.unknownCommand}\`. Type \`/help\` to see available commands.`,
    suggestions: ["/help"],
  };
}
