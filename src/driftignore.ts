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
 * Read and parse a .driftignore file from the given project directory.
 * Returns a Set of package names to exclude from dep-drift output.
 * If the file does not exist, returns an empty Set.
 */
export async function loadDriftignore(dir: string): Promise<Set<string>> {
  const filePath = join(dir, ".driftignore");

  if (!existsSync(filePath)) {
    return new Set();
  }

  let contents: string;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `.driftignore could not be read at ${filePath}: ${(err as Error).message}`,
    );
  }

  const ignored = new Set<string>();

  for (const rawLine of contents.split("\n")) {
    // Strip inline comment
    const withoutComment = rawLine.includes("#")
      ? rawLine.slice(0, rawLine.indexOf("#"))
      : rawLine;

    const name = withoutComment.trim();

    if (name.length === 0) {
      continue;
    }

    ignored.add(name);
  }

  return ignored;
}

/**
 * Filter a findings array, excluding any finding whose package name
 * is in the ignore set. Returns a new array; does not mutate the input.
 */
export function filterFindings(
  findings: Finding[],
  ignored: Set<string>,
): Finding[] {
  if (ignored.size === 0) return findings;
  return findings.filter((f) => !ignored.has(f.name));
}
