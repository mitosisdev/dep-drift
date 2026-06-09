// tests/release.test.ts
// Locks the v1.0.0 release invariants: package.json version and a CHANGELOG
// that documents the shipped feature set.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGE_JSON_PATH = resolve(import.meta.dir, "..", "package.json");
const CHANGELOG_PATH = resolve(import.meta.dir, "..", "CHANGELOG.md");

describe("release version", () => {
  test("package.json version is 1.0.0", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
    expect(pkg.version).toBe("1.0.0");
  });
});

describe("CHANGELOG", () => {
  test("CHANGELOG.md exists", () => {
    expect(existsSync(CHANGELOG_PATH)).toBe(true);
  });

  test("CHANGELOG documents the 1.0.0 release", () => {
    const changelog = readFileSync(CHANGELOG_PATH, "utf8");
    expect(changelog).toMatch(/\[1\.0\.0\]/);
  });

  test("CHANGELOG covers the shipped feature set", () => {
    const changelog = readFileSync(CHANGELOG_PATH, "utf8").toLowerCase();
    expect(changelog).toContain("drift");
    expect(changelog).toContain("json");
    expect(changelog).toContain("--fail-on");
    expect(changelog).toContain("unused");
    expect(changelog).toContain(".driftignore");
    expect(changelog).toContain("github actions");
  });
});
