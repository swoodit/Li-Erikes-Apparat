import { describe, expect, it } from "vitest";
import { buildEnergyAdvice } from "../src/energy-intelligence";
import type {
  TibberPrice,
  TibberPriceResponse,
} from "../src/integrations/tibber";

function price(startsAt: string, total: number): TibberPrice {
  return {
    total,
    energy: total,
    tax: 0,
    startsAt,
    currency: "SEK",
    level: null,
  };
}

function response(
  current: TibberPrice,
  today: readonly TibberPrice[],
): TibberPriceResponse {
  return {
    id: "home-1",
    currentSubscription: {
      id: "subscription-1",
      status: "RUNNING",
      priceInfo: {
        current,
        today,
        tomorrow: [],
      },
    },
  };
}

describe("energy intelligence", () => {
  it("finds the cheapest contiguous windows", () => {
    const prices = [
      price("2026-10-05T19:45:00+02:00", 0.8),
      price("2026-10-05T20:00:00+02:00", 0.7),
      price("2026-10-05T20:15:00+02:00", 0.2),
      price("2026-10-05T20:30:00+02:00", 0.1),
      price("2026-10-05T20:45:00+02:00", 0.1),
      price("2026-10-05T21:00:00+02:00", 0.2),
      price("2026-10-05T21:15:00+02:00", 0.6),
      price("2026-10-05T21:30:00+02:00", 0.7),
    ];

    const advice = buildEnergyAdvice(
      response(prices[0], prices),
      new Date("2026-10-05T19:50:00+02:00"),
    );

    expect(advice.cheapestWindows.minutes30).toMatchObject({
      startsAt: "2026-10-05T20:30:00+02:00",
      average: 0.1,
    });
    expect(advice.cheapestWindows.minutes60).toMatchObject({
      startsAt: "2026-10-05T20:15:00+02:00",
      average: 0.15,
    });
  });

  it("recommends running now when the current slot is very cheap", () => {
    const current: TibberPrice = {
      ...price("2026-10-05T22:15:00+02:00", 0.0543),
      level: "VERY_CHEAP",
    };
    const prices = [
      current,
      price("2026-10-05T22:30:00+02:00", 0.4),
      price("2026-10-05T22:45:00+02:00", 0.5),
      price("2026-10-05T23:00:00+02:00", 0.6),
    ];

    const advice = buildEnergyAdvice(
      response(current, prices),
      new Date("2026-10-05T22:20:00+02:00"),
    );

    expect(advice.recommendation.action).toBe("run_now");
    expect(advice.current?.total).toBe(0.0543);
  });

  it("recommends waiting for a materially cheaper hour", () => {
    const prices = [
      price("2026-10-05T19:45:00+02:00", 1.0),
      price("2026-10-05T20:00:00+02:00", 0.9),
      price("2026-10-05T20:15:00+02:00", 0.2),
      price("2026-10-05T20:30:00+02:00", 0.2),
      price("2026-10-05T20:45:00+02:00", 0.2),
      price("2026-10-05T21:00:00+02:00", 0.2),
    ];

    const advice = buildEnergyAdvice(
      response(prices[0], prices),
      new Date("2026-10-05T19:50:00+02:00"),
    );

    expect(advice.recommendation).toMatchObject({
      action: "wait",
      nextCheaperAt: "2026-10-05T20:15:00+02:00",
    });
  });
});
