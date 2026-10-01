import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { UpdateNotice } from "@whoami/types";

/**
 * VS Code installs extension updates on its own -- there is no "install"
 * step for this extension to drive (unlike the desktop app's
 * TauriBridgeClient/updater.ts, which owns the whole download/verify/
 * install flow). All this module does is notice, once per activation, that
 * the version changed since we last ran, and hand back an "updated"
 * UpdateNotice for the panel banner plus a native toast. See
 * docs/RELEASE-PIPELINE.md, Step 6.
 */

const VERSION_STATE_KEY = "whoami.version";

function parseVersion(version: string): readonly [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  return [major, minor, patch];
}

/** True for a minor or major bump (1.2.0 -> 1.3.0, 1.2.0 -> 2.0.0); false for
 * a patch-only bump (1.2.0 -> 1.2.1) or anything not newer. Patch releases
 * stay silent so users aren't shown a popup for every small fix -- see the
 * release doc's rationale. */
export function isMinorOrMajorBump(previous: string, current: string): boolean {
  const [prevMajor, prevMinor] = parseVersion(previous);
  const [curMajor, curMinor] = parseVersion(current);
  if (curMajor > prevMajor) return true;
  if (curMajor === prevMajor && curMinor > prevMinor) return true;
  return false;
}

/**
 * Reads the section for `version` out of a CHANGELOG.md bundled into the
 * .vsix (release-please writes this file; see release-please-config.json).
 * Missing file or missing section -> "" rather than throwing, since a
 * changelog is a nice-to-have, never load-bearing for the update itself.
 */
export function readChangelogSection(
  extensionUri: vscode.Uri,
  version: string,
): string {
  try {
    const changelogPath = path.join(extensionUri.fsPath, "CHANGELOG.md");
    if (!fs.existsSync(changelogPath)) return "";
    const contents = fs.readFileSync(changelogPath, "utf8");

    // release-please's CHANGELOG.md sections are headed "## [x.y.z](...)"
    // or plain "## x.y.z" -- match either, up to the next "## " heading.
    const heading = new RegExp(`^##\\s+\\[?${escapeRegExp(version)}\\]?`, "m");
    const match = heading.exec(contents);
    if (!match) return "";

    const start = match.index + match[0].length;
    const rest = contents.slice(start);
    const nextHeading = /^##\s+/m.exec(rest);
    const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;
    return section.trim();
  } catch (err) {
    console.warn("[WhoAmI] Failed to read CHANGELOG.md:", err);
    return "";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Call once per activation. Compares the running version against the one
 * stored from the last activation, updates the stored value, and returns an
 * "updated" UpdateNotice only for a minor/major bump on a version we've
 * actually seen before (first install -> null, no toast).
 */
export function computeUpdateNotice(
  context: vscode.ExtensionContext,
): UpdateNotice | null {
  try {
    // context.extension can be undefined in development extension host
    // runs or certain VS Code builds -- guard against it.
    let current: string | undefined =
      (context.extension?.packageJSON as Record<string, unknown> | undefined)
        ?.version as string | undefined;

    if (!current) {
      try {
        const pkgPath = path.join(context.extensionUri.fsPath, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
          current = pkg.version as string | undefined;
        }
      } catch {
        // best-effort fallback
      }
    }

    if (!current) return null;

    const previous = context.globalState?.get<string>(VERSION_STATE_KEY);
    void context.globalState?.update(VERSION_STATE_KEY, current);

    if (!previous || previous === current || !isMinorOrMajorBump(previous, current)) {
      return null;
    }

    return {
      kind: "updated",
      from: previous,
      to: current,
      notes: readChangelogSection(context.extensionUri, current),
    };
  } catch (err) {
    console.warn("[WhoAmI] computeUpdateNotice failed, skipping:", err);
    return null;
  }
}
