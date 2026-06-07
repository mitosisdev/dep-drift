import { describe, it, expect } from "bun:test";
import { parsePackageJson, parseLockfile } from "../src/parser";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `dep-drift-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("parsePackageJson", () => {
  it("parses dependencies and devDependencies into a merged deps map", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "my-app",
        dependencies: { react: "^17.0.0", lodash: "^4.0.0" },
        devDependencies: { typescript: "5.0.0", prettier: "3.0.0" },
      })
    );

    const result = parsePackageJson(join(dir, "package.json"));
    expect(result.name).toBe("my-app");
    expect(result.deps["react"]).toBe("^17.0.0");
    expect(result.deps["lodash"]).toBe("^4.0.0");
    expect(result.deps["typescript"]).toBe("5.0.0");
    expect(result.deps["prettier"]).toBe("3.0.0");
  });

  it("handles package.json with only dependencies (no devDependencies)", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "lib-only",
        dependencies: { axios: "^1.0.0" },
      })
    );

    const result = parsePackageJson(join(dir, "package.json"));
    expect(result.name).toBe("lib-only");
    expect(result.deps["axios"]).toBe("^1.0.0");
    expect(Object.keys(result.deps).length).toBe(1);
  });

  it("handles package.json with only devDependencies", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "dev-only",
        devDependencies: { vitest: "^1.0.0" },
      })
    );

    const result = parsePackageJson(join(dir, "package.json"));
    expect(result.deps["vitest"]).toBe("^1.0.0");
  });

  it("handles package.json with no dependencies at all", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "empty-pkg" })
    );

    const result = parsePackageJson(join(dir, "package.json"));
    expect(result.name).toBe("empty-pkg");
    expect(Object.keys(result.deps).length).toBe(0);
  });
});

describe("parseLockfile", () => {
  it("parses package-lock.json v3 format into name→version map", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "my-app" },
          "node_modules/react": { version: "18.2.0" },
          "node_modules/lodash": { version: "3.10.1" },
        },
      })
    );

    const result = parseLockfile(join(dir, "package-lock.json"));
    expect(result.get("react")).toBe("18.2.0");
    expect(result.get("lodash")).toBe("3.10.1");
    // root package entry ("") should not appear
    expect(result.has("")).toBe(false);
  });

  it("handles scoped packages (e.g. @types/node)", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "my-app" },
          "node_modules/@types/node": { version: "20.0.0" },
          "node_modules/@babel/core": { version: "7.22.0" },
        },
      })
    );

    const result = parseLockfile(join(dir, "package-lock.json"));
    expect(result.get("@types/node")).toBe("20.0.0");
    expect(result.get("@babel/core")).toBe("7.22.0");
  });

  it("returns an empty map for a lockfile with no packages", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: { "": { name: "empty" } },
      })
    );

    const result = parseLockfile(join(dir, "package-lock.json"));
    expect(result.size).toBe(0);
  });
});
