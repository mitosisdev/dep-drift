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

  // Non-unused findings
  const otherFindings = report.findings.filter((f) => f.type !== "unused");
  for (const f of otherFindings) {
    const tag = `[${f.type.toUpperCase()}]`.padEnd(11);
    let detail: string;
    if (f.type === "drift") {
      detail = `installed ${f.installed} vs wanted ${f.wanted}`;
    } else {
      detail = `installed ${f.installed}, latest ${f.latest}`;
    }
    lines.push(`  ${tag} ${f.name} (${f.depType}) — ${detail}`);
  }

  // Unused dependencies section
  const unusedFindings = report.findings.filter((f) => f.type === "unused");
  if (unusedFindings.length > 0) {
    if (otherFindings.length > 0) lines.push("");
    lines.push("## Unused Dependencies\n");
    for (const f of unusedFindings) {
      lines.push(`  [UNUSED]    ${f.name} — no import sites found in source`);
    }
  }

  return lines.join("\n");
}
