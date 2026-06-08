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

/** Check whether a package name appears in any source file import/require */
function isUsedInSource(cwd: string, name: string): boolean {
  const srcDir = join(cwd, "src");
  const files = getSourceFiles(existsSync(srcDir) ? srcDir : cwd);
  // Escape special chars in package name for regex
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`['"\`]${escaped}(/|['"\`])`, "m");
  for (const file of files) {
    try {
      const content = readFileSync(file, "utf8");
      if (re.test(content)) return true;
    } catch {
      // skip unreadable files
    }
  }
  return false;
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

    // unused: no import sites found in source
    if (!isUsedInSource(cwd, name)) {
      findings.push({ name, installed, wanted, latest, depType, type: "unused" });
    }
  }

  return { findings };
}
