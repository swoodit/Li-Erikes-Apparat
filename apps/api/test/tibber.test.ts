import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import {
  TibberApiError,
  TibberClient,
  type TibberFetch,
  type TibberGateway,
} from "../src/integrations/tibber";

function fakeGateway(): TibberGateway {
  return {
    homes: async () => [{ id: "home-1", appNickname: "Home" }],
    prices: async (homeId) => ({
      id: homeId,
      currentSubscription: {
        id: "subscription-1",
        status: "RUNNING",
        priceInfo: {
          current: {
            total: 0.5,
            energy: 0.3,
            tax: 0.2,
            startsAt: "2026-10-05T19:45:00+02:00",
            currency: "SEK",
            level: "CHEAP",
          },
          today: [],
          tomorrow: [],
        },
      },
    }),
    consumption: async (homeId, days) => ({
      id: homeId,
      consumption: {
        nodes: [],
        pageInfo: {
          count: days,
          totalConsumption: 12.5,
          totalCost: 8.2,
          currency: "SEK",
        },
      },
    }),
  };
}

describe("TibberClient", () => {
  it("authenticates and returns visible homes", async () => {
    let authorization: string | null = null;
    let requestBody = "";

    const fakeFetch: TibberFetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("authorization");
      requestBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              homes: [{ id: "home-1", appNickname: "Home" }],
            },
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    };

    const client = new TibberClient({
      token: "test-token",
      fetch: fakeFetch,
    });

    await expect(client.homes()).resolves.toEqual([
      { id: "home-1", appNickname: "Home" },
    ]);
    expect(authorization).toBe("Bearer test-token");
    expect(requestBody).toContain("query Homes");
  });

  it("surfaces GraphQL errors", async () => {
    const client = new TibberClient({
      token: "secret-token",
      fetch: async () =>
        new Response(
          JSON.stringify({
            errors: [{ message: "No active subscription" }],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
    });

    await expect(client.homes()).rejects.toThrow(
      new TibberApiError("Tibber GraphQL error: No active subscription"),
    );
  });
});

describe("Tibber energy routes", () => {
  it("reports missing configuration without a token", async () => {
    const response = await buildApp({ tibber: null }).inject({
      method: "GET",
      url: "/api/energy/tibber/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      configured: false,
      connected: false,
    });
  });

  it("uses the first visible home for prices", async () => {
    const response = await buildApp({ tibber: fakeGateway() }).inject({
      method: "GET",
      url: "/api/energy/tibber/prices",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "home-1",
      currentSubscription: {
        priceInfo: {
          current: {
            currency: "SEK",
            level: "CHEAP",
            total: 0.5,
          },
        },
      },
    });
  });

  it("validates the daily consumption window", async () => {
    const response = await buildApp({ tibber: fakeGateway() }).inject({
      method: "GET",
      url: "/api/energy/tibber/consumption?days=32",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_days",
    });
  });
});
