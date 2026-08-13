import { describe, it, expect } from "vitest";
import { getConfig } from "../src/config/env.ts";

describe("getConfig", () => {
  it("throws when JWT_SECRET is missing", () => {
    expect(() => getConfig({})).toThrow(/JWT_SECRET/);
  });

  it("returns config with JWT_SECRET when provided", () => {
    const config = getConfig({ JWT_SECRET: "test-secret" });
    expect(config.JWT_SECRET).toBe("test-secret");
  });

  it("throws when JWT_SECRET is empty string", () => {
    expect(() => getConfig({ JWT_SECRET: "" })).toThrow(/JWT_SECRET/);
  });
});
