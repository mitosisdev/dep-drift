// tests/driftignore-array-api.test.ts — TDD tests for the loadDriftIgnore(cwd) public API
//
// This complements the existing Set-based loadDriftignore() internal helper with a
// clean, synchronous, array-returning public contract:
//
//   loadDriftIgnore(cwd: string): string[]
//
// Behavioural contract (per spec):
//   - reads `.driftignore` from the given directory
//   - lines starting with `#` are comments and ignored
//   - empty lines are ignored
//   - listed package names are excluded from the final drift report output
//   - if no `.driftignore` exists, returns [] (no filtering)

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadDriftIgnore } from "../src/driftignore";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "dep-drift-arr-test-"));
}

function writeIgnore(dir: string, content: string) {
  writeFileSync(join(dir, ".driftignore"), content, "utf8");
}

// ---------------------------------------------------------------------------
// loadDriftIgnore — array contract
// ---------------------------------------------------------------------------

describe("loadDriftIgnore(cwd): string[]", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns an empty array when .driftignore does not exist", () => {
    const result = loadDriftIgnore(dir);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test("returns a plain array of package names", () => {
    writeIgnore(dir, "lodash\nreact\nexpress\n");
    const result = loadDriftIgnore(dir);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(["lodash", "react", "express"]);
  });

  test("ignores lines starting with # (comments)", () => {
    writeIgnore(dir, "# pinned on purpose\nlodash\n# keep react too\nreact\n");
    const result = loadDriftIgnore(dir);
    expect(result).toEqual(["lodash", "react"]);
  });

  test("ignores empty / whitespace-only lines", () => {
    writeIgnore(dir, "lodash\n\n   \nreact\n\n");
    const result = loadDriftIgnore(dir);
    expect(result).toEqual(["lodash", "react"]);
  });

  test("trims surrounding whitespace from names", () => {
    writeIgnore(dir, "  lodash  \n\treact\n");
    const result = loadDriftIgnore(dir);
    expect(result).toEqual(["lodash", "react"]);
  });

  test("strips inline comments after a package name", () => {
    writeIgnore(dir, "lodash # peer dep, keep pinned\nreact\n");
    const result = loadDriftIgnore(dir);
    expect(result).toEqual(["lodash", "react"]);
  });

  test("supports scoped packages", () => {
    writeIgnore(dir, "@typescript-eslint/parser\n@babel/core\n");
    const result = loadDriftIgnore(dir);
    expect(result).toEqual(["@typescript-eslint/parser", "@babel/core"]);
  });

  test("empty file yields empty array", () => {
    writeIgnore(dir, "");
    expect(loadDriftIgnore(dir)).toEqual([]);
  });

  test("file of only comments and blanks yields empty array", () => {
    writeIgnore(dir, "# a\n\n# b\n\n");
    expect(loadDriftIgnore(dir)).toEqual([]);
  });
});
