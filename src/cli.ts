#!/usr/bin/env bun
import { join, resolve } from "path";
import { existsSync } from "fs";
import { parsePackageJson, parseLockfile } from "./parser";
import { detectDrift } from "./drift";
import type { DriftEntry, PinnedEntry } from "./drift";

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name: string): boolean {
  return args.includes(name);
}

function getFlagValue(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const jsonMode = getFlag("--json");
const dir = resolve(getFlagValue("--dir") ?? process.cwd());

// ── File resolution ───────────────────────────────────────────────────────────

const pkgPath = join(dir, "package.json");
const lockPath = join(dir, "package-lock.json");

if (!existsSync(pkgPath)) {
  process.stderr.write(`dep-drift: package.json not found at ${pkgPath}\n`);
  process.exit(2);
}

if (!existsSync(lockPath)) {
  process.stderr.write(`dep-drift: package-lock.json not found at ${lockPath}\n`);
  process.exit(2);
}

// ── Parse & detect ────────────────────────────────────────────────────────────

const { deps } = parsePackageJson(pkgPath);
const locked = parseLockfile(lockPath);
const { drifted, pinned } = detectDrift(deps, locked);

// ── Output ────────────────────────────────────────────────────────────────────

if (jsonMode) {
  process.stdout.write(
    JSON.stringify({ drifted, pinned, clean: drifted.length === 0 }, null, 2) + "\n"
  );
  process.exit(drifted.length > 0 ? 1 : 0);
}

// Table output
const driftCount = drifted.length;
const pinnedCount = pinned.length;

if (driftCount === 0 && pinnedCount === 0) {
  process.stdout.write("dep-drift — clean. No drift or exact pins detected.\n");
  process.exit(0);
}

const parts: string[] = [];
if (driftCount > 0) parts.push(`${driftCount} drifted`);
if (pinnedCount > 0) parts.push(`${pinnedCount} pinned`);
process.stdout.write(`dep-drift — ${parts.join(", ")}\n`);

if (drifted.length > 0) {
  process.stdout.write("\nDRIFTED (declared range doesn't match locked version):\n");
  const maxName = Math.max(...drifted.map((d: DriftEntry) => d.name.length));
  const maxDecl = Math.max(...drifted.map((d: DriftEntry) => d.declared.length));
  for (const entry of drifted) {
    const name = entry.name.padEnd(maxName);
    const declared = `declared: ${entry.declared}`.padEnd(maxDecl + 10);
    process.stdout.write(`  ${name}  ${declared}  locked: ${entry.locked}   ← outside range\n`);
  }
}

if (pinned.length > 0) {
  process.stdout.write("\nPINNED (exact version pins — consider using ranges):\n");
  const maxName = Math.max(...pinned.map((p: PinnedEntry) => p.name.length));
  for (const entry of pinned) {
    const name = entry.name.padEnd(maxName);
    process.stdout.write(`  ${name}  ${entry.version}\n`);
  }
}

process.stdout.write("\n");
process.exit(driftCount > 0 ? 1 : 0);
