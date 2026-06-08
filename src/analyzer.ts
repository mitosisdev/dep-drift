// src/analyzer.ts — core drift-analysis logic
// Reads package.json + lockfile/node_modules and builds a Report.
//
// Detection rules:
//   drift    — installed version does not satisfy the wanted range in package.json
//   unused   — package is listed in dependencies but has zero import sites in src/
//   outdated — installed version is behind the latest on the registry

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import type { Finding, Report } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "x.y.z" into [x, y, z] */
function parseVersion(v: string): [number, number, number] {
  const clean = v.replace(/^[^0-9]*/, "");
  const parts = clean.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** Compare two semver strings. Returns negative / 0 / positive. */
function cmpVersion(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseVersion(a);
  const [bMaj, bMin, bPat] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

/** Return the installed version from node_modules/<name>/package.json */
function getInstalledVersion(cwd: string, name: string): string | null {
  const pkgPath = join(cwd, "node_modules", name, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/** Get all TS/JS source files recursively (skips node_modules) */
function getSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...getSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract the set of bare package names referenced by import/require in a
 * collection of source-file contents.
 *
 * Handles all common forms:
 *   import ... from 'pkg'
 *   import ... from 'pkg/sub/path'
 *   import('pkg')
 *   require('pkg')
 *   require('pkg/sub/path')
 *
 * Subpath imports are normalised to the root package name:
 *   'lodash/fp'  →  'lodash'
 *   '@scope/pkg/sub'  →  '@scope/pkg'
 *
 * @param contents - Array of source file content strings (in-memory, no FS access needed)
 */
export function extractUsedPackages(contents: string[]): Set<string> {
  // Matches any quoted string that looks like a bare-package import (not relative/absolute)
  // Captures the full specifier; we strip the subpath below.
  const re = /(?:from|import|require)\s*\(\s*['"`]([^'"`.][^'"`]*)['"`]\s*\)|(?:from)\s+['"`]([^'"`.][^'"`]*)['"`]/gm;
  const used = new Set<string>();

  for (const content of contents) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      const specifier = (m[1] ?? m[2] ?? "").trim();
      if (!specifier) continue;
      // Skip relative or absolute paths
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
      // Normalise subpath to root package name
      const pkg = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")  // @scope/name(/sub) → @scope/name
        : specifier.split("/")[0]!;                    // name(/sub) → name
      if (pkg) used.add(pkg);
    }
  }

  return used;
}

/** Check whether a package name appears in any source file import/require */
function isUsedInSource(cwd: string, name: string): boolean {
  const srcDir = join(cwd, "src");
  const files = getSourceFiles(existsSync(srcDir) ? srcDir : cwd);
  const contents: string[] = [];
  for (const file of files) {
    try {
      contents.push(readFileSync(file, "utf8"));
    } catch {
      // skip unreadable files
    }
  }
  return extractUsedPackages(contents).has(name);
}

/** Resolve wanted range to a concrete version string for comparison.
 *  Very simple: strips leading ^ ~ >= < = and returns the version number. */
function resolveWanted(wanted: string): string {
  return wanted.replace(/^[^0-9]*/, "");
}

// ---------------------------------------------------------------------------
// Registry lookup (stubbed for testability — replaced in real usage)
// ---------------------------------------------------------------------------

export interface RegistryLookup {
  (name: string): Promise<string | null>;
}

/** Default: fetch from npm registry */
export async function defaultRegistryLookup(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}/latest`);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main analyser
// ---------------------------------------------------------------------------

export async function analyse(
  cwd: string,
  registryLookup: RegistryLookup = defaultRegistryLookup,
): Promise<Report> {
  const pkgPath = join(resolve(cwd), "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found at ${pkgPath}`);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const findings: Finding[] = [];

  const allDeps: Array<[string, string, string]> = [
    ...Object.entries(pkg.dependencies ?? {}).map(
      ([n, v]) => [n, v as string, "dependencies"] as [string, string, string],
    ),
    ...Object.entries(pkg.devDependencies ?? {}).map(
      ([n, v]) => [n, v as string, "devDependencies"] as [string, string, string],
    ),
    ...Object.entries(pkg.peerDependencies ?? {}).map(
      ([n, v]) => [n, v as string, "peerDependencies"] as [string, string, string],
    ),
  ];

  for (const [name, wanted, depType] of allDeps) {
    const installed = getInstalledVersion(cwd, name) ?? "unknown";
    const latest = (await registryLookup(name)) ?? installed;

    // drift: installed doesn't match wanted range base version
    const wantedBase = resolveWanted(wanted);
    if (
      installed !== "unknown" &&
      wantedBase !== "" &&
      cmpVersion(installed, wantedBase) !== 0
    ) {
      findings.push({ name, installed, wanted, latest, depType, type: "drift" });
      continue;
    }

    // outdated: installed is behind latest
    if (
      installed !== "unknown" &&
      latest !== "unknown" &&
      cmpVersion(installed, latest) < 0
    ) {
      findings.push({ name, installed, wanted, latest, depType, type: "outdated" });
      continue;
    }

    // unused: no import sites found in source (only flag `dependencies`, not devDeps/peerDeps)
    if (depType === "dependencies" && !isUsedInSource(cwd, name)) {
      findings.push({ name, installed, wanted, latest, depType, type: "unused" });
    }
  }

  return { findings };
}
