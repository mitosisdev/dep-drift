// tests/driftignore.test.ts — TDD tests for .driftignore support
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadDriftignore, filterFindings } from "../src/driftignore";
import type { Finding } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "dep-drift-test-"));
}

function writeIgnore(dir: string, content: string) {
  writeFileSync(join(dir, ".driftignore"), content, "utf8");
}

const sampleFindings: Finding[] = [
  {
    name: "lodash",
    installed: "4.16.0",
    wanted: "^4.17.0",
    latest: "4.17.21",
    depType: "dependencies",
    type: "drift",
  },
  {
    name: "react",
    installed: "18.0.0",
    wanted: "^18.0.0",
    latest: "18.2.0",
    depType: "dependencies",
    type: "outdated",
  },
  {
    name: "eslint",
    installed: "8.0.0",
    wanted: "^8.0.0",
    latest: "8.0.0",
    depType: "devDependencies",
    type: "unused",
  },
];

// ---------------------------------------------------------------------------
// loadDriftignore — parsing
// ---------------------------------------------------------------------------

describe("loadDriftignore — parsing", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns empty set when .driftignore does not exist", async () => {
    const result = await loadDriftignore(dir);
    expect(result.size).toBe(0);
  });

  test("parses a simple list of package names", async () => {
    writeIgnore(dir, "lodash\nreact\nexpress\n");
    const result = await loadDriftignore(dir);
    expect(result.size).toBe(3);
    expect(result.has("lodash")).toBe(true);
    expect(result.has("react")).toBe(true);
    expect(result.has("express")).toBe(true);
  });

  test("ignores blank lines", async () => {
    writeIgnore(dir, "lodash\n\n\nreact\n\n");
    const result = await loadDriftignore(dir);
    expect(result.size).toBe(2);
    expect(result.has("lodash")).toBe(true);
    expect(result.has("react")).toBe(true);
  });

  test("ignores # comment lines", async () => {
    writeIgnore(dir, "# intentionally pinned\nlodash\n# keep this one too\nreact\n");
    const result = await loadDriftignore(dir);
    expect(result.size).toBe(2);
    expect(result.has("lodash")).toBe(true);
    expect(result.has("react")).toBe(true);
  });

  test("ignores inline comments after package name", async () => {
    writeIgnore(dir, "lodash # peer dep, keep pinned\nreact\n");
    const result = await loadDriftignore(dir);
    expect(result.size).toBe(2);
    expect(result.has("lodash")).toBe(true);
    expect(result.has("react")).toBe(true);
  });

  test("trims whitespace from package names", async () => {
    writeIgnore(dir, "  lodash  \n  react\n");
    const result = await loadDriftignore(dir);
    expect(result.has("lodash")).toBe(true);
    expect(result.has("react")).toBe(true);
  });

  test("handles scoped packages (@org/pkg)", async () => {
    writeIgnore(dir, "@typescript-eslint/parser\n@babel/core\n");
    const result = await loadDriftignore(dir);
    expect(result.size).toBe(2);
    expect(result.has("@typescript-eslint/parser")).toBe(true);
    expect(result.has("@babel/core")).toBe(true);
  });

  test("handles empty file gracefully", async () => {
    writeIgnore(dir, "");
    const result = await loadDriftignore(dir);
    expect(result.size).toBe(0);
  });

  test("handles file with only comments and blanks", async () => {
    writeIgnore(dir, "# just a comment\n\n# another comment\n\n");
    const result = await loadDriftignore(dir);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterFindings — filtering logic
// ---------------------------------------------------------------------------

describe("filterFindings", () => {
  test("returns all findings when ignore set is empty", () => {
    const result = filterFindings(sampleFindings, new Set());
    expect(result).toHaveLength(3);
  });

  test("excludes a single ignored package", () => {
    const result = filterFindings(sampleFindings, new Set(["lodash"]));
    expect(result).toHaveLength(2);
    expect(result.find((f) => f.name === "lodash")).toBeUndefined();
  });

  test("excludes multiple ignored packages", () => {
    const result = filterFindings(sampleFindings, new Set(["lodash", "eslint"]));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("react");
  });

  test("excludes all packages when all are ignored", () => {
    const result = filterFindings(
      sampleFindings,
      new Set(["lodash", "react", "eslint"]),
    );
    expect(result).toHaveLength(0);
  });

  test("does not mutate the original findings array", () => {
    const original = [...sampleFindings];
    filterFindings(sampleFindings, new Set(["lodash"]));
    expect(sampleFindings).toHaveLength(original.length);
  });

  test("ignoring a name not in findings has no effect", () => {
    const result = filterFindings(sampleFindings, new Set(["nonexistent-pkg"]));
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Integration: run() wires loadDriftignore into CLI
// ---------------------------------------------------------------------------

describe("CLI integration — .driftignore filtering", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("run() excludes packages listed in .driftignore", async () => {
    // Set up a minimal project with a package.json
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        dependencies: {
          lodash: "^4.17.0",
          react: "^18.0.0",
        },
      }),
      "utf8",
    );

    // Create a fake node_modules so packages appear "installed"
    mkdirSync(join(dir, "node_modules", "lodash"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", "lodash", "package.json"),
      JSON.stringify({ version: "4.16.0" }),
    );
    mkdirSync(join(dir, "node_modules", "react"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", "react", "package.json"),
      JSON.stringify({ version: "18.0.0" }),
    );

    // Ignore lodash
    writeIgnore(dir, "lodash\n");

    const { run } = await import("../src/cli.ts");

    // Use a fake registry that returns null (no outdated signals)
    const fakeRegistry = async (_name: string) => null;

    const { output } = await run({ format: "text", cwd: dir }, fakeRegistry);

    // lodash should NOT appear in output
    expect(output).not.toContain("lodash");
  });

  test("run() includes all packages when .driftignore is absent", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        dependencies: {
          lodash: "^4.17.0",
        },
      }),
      "utf8",
    );

    mkdirSync(join(dir, "node_modules", "lodash"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", "lodash", "package.json"),
      JSON.stringify({ version: "4.16.0" }),
    );

    // No .driftignore

    const { run } = await import("../src/cli.ts");
    const fakeRegistry = async (_name: string) => null;

    const { output } = await run({ format: "text", cwd: dir }, fakeRegistry);

    // lodash drift should appear (4.16.0 vs wanted ^4.17.0)
    expect(output).toContain("lodash");
  });
});
