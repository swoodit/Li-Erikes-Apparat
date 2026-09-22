import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /health", () => {
  it("reports readiness", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
