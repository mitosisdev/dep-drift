// tests/cli.test.ts — tests for CLI arg parsing + exit-code logic
import { test, expect, describe } from "bun:test";
import { parseArgs, run } from "../src/cli";
import type { Report, Finding } from "../src/types";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------
describe("parseArgs", () => {
  test("defaults to text format, no fail-on, cwd = process.cwd()", () => {
    const opts = parseArgs([]);
    expect(opts.format).toBe("text");
    expect(opts.failOn).toBeUndefined();
    expect(opts.cwd).toBe(process.cwd());
  });

  test("--format json", () => {
    const opts = parseArgs(["--format", "json"]);
    expect(opts.format).toBe("json");
  });

  test("--format text", () => {
    const opts = parseArgs(["--format", "text"]);
    expect(opts.format).toBe("text");
  });

  test("-f json shorthand", () => {
    const opts = parseArgs(["-f", "json"]);
    expect(opts.format).toBe("json");
  });

  test("--fail-on drift", () => {
    const opts = parseArgs(["--fail-on", "drift"]);
    expect(opts.failOn).toBe("drift");
  });

  test("--fail-on unused", () => {
    const opts = parseArgs(["--fail-on", "unused"]);
    expect(opts.failOn).toBe("unused");
  });

  test("--fail-on outdated", () => {
    const opts = parseArgs(["--fail-on", "outdated"]);
    expect(opts.failOn).toBe("outdated");
  });

  test("positional arg sets cwd", () => {
    const opts = parseArgs(["/some/path"]);
    expect(opts.cwd).toBe("/some/path");
  });

  test("combined flags: --format json --fail-on drift", () => {
    const opts = parseArgs(["--format", "json", "--fail-on", "drift"]);
    expect(opts.format).toBe("json");
    expect(opts.failOn).toBe("drift");
  });

  test("throws on unknown flag", () => {
    expect(() => parseArgs(["--unknown"])).toThrow();
  });

  test("throws on bad --format value", () => {
    expect(() => parseArgs(["--format", "csv"])).toThrow();
  });

  test("throws on bad --fail-on value", () => {
    expect(() => parseArgs(["--fail-on", "broken"])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// run() — integration using injected registry + temp package.json
// ---------------------------------------------------------------------------

/** Create a temp dir with a package.json containing the given deps */
function makeTempProject(deps: Record<string, string> = {}): string {
  const dir = join(tmpdir(), `dep-drift-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test-pkg", version: "1.0.0", dependencies: deps }));
  return dir;
}

/** Fake registry: always returns the provided version */
function fakeRegistry(latestVersion: string) {
  return async (_name: string): Promise<string | null> => latestVersion;
}

describe("run() — exit codes", () => {
  test("exit 0 when no findings and no --fail-on", async () => {
    const dir = makeTempProject({});
    const { exitCode } = await run({ format: "text", cwd: dir });
    expect(exitCode).toBe(0);
  });

  test("exit 0 when findings exist but no --fail-on", async () => {
    // Create a project with a dep that has no node_modules (will be unused)
    const dir = makeTempProject({ "some-dep": "^1.0.0" });
    const { exitCode } = await run({ format: "text", cwd: dir }, fakeRegistry("1.0.0"));
    expect(exitCode).toBe(0);
  });

  test("--fail-on drift: exit 1 when drift finding present", async () => {
    const dir = makeTempProject({ "my-lib": "^2.0.0" });
    // Simulate installed = 1.5.0 by creating a fake node_modules package
    const nmDir = join(dir, "node_modules", "my-lib");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "package.json"), JSON.stringify({ name: "my-lib", version: "1.5.0" }));

    const { exitCode } = await run(
      { format: "text", failOn: "drift", cwd: dir },
      fakeRegistry("2.0.0"),
    );
    expect(exitCode).toBe(1);
  });

  test("--fail-on drift: exit 0 when no drift", async () => {
    const dir = makeTempProject({ "my-lib": "^2.0.0" });
    const nmDir = join(dir, "node_modules", "my-lib");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "package.json"), JSON.stringify({ name: "my-lib", version: "2.0.0" }));

    const { exitCode } = await run(
      { format: "text", failOn: "drift", cwd: dir },
      fakeRegistry("2.0.0"),
    );
    expect(exitCode).toBe(0);
  });

  test("--fail-on outdated: exit 1 when package behind latest", async () => {
    const dir = makeTempProject({ "cool-lib": "^1.0.0" });
    const nmDir = join(dir, "node_modules", "cool-lib");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "package.json"), JSON.stringify({ name: "cool-lib", version: "1.0.0" }));

    // latest is 1.5.0 — installed is behind
    const { exitCode } = await run(
      { format: "text", failOn: "outdated", cwd: dir },
      fakeRegistry("1.5.0"),
    );
    expect(exitCode).toBe(1);
  });

  test("--fail-on unused: exit 1 when unused dep present", async () => {
    const dir = makeTempProject({ "never-imported": "^1.0.0" });
    const nmDir = join(dir, "node_modules", "never-imported");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "package.json"), JSON.stringify({ name: "never-imported", version: "1.0.0" }));

    const { exitCode } = await run(
      { format: "text", failOn: "unused", cwd: dir },
      fakeRegistry("1.0.0"),
    );
    expect(exitCode).toBe(1);
  });
});

describe("run() — JSON output", () => {
  test("--format json produces valid JSON string", async () => {
    const dir = makeTempProject({});
    const { output } = await run({ format: "json", cwd: dir });
    expect(() => JSON.parse(output)).not.toThrow();
  });

  test("--format json findings array present", async () => {
    const dir = makeTempProject({});
    const { output } = await run({ format: "json", cwd: dir });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("findings");
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  test("--format json + --fail-on drift: JSON output AND exit code 1", async () => {
    const dir = makeTempProject({ "versioned-pkg": "^3.0.0" });
    const nmDir = join(dir, "node_modules", "versioned-pkg");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "package.json"), JSON.stringify({ name: "versioned-pkg", version: "2.9.0" }));

    const { output, exitCode } = await run(
      { format: "json", failOn: "drift", cwd: dir },
      fakeRegistry("3.0.0"),
    );
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(output);
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.findings[0].type).toBe("drift");
  });

  test("drift finding in JSON has correct shape", async () => {
    const dir = makeTempProject({ "shaped-pkg": "^5.0.0" });
    const nmDir = join(dir, "node_modules", "shaped-pkg");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "package.json"), JSON.stringify({ name: "shaped-pkg", version: "4.8.0" }));

    const { output } = await run(
      { format: "json", cwd: dir },
      fakeRegistry("5.0.0"),
    );
    const parsed = JSON.parse(output);
    const finding = parsed.findings.find((f: Finding) => f.name === "shaped-pkg");
    expect(finding).toBeDefined();
    expect(finding.name).toBe("shaped-pkg");
    expect(finding.installed).toBe("4.8.0");
    expect(finding.wanted).toBe("^5.0.0");
    expect(finding.latest).toBe("5.0.0");
    expect(finding.depType).toBe("dependencies");
    expect(finding.type).toBe("drift");
  });
});
