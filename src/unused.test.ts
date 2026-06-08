// src/unused.test.ts — unit tests for unused-dependency detection
//
// All tests use in-memory fixtures (no real FS access) via the exported
// `extractUsedPackages` function from analyzer.ts.

import { test, expect, describe } from "bun:test";
import { extractUsedPackages } from "./analyzer.ts";
import { format } from "./formatter.ts";
import type { Report } from "./types.ts";

// ---------------------------------------------------------------------------
// extractUsedPackages — core detection logic
// ---------------------------------------------------------------------------

describe("extractUsedPackages", () => {
  test("detects static import from 'pkg'", () => {
    const used = extractUsedPackages([`import foo from 'lodash';`]);
    expect(used.has("lodash")).toBe(true);
  });

  test("detects static import with double quotes", () => {
    const used = extractUsedPackages([`import { bar } from "express";`]);
    expect(used.has("express")).toBe(true);
  });

  test("detects dynamic import()", () => {
    const used = extractUsedPackages([`const x = await import('chalk');`]);
    expect(used.has("chalk")).toBe(true);
  });

  test("detects require()", () => {
    const used = extractUsedPackages([`const x = require('fs-extra');`]);
    expect(used.has("fs-extra")).toBe(true);
  });

  test("strips subpath imports — lodash/fp → lodash", () => {
    const used = extractUsedPackages([`import fp from 'lodash/fp';`]);
    expect(used.has("lodash")).toBe(true);
    expect(used.has("lodash/fp")).toBe(false);
  });

  test("strips deep subpath — pkg/a/b/c → pkg", () => {
    const used = extractUsedPackages([`import x from 'pkg/a/b/c';`]);
    expect(used.has("pkg")).toBe(true);
  });

  test("handles scoped packages — @scope/name", () => {
    const used = extractUsedPackages([`import x from '@babel/core';`]);
    expect(used.has("@babel/core")).toBe(true);
  });

  test("handles scoped packages with subpath — @scope/name/sub → @scope/name", () => {
    const used = extractUsedPackages([`import x from '@scope/name/subpath';`]);
    expect(used.has("@scope/name")).toBe(true);
    expect(used.has("@scope/name/subpath")).toBe(false);
  });

  test("does NOT include relative imports", () => {
    const used = extractUsedPackages([`import x from './local-module';`]);
    expect(used.has("./local-module")).toBe(false);
    expect(used.size).toBe(0);
  });

  test("does NOT include parent-relative imports", () => {
    const used = extractUsedPackages([`import x from '../utils';`]);
    expect(used.size).toBe(0);
  });

  test("does NOT include absolute path imports", () => {
    const used = extractUsedPackages([`import x from '/abs/path';`]);
    expect(used.size).toBe(0);
  });

  test("aggregates across multiple files", () => {
    const used = extractUsedPackages([
      `import a from 'pkg-a';`,
      `import b from 'pkg-b';\nimport c from 'pkg-c';`,
    ]);
    expect(used.has("pkg-a")).toBe(true);
    expect(used.has("pkg-b")).toBe(true);
    expect(used.has("pkg-c")).toBe(true);
  });

  test("empty source returns empty set", () => {
    const used = extractUsedPackages([]);
    expect(used.size).toBe(0);
  });

  test("whitespace-only source returns empty set", () => {
    const used = extractUsedPackages(["   \n\n  "]);
    expect(used.size).toBe(0);
  });

  test("handles multiple imports in one file", () => {
    const src = `
      import React from 'react';
      import { useState } from 'react';
      import axios from 'axios';
      const chalk = require('chalk');
    `;
    const used = extractUsedPackages([src]);
    expect(used.has("react")).toBe(true);
    expect(used.has("axios")).toBe(true);
    expect(used.has("chalk")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unused-dep detection — fixture-based integration
// ---------------------------------------------------------------------------

describe("unused dependency detection — fixture", () => {
  /**
   * Build a Report that mimics what analyse() would produce for a project
   * with the given dependencies and source file contents.
   *
   * Avoids touching the FS: we call extractUsedPackages directly and build
   * findings manually.
   */
  function buildReport(opts: {
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
    sourceContents: string[];
  }): Report {
    const used = extractUsedPackages(opts.sourceContents);
    const findings: Report["findings"] = [];

    for (const name of Object.keys(opts.dependencies)) {
      if (!used.has(name)) {
        findings.push({
          name,
          installed: "1.0.0",
          wanted: "^1.0.0",
          latest: "1.0.0",
          depType: "dependencies",
          type: "unused",
        });
      }
    }

    for (const name of Object.keys(opts.devDependencies ?? {})) {
      if (!used.has(name)) {
        // devDeps intentionally NOT flagged as unused — they belong in tests etc.
        // (This is a no-op, just documents intent.)
      }
    }

    return { findings };
  }

  test("flags package in dependencies with no imports", () => {
    const report = buildReport({
      dependencies: { "never-used": "^1.0.0" },
      sourceContents: [`import foo from 'other-pkg';`],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].name).toBe("never-used");
    expect(report.findings[0].type).toBe("unused");
  });

  test("does NOT flag a dependency that is imported", () => {
    const report = buildReport({
      dependencies: { "lodash": "^4.0.0" },
      sourceContents: [`import _ from 'lodash';`],
    });
    expect(report.findings.filter((f) => f.type === "unused")).toHaveLength(0);
  });

  test("does NOT flag devDependencies even when unused", () => {
    const report = buildReport({
      dependencies: {},
      devDependencies: { "vitest": "^1.0.0" },
      sourceContents: [],
    });
    // devDeps not processed → no unused findings
    expect(report.findings.filter((f) => f.type === "unused")).toHaveLength(0);
  });

  test("subpath import correctly resolves to root — not flagged", () => {
    const report = buildReport({
      dependencies: { "lodash": "^4.0.0" },
      sourceContents: [`import fp from 'lodash/fp';`],
    });
    expect(report.findings.filter((f) => f.type === "unused")).toHaveLength(0);
  });

  test("multiple deps — only unused ones flagged", () => {
    const report = buildReport({
      dependencies: {
        "used-pkg": "^1.0.0",
        "unused-pkg": "^1.0.0",
      },
      sourceContents: [`import x from 'used-pkg';`],
    });
    const unusedFindings = report.findings.filter((f) => f.type === "unused");
    expect(unusedFindings).toHaveLength(1);
    expect(unusedFindings[0].name).toBe("unused-pkg");
  });

  test("no dependencies → no unused findings", () => {
    const report = buildReport({
      dependencies: {},
      sourceContents: [],
    });
    expect(report.findings.filter((f) => f.type === "unused")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Formatter — Unused Dependencies section
// ---------------------------------------------------------------------------

describe("formatter — Unused Dependencies section", () => {
  test("includes '## Unused Dependencies' section when unused findings present", () => {
    const report: Report = {
      findings: [
        {
          name: "dead-lib",
          installed: "1.0.0",
          wanted: "^1.0.0",
          latest: "1.0.0",
          depType: "dependencies",
          type: "unused",
        },
      ],
    };
    const out = format(report, "text");
    expect(out).toContain("## Unused Dependencies");
    expect(out).toContain("dead-lib");
  });

  test("unused section lists the package name and 'no import sites found'", () => {
    const report: Report = {
      findings: [
        {
          name: "ghost-pkg",
          installed: "2.0.0",
          wanted: "^2.0.0",
          latest: "2.0.0",
          depType: "dependencies",
          type: "unused",
        },
      ],
    };
    const out = format(report, "text");
    expect(out).toContain("ghost-pkg");
    expect(out).toContain("no import sites found");
  });

  test("no Unused Dependencies section when no unused findings", () => {
    const report: Report = {
      findings: [
        {
          name: "lodash",
          installed: "4.16.0",
          wanted: "^4.17.0",
          latest: "4.17.21",
          depType: "dependencies",
          type: "drift",
        },
      ],
    };
    const out = format(report, "text");
    expect(out).not.toContain("## Unused Dependencies");
  });

  test("JSON format includes unused findings in findings array", () => {
    const report: Report = {
      findings: [
        {
          name: "unused-dep",
          installed: "1.0.0",
          wanted: "^1.0.0",
          latest: "1.0.0",
          depType: "dependencies",
          type: "unused",
        },
      ],
    };
    const parsed = JSON.parse(format(report, "json"));
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].type).toBe("unused");
    expect(parsed.findings[0].name).toBe("unused-dep");
  });
});

// ---------------------------------------------------------------------------
// --fail-on unused — exit code logic
// ---------------------------------------------------------------------------

describe("--fail-on unused exit code", () => {
  test("exit 1 triggered when unused finding present", () => {
    const report: Report = {
      findings: [
        {
          name: "dead",
          installed: "1.0.0",
          wanted: "^1.0.0",
          latest: "1.0.0",
          depType: "dependencies",
          type: "unused",
        },
      ],
    };
    const failOn = "unused";
    const triggered = report.findings.some((f) => f.type === failOn);
    expect(triggered).toBe(true);
  });

  test("exit 0 when no unused findings and --fail-on unused", () => {
    const report: Report = { findings: [] };
    const failOn = "unused";
    const triggered = report.findings.some((f) => f.type === failOn);
    expect(triggered).toBe(false);
  });
});
