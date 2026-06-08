// tests/publish-workflow.test.ts
// Validates the npm publish GitHub Actions workflow.
//
// The workflow YAML itself can't be unit-tested for behavior, so these tests
// assert the file exists and contains the load-bearing configuration keys.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOW_PATH = resolve(
  import.meta.dir,
  "..",
  ".github",
  "workflows",
  "publish.yml",
);

describe("npm publish workflow", () => {
  test("workflow file exists at .github/workflows/publish.yml", () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
  });

  test("workflow triggers on push of v* tags and publishes", () => {
    const yaml = readFileSync(WORKFLOW_PATH, "utf8");
    // Triggers on push of v* tags
    expect(yaml).toMatch(/on:/);
    expect(yaml).toMatch(/push:/);
    expect(yaml).toMatch(/tags:/);
    expect(yaml).toMatch(/v\*/);
    // Actually publishes
    expect(yaml).toContain("publish");
  });

  test("workflow authenticates to npm via NODE_AUTH_TOKEN", () => {
    const yaml = readFileSync(WORKFLOW_PATH, "utf8");
    expect(yaml).toContain("NODE_AUTH_TOKEN");
  });
});
