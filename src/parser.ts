import { readFileSync } from "fs";

export interface ParsedPackageJson {
  name: string;
  deps: Record<string, string>;
}

/**
 * Reads and parses a package.json file.
 * Merges `dependencies` and `devDependencies` into a single `deps` map.
 */
export function parsePackageJson(path: string): ParsedPackageJson {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const deps: Record<string, string> = {
    ...(raw.dependencies ?? {}),
    ...(raw.devDependencies ?? {}),
  };
  return { name: raw.name ?? "", deps };
}

/**
 * Reads and parses a package-lock.json (v3 format).
 * Returns a Map from package name → locked version.
 *
 * v3 format uses `packages["node_modules/{name}"].version`.
 * Scoped packages (e.g. `@types/node`) are stored as
 * `node_modules/@types/node` — the prefix is stripped.
 *
 * The root entry (key = "") is skipped.
 */
export function parseLockfile(path: string): Map<string, string> {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const packages: Record<string, { version?: string }> = raw.packages ?? {};
  const result = new Map<string, string>();

  for (const [key, entry] of Object.entries(packages)) {
    if (!key) continue; // skip the root entry ""
    if (!entry.version) continue;

    // Strip leading "node_modules/" (handles scoped packages too)
    const name = key.replace(/^node_modules\//, "");
    result.set(name, entry.version);
  }

  return result;
}
