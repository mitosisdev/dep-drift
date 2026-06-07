import { describe, it, expect } from "bun:test";
import { detectDrift } from "../src/drift";

describe("detectDrift — range satisfaction", () => {
  it("returns no drift when locked version satisfies declared range", () => {
    const deps = { react: "^17.0.0" };
    const locked = new Map([["react", "17.5.0"]]);
    const { drifted } = detectDrift(deps, locked);
    expect(drifted).toHaveLength(0);
  });

  it("detects drift when locked version is a major bump outside range (^1.0.0 + 2.0.0)", () => {
    const deps = { lodash: "^1.0.0" };
    const locked = new Map([["lodash", "2.0.0"]]);
    const { drifted } = detectDrift(deps, locked);
    expect(drifted).toHaveLength(1);
    expect(drifted[0].name).toBe("lodash");
    expect(drifted[0].declared).toBe("^1.0.0");
    expect(drifted[0].locked).toBe("2.0.0");
  });

  it("detects drift when locked version is lower than range minimum (^4.0.0 + locked 3.10.1)", () => {
    const deps = { lodash: "^4.0.0" };
    const locked = new Map([["lodash", "3.10.1"]]);
    const { drifted } = detectDrift(deps, locked);
    expect(drifted).toHaveLength(1);
    expect(drifted[0].name).toBe("lodash");
  });

  it("does NOT flag drift when ^1.0.0 locked at 1.5.0 (satisfies range)", () => {
    const deps = { axios: "^1.0.0" };
    const locked = new Map([["axios", "1.5.0"]]);
    const { drifted } = detectDrift(deps, locked);
    expect(drifted).toHaveLength(0);
  });

  it("does NOT flag drift when ~1.2.0 locked at 1.2.9 (satisfies tilde range)", () => {
    const deps = { semver: "~1.2.0" };
    const locked = new Map([["semver", "1.2.9"]]);
    const { drifted } = detectDrift(deps, locked);
    expect(drifted).toHaveLength(0);
  });

  it("detects drift when ~1.2.0 locked at 1.3.0 (outside tilde range)", () => {
    const deps = { semver: "~1.2.0" };
    const locked = new Map([["semver", "1.3.0"]]);
    const { drifted } = detectDrift(deps, locked);
    expect(drifted).toHaveLength(1);
  });

  it("skips packages not present in the lockfile", () => {
    const deps = { missing: "^1.0.0" };
    const locked = new Map<string, string>();
    const { drifted } = detectDrift(deps, locked);
    expect(drifted).toHaveLength(0);
  });
});

describe("detectDrift — pinned detection", () => {
  it("identifies exact version pins (no range character)", () => {
    const deps = { typescript: "5.0.0", prettier: "3.0.0" };
    const locked = new Map([["typescript", "5.0.0"], ["prettier", "3.0.0"]]);
    const { pinned } = detectDrift(deps, locked);
    expect(pinned).toHaveLength(2);
    const names = pinned.map((p) => p.name);
    expect(names).toContain("typescript");
    expect(names).toContain("prettier");
  });

  it("does NOT flag ranged versions as pinned (^, ~, >=, *)", () => {
    const deps = {
      react: "^18.0.0",
      lodash: "~4.0.0",
      axios: ">=1.0.0",
      anything: "*",
    };
    const locked = new Map([
      ["react", "18.2.0"],
      ["lodash", "4.0.9"],
      ["axios", "1.6.0"],
      ["anything", "2.0.0"],
    ]);
    const { pinned } = detectDrift(deps, locked);
    expect(pinned).toHaveLength(0);
  });

  it("flags exact pin even when not in lockfile", () => {
    const deps = { typescript: "5.0.0" };
    const locked = new Map<string, string>();
    const { pinned } = detectDrift(deps, locked);
    expect(pinned).toHaveLength(1);
    expect(pinned[0].name).toBe("typescript");
    expect(pinned[0].version).toBe("5.0.0");
  });

  it("a pinned dep that is also drifted appears in drifted (not double-counted)", () => {
    // exact pin + lockfile has different version → drift, pinned separately
    const deps = { typescript: "5.0.0" };
    const locked = new Map([["typescript", "5.1.0"]]);
    const { drifted, pinned } = detectDrift(deps, locked);
    // exact version "5.0.0" locked at "5.1.0" — doesn't satisfy exact range
    expect(drifted).toHaveLength(1);
    // still pinned
    expect(pinned).toHaveLength(1);
  });
});

describe("detectDrift — mixed scenarios", () => {
  it("handles a realistic mix of clean, drifted, and pinned deps", () => {
    const deps = {
      react: "^17.0.0",       // drifted — locked at 18.2.0
      lodash: "^4.0.0",       // clean — locked at 4.17.21
      typescript: "5.0.0",    // pinned + clean (exact match)
      prettier: "3.0.0",      // pinned + drifted (locked at 3.1.0)
    };
    const locked = new Map([
      ["react", "18.2.0"],
      ["lodash", "4.17.21"],
      ["typescript", "5.0.0"],
      ["prettier", "3.1.0"],
    ]);
    const { drifted, pinned } = detectDrift(deps, locked);

    const driftedNames = drifted.map((d) => d.name);
    expect(driftedNames).toContain("react");
    expect(driftedNames).not.toContain("lodash");
    expect(driftedNames).toContain("prettier"); // exact pin, locked version doesn't match

    const pinnedNames = pinned.map((p) => p.name);
    expect(pinnedNames).toContain("typescript");
    expect(pinnedNames).toContain("prettier");
    expect(pinnedNames).not.toContain("react");
    expect(pinnedNames).not.toContain("lodash");
  });
});
