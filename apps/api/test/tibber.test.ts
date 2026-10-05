import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import {
  TibberApiError,
  TibberClient,
  type TibberFetch,
  type TibberGateway,
  type TibberPriceResponse,
} from "../src/integrations/tibber";

const homeEnergyApiKey = "test-home-energy-key";

function fakeGateway(counters?: {
  homes?: () => void;
  prices?: () => void;
}): TibberGateway {
  return {
    homes: async () => {
      counters?.homes?.();
      return [{ id: "home-1", appNickname: "Home" }];
    },
    prices: async (homeId): Promise<TibberPriceResponse> => {
      counters?.prices?.();
      return {
        id: homeId,
        currentSubscription: {
          id: "subscription-1",
          status: "RUNNING",
          priceInfo: {
            current: null,
            today: [
              {
                total: 0.5,
                energy: 0.3,
                tax: 0.2,
                startsAt: "2026-10-05T19:45:00+02:00",
                currency: "SEK",
                level: "CHEAP",
              },
              {
                total: 0.8,
                energy: 0.6,
                tax: 0.2,
                startsAt: "2026-10-05T20:00:00+02:00",
                currency: "SEK",
                level: "NORMAL",
              },
            ],
            tomorrow: [
              {
                total: 0.4,
                energy: 0.2,
                tax: 0.2,
                startsAt: "2026-10-06T00:00:00+02:00",
                currency: "SEK",
                level: "CHEAP",
              },
            ],
          },
        },
      };
    },
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

function authorizedHeaders() {
  return { "x-home-energy-key": homeEnergyApiKey };
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
  it("reports whether Tibber and route protection are configured", async () => {
    const response = await buildApp({
      tibber: fakeGateway(),
      tibberRoutes: { homeEnergyApiKey },
    }).inject({
      method: "GET",
      url: "/api/energy/tibber/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      configured: true,
      protected: true,
    });
  });

  it("rejects account-level Tibber data without authentication", async () => {
    const response = await buildApp({
      tibber: fakeGateway(),
      tibberRoutes: { homeEnergyApiKey },
    }).inject({
      method: "GET",
      url: "/api/energy/tibber/homes",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });

  it("uses the configured home-energy key for account routes", async () => {
    const response = await buildApp({
      tibber: fakeGateway(),
      tibberRoutes: {
        clock: () => new Date("2026-10-05T19:50:00+02:00"),
        homeEnergyApiKey,
      },
    }).inject({
      headers: authorizedHeaders(),
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

  it("uses the configured default home without relying on API order", async () => {
    let homesCalls = 0;
    const app = buildApp({
      tibber: fakeGateway({
        homes: () => {
          homesCalls += 1;
        },
      }),
      tibberRoutes: {
        clock: () => new Date("2026-10-05T19:50:00+02:00"),
        defaultHomeId: "li-erikes-home",
        homeEnergyApiKey,
      },
    });

    const response = await app.inject({
      headers: authorizedHeaders(),
      method: "GET",
      url: "/api/energy/tibber/prices",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe("li-erikes-home");
    expect(homesCalls).toBe(0);
  });

  it("caches home lookup and price schedules", async () => {
    let homesCalls = 0;
    let priceCalls = 0;
    const app = buildApp({
      tibber: fakeGateway({
        homes: () => {
          homesCalls += 1;
        },
        prices: () => {
          priceCalls += 1;
        },
      }),
      tibberRoutes: {
        clock: () => new Date("2026-10-05T19:50:00+02:00"),
        homeEnergyApiKey,
      },
    });

    for (let index = 0; index < 2; index += 1) {
      const response = await app.inject({
        headers: authorizedHeaders(),
        method: "GET",
        url: "/api/energy/tibber/prices",
      });
      expect(response.statusCode).toBe(200);
    }

    expect(homesCalls).toBe(1);
    expect(priceCalls).toBe(1);
  });

  it("validates the daily consumption window", async () => {
    const response = await buildApp({
      tibber: fakeGateway(),
      tibberRoutes: { homeEnergyApiKey },
    }).inject({
      headers: authorizedHeaders(),
      method: "GET",
      url: "/api/energy/tibber/consumption?days=32",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_days",
    });
  });
});
