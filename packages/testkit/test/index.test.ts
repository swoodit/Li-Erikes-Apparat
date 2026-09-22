import { describe, expect, it } from "vitest";
import { fixedClock, fixedId } from "../src/index";

describe("testkit deterministic helpers", () => {
  it("returns a fresh Date for the configured instant", () => {
    const clock = fixedClock("2026-09-21T12:34:56.000Z");
    const first = clock();
    first.setUTCFullYear(2000);

    expect(clock()).toEqual(new Date("2026-09-21T12:34:56.000Z"));
  });

  it("returns the configured id on every call", () => {
    const id = fixedId("test-id");

    expect(id()).toBe("test-id");
    expect(id()).toBe("test-id");
  });
});
