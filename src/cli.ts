#!/usr/bin/env bun
// src/cli.ts — dep-drift CLI entry point
//
// Usage:
//   dep-drift [--format text|json] [--fail-on drift|unused|outdated] [path]
//
// Exit codes:
//   0 — no issues (or --fail-on mode not triggered)
//   1 — --fail-on condition triggered, or unrecoverable error

import { analyse } from "./analyzer.ts";
import { format } from "./formatter.ts";
import { loadDriftignore, filterFindings } from "./driftignore.ts";
import type { CliOptions, FailOnMode, OutputFormat } from "./types.ts";

/** Parse process.argv-style args into CliOptions */
export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    format: "text",
    failOn: undefined,
    cwd: process.cwd(),
  };

  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift()!;

    if (arg === "--format" || arg === "-f") {
      const val = args.shift();
      if (val !== "text" && val !== "json") {
        throw new Error(`--format must be "text" or "json", got "${val}"`);
      }
      opts.format = val as OutputFormat;
    } else if (arg === "--fail-on") {
      const val = args.shift();
      if (val !== "drift" && val !== "unused" && val !== "outdated") {
        throw new Error(
          `--fail-on must be "drift", "unused", or "outdated", got "${val}"`,
        );
      }
      opts.failOn = val as FailOnMode;
    } else if (!arg.startsWith("-")) {
      opts.cwd = arg;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return opts;
}

/** Core run logic (exported for testing) */
export async function run(
  opts: CliOptions,
  // injectable for tests
  registryLookup?: (name: string) => Promise<string | null>,
): Promise<{ output: string; exitCode: number }> {
  const { analyse: analyseImpl } = await import("./analyzer.ts");
  const { format: formatImpl } = await import("./formatter.ts");
  const { loadDriftignore: loadIgnore, filterFindings: filterFn } = await import("./driftignore.ts");

  const report = await (registryLookup
    ? analyseImpl(opts.cwd, registryLookup)
    : analyseImpl(opts.cwd));

  // Apply .driftignore filtering
  const ignored = await loadIgnore(opts.cwd);
  const filteredFindings = filterFn(report.findings, ignored);
  const filteredReport = { ...report, findings: filteredFindings };

  const output = formatImpl(filteredReport, opts.format);

  let exitCode = 0;
  if (opts.failOn) {
    const triggered = filteredReport.findings.some((f) => f.type === opts.failOn);
    if (triggered) exitCode = 1;
  }

  return { output, exitCode };
}

// ---------------------------------------------------------------------------
// Entry point (only runs when executed directly)
// ---------------------------------------------------------------------------
if (import.meta.main) {
  const argv = process.argv.slice(2);
  let opts: CliOptions;

  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  try {
    const { output, exitCode } = await run(opts);
    console.log(output);
    process.exit(exitCode);
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  }
}
