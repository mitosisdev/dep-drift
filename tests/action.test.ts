// tests/action.test.ts — schema validation for the GitHub Actions composite action
//
// These tests validate that action.yml is well-formed and exposes the
// contract a consumer relies on: a name, configurable inputs with defaults,
// and a composite `runs` block whose steps set up Bun and run dep-drift.
//
// We do NOT execute the action here — we only assert its declared schema.

import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ACTION_PATH = join(import.meta.dir, "..", "action.yml");

function loadAction(): Record<string, any> {
  const raw = readFileSync(ACTION_PATH, "utf8");
  const parsed = Bun.YAML.parse(raw);
  return parsed as Record<string, any>;
}

describe("action.yml — valid YAML", () => {
  test("file parses as YAML without throwing", () => {
    expect(() => loadAction()).not.toThrow();
  });

  test("parses to a non-null object", () => {
    const action = loadAction();
    expect(action).toBeDefined();
    expect(typeof action).toBe("object");
    expect(action).not.toBeNull();
  });
});

describe("action.yml — metadata", () => {
  test("has a name", () => {
    const action = loadAction();
    expect(typeof action.name).toBe("string");
    expect(action.name.length).toBeGreaterThan(0);
  });

  test("has a description", () => {
    const action = loadAction();
    expect(typeof action.description).toBe("string");
    expect(action.description.length).toBeGreaterThan(0);
  });
});

describe("action.yml — inputs", () => {
  test("declares an inputs map", () => {
    const action = loadAction();
    expect(action.inputs).toBeDefined();
    expect(typeof action.inputs).toBe("object");
  });

  test("declares fail-on-drift input with a default", () => {
    const action = loadAction();
    const input = action.inputs?.["fail-on-drift"];
    expect(input).toBeDefined();
    expect(input.default).toBeDefined();
    // default is "true" — YAML may parse bare true as boolean, so accept both
    expect(String(input.default)).toBe("true");
  });

  test("declares working-directory input defaulting to '.'", () => {
    const action = loadAction();
    const input = action.inputs?.["working-directory"];
    expect(input).toBeDefined();
    expect(input.default).toBe(".");
  });
});

describe("action.yml — runs (composite)", () => {
  test("runs.using is 'composite'", () => {
    const action = loadAction();
    expect(action.runs).toBeDefined();
    expect(action.runs.using).toBe("composite");
  });

  test("runs.steps is a non-empty array", () => {
    const action = loadAction();
    expect(Array.isArray(action.runs.steps)).toBe(true);
    expect(action.runs.steps.length).toBeGreaterThan(0);
  });

  test("sets up Bun via oven-sh/setup-bun", () => {
    const action = loadAction();
    const usesValues = action.runs.steps
      .map((s: Record<string, any>) => s.uses)
      .filter(Boolean) as string[];
    expect(usesValues.some((u) => u.startsWith("oven-sh/setup-bun"))).toBe(true);
  });

  test("at least one run step invokes dep-drift", () => {
    const action = loadAction();
    const runScripts = action.runs.steps
      .map((s: Record<string, any>) => s.run)
      .filter(Boolean) as string[];
    expect(runScripts.length).toBeGreaterThan(0);
    expect(runScripts.some((r) => r.includes("dep-drift"))).toBe(true);
  });

  test("every shell-running step declares shell: bash (composite requirement)", () => {
    const action = loadAction();
    const runSteps = action.runs.steps.filter(
      (s: Record<string, any>) => typeof s.run === "string",
    );
    for (const step of runSteps) {
      expect(step.shell).toBe("bash");
    }
  });

  test("writes the report to the GitHub step summary", () => {
    const action = loadAction();
    const runScripts = action.runs.steps
      .map((s: Record<string, any>) => s.run)
      .filter(Boolean) as string[];
    expect(runScripts.some((r) => r.includes("GITHUB_STEP_SUMMARY"))).toBe(true);
  });

  test("references both inputs via the inputs context", () => {
    const action = loadAction();
    const blob = JSON.stringify(action.runs.steps);
    expect(blob).toContain("inputs.fail-on-drift");
    expect(blob).toContain("inputs.working-directory");
  });
});
