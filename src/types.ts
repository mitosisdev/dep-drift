// src/types.ts — shared types for dep-drift

export type DriftType = "drift" | "unused" | "outdated";

export interface Finding {
  name: string;
  /** Version installed (from lockfile / node_modules) */
  installed: string;
  /** Version range in package.json */
  wanted: string;
  /** Latest version on the registry */
  latest: string;
  /** "dependencies" | "devDependencies" | "peerDependencies" */
  depType: string;
  /** Which condition this finding represents */
  type: DriftType;
}

export interface Report {
  findings: Finding[];
}

export type OutputFormat = "text" | "json";

export type FailOnMode = "drift" | "unused" | "outdated";

export interface CliOptions {
  format: OutputFormat;
  failOn?: FailOnMode;
  /** Path to the project root to analyse (default: cwd) */
  cwd: string;
}
