// src/driftignore.ts — .driftignore config file support
//
// File format:
//   - One package name per line
//   - Blank lines are ignored
//   - Lines starting with # are comments (full-line comments)
//   - Inline comments after a package name (# ...) are stripped
//   - Leading/trailing whitespace is trimmed
//   - Scoped packages (@org/name) are supported
//
// If .driftignore does not exist, an empty Set is returned (no-op).

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding } from "./types.ts";

/**
 * Parse raw .driftignore file contents into an ordered list of package names.
 *
 * Shared by both the array-returning public API (`loadDriftIgnore`) and the
 * Set-returning internal helper (`loadDriftignore`) so parsing rules stay in
 * exactly one place:
 *   - blank / whitespace-only lines are skipped
 *   - full-line `#` comments are skipped
 *   - inline `# ...` comments after a name are stripped
 *   - names are trimmed
 *   - duplicates are collapsed (first occurrence wins, order preserved)
 */
function parseDriftignore(contents: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of contents.split("\n")) {
    // Strip inline comment
    const withoutComment = rawLine.includes("#")
      ? rawLine.slice(0, rawLine.indexOf("#"))
      : rawLine;

    const name = withoutComment.trim();

    if (name.length === 0) continue;
    if (seen.has(name)) continue;

    seen.add(name);
    names.push(name);
  }

  return names;
}

/**
 * Read and parse a .driftignore file from the given project directory.
 *
 * Public API. Synchronous, returns a plain `string[]` of package names to
 * exclude from the drift report (one per line; `#` comments and blank lines
 * ignored). If `.driftignore` does not exist, returns `[]` (no filtering).
 *
 * @param cwd - project root directory to look for `.driftignore` in
 */
export function loadDriftIgnore(cwd: string): string[] {
  const filePath = join(cwd, ".driftignore");

  if (!existsSync(filePath)) {
    return [];
  }

  let contents: string;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `.driftignore could not be read at ${filePath}: ${(err as Error).message}`,
    );
  }

  return parseDriftignore(contents);
}

/**
 * Read and parse a .driftignore file from the given project directory.
 * Returns a Set of package names to exclude from dep-drift output.
 * If the file does not exist, returns an empty Set.
 *
 * Internal helper retained for the existing CLI/test wiring. Prefer the
 * public `loadDriftIgnore(cwd): string[]` for new callers.
 */
export async function loadDriftignore(dir: string): Promise<Set<string>> {
  return new Set(loadDriftIgnore(dir));
}

/**
 * Filter a findings array, excluding any finding whose package name
 * is in the ignore list. Returns a new array; does not mutate the input.
 *
 * Accepts either a `Set<string>` (existing callers) or a `string[]`
 * (the public `loadDriftIgnore` return value) for the ignore list.
 */
export function filterFindings(
  findings: Finding[],
  ignored: Set<string> | string[],
): Finding[] {
  const ignoreSet = ignored instanceof Set ? ignored : new Set(ignored);
  if (ignoreSet.size === 0) return findings;
  return findings.filter((f) => !ignoreSet.has(f.name));
}
