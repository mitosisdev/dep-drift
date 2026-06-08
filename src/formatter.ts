// src/formatter.ts — format a Report as text or JSON

import type { Report, OutputFormat } from "./types.ts";

/** Render a Report to a string in the requested format */
export function format(report: Report, outputFormat: OutputFormat): string {
  if (outputFormat === "json") {
    return JSON.stringify(report, null, 2);
  }
  return formatText(report);
}

function formatText(report: Report): string {
  if (report.findings.length === 0) {
    return "No issues found. All dependencies are clean.";
  }

  const lines: string[] = [`Found ${report.findings.length} issue(s):\n`];

  for (const f of report.findings) {
    const tag = `[${f.type.toUpperCase()}]`.padEnd(11);
    let detail: string;
    if (f.type === "drift") {
      detail = `installed ${f.installed} vs wanted ${f.wanted}`;
    } else if (f.type === "outdated") {
      detail = `installed ${f.installed}, latest ${f.latest}`;
    } else {
      detail = `no import sites found`;
    }
    lines.push(`  ${tag} ${f.name} (${f.depType}) — ${detail}`);
  }

  return lines.join("\n");
}
