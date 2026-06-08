// tests/formatter.test.ts — unit tests for the formatter
import { test, expect, describe } from "bun:test";
import { format } from "../src/formatter";
import type { Report } from "../src/types";

describe("format — text mode", () => {
  test("returns clean message when no findings", () => {
    const report: Report = { findings: [] };
    const out = format(report, "text");
    expect(out).toContain("No issues");
  });

  test("shows drift details", () => {
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
    expect(out).toContain("lodash");
    expect(out).toContain("DRIFT");
    expect(out).toContain("4.16.0");
  });
});

describe("format — json mode", () => {
  test("produces valid JSON", () => {
    const report: Report = { findings: [] };
    const out = format(report, "json");
    expect(() => JSON.parse(out)).not.toThrow();
  });

  test("JSON has findings array at top level", () => {
    const report: Report = { findings: [] };
    const parsed = JSON.parse(format(report, "json"));
    expect(parsed).toHaveProperty("findings");
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  test("JSON finding has required shape", () => {
    const finding = {
      name: "express",
      installed: "4.17.0",
      wanted: "^4.18.0",
      latest: "4.18.2",
      depType: "dependencies",
      type: "drift" as const,
    };
    const report: Report = { findings: [finding] };
    const parsed = JSON.parse(format(report, "json"));
    expect(parsed.findings).toHaveLength(1);
    const f = parsed.findings[0];
    expect(f.name).toBe("express");
    expect(f.installed).toBe("4.17.0");
    expect(f.wanted).toBe("^4.18.0");
    expect(f.latest).toBe("4.18.2");
    expect(f.depType).toBe("dependencies");
    expect(f.type).toBe("drift");
  });

  test("JSON includes all finding types", () => {
    const report: Report = {
      findings: [
        {
          name: "pkg-a",
          installed: "1.0.0",
          wanted: "^2.0.0",
          latest: "2.0.0",
          depType: "dependencies",
          type: "drift",
        },
        {
          name: "pkg-b",
          installed: "1.0.0",
          wanted: "^1.0.0",
          latest: "1.5.0",
          depType: "devDependencies",
          type: "outdated",
        },
        {
          name: "pkg-c",
          installed: "3.0.0",
          wanted: "^3.0.0",
          latest: "3.0.0",
          depType: "dependencies",
          type: "unused",
        },
      ],
    };
    const parsed = JSON.parse(format(report, "json"));
    expect(parsed.findings).toHaveLength(3);
    const types = parsed.findings.map((f: { type: string }) => f.type);
    expect(types).toContain("drift");
    expect(types).toContain("outdated");
    expect(types).toContain("unused");
  });
});
