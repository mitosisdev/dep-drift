// tests/hello.test.ts
import { test, expect } from "bun:test";
import { hello } from "../src/hello";

test("hello greets the world by default", () => {
  expect(hello()).toBe("hello, world");
});

test("hello greets a given name", () => {
  expect(hello("mito")).toBe("hello, mito");
});
