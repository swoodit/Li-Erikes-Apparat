import { describe, expect, it } from "vitest";
import { comparePartOffers } from "../src/part-offers.js";
import type { PartOfferCandidate } from "../src/part-offers.js";

const now = new Date("2026-09-29T12:00:00.000Z");

function offer(
  id: string,
  overrides: Partial<PartOfferCandidate> = {},
): PartOfferCandidate {
  return {
    id,
    supplier: `Supplier ${id}`,
    partNumber: `PART-${id}`,
    priceMinor: 10_000,
    shippingMinor: 0,
    fitment: "confirmed",
    availability: "in_stock",
    deliveryDays: 2,
    observedAt: "2026-09-29T11:00:00.000Z",
    source: "manual",
    ...overrides,
  };
}

describe("comparePartOffers", () => {
  it("sorts eligible offers by delivered price, then delivery time", () => {
    const result = comparePartOffers(
      [
        offer("slow", { priceMinor: 10_000, deliveryDays: 4 }),
        offer("fast", {
          priceMinor: 9_500,
          shippingMinor: 500,
          deliveryDays: 1,
        }),
        offer("cheapest", {
          priceMinor: 9_000,
          shippingMinor: 500,
          deliveryDays: 3,
        }),
      ],
      now,
      180,
    );

    expect(result.map((item) => item.id)).toEqual(["cheapest", "fast", "slow"]);
    expect(result.map((item) => item.deliveredPriceMinor)).toEqual([
      9_500, 10_000, 10_000,
    ]);
    expect(result[0]?.rank).toBe(1);
    expect(result[1]?.rank).toBe(2);
  });

  it("keeps unsafe or stale offers visible with a reason but outside the ranked choices", () => {
    const result = comparePartOffers(
      [
        offer("ready"),
        offer("unknown-fitment", { fitment: "unknown" }),
        offer("out-of-stock", { availability: "out_of_stock" }),
        offer("stale", { observedAt: "2026-09-29T08:00:00.000Z" }),
      ],
      now,
      180,
    );

    expect(result.slice(0, 1).map((item) => item.id)).toEqual(["ready"]);
    expect(result.slice(1).every((item) => item.rank === null)).toBe(true);
    expect(
      result.find((item) => item.id === "unknown-fitment")?.reason,
    ).toMatch(/fitment/i);
    expect(result.find((item) => item.id === "out-of-stock")?.reason).toMatch(
      /stock/i,
    );
    expect(result.find((item) => item.id === "stale")?.reason).toMatch(
      /stale/i,
    );
  });

  it("allows sample offers in the comparison preview but never marks them orderable", () => {
    const result = comparePartOffers(
      [offer("sample", { source: "sample" })],
      now,
      180,
    );

    expect(result[0]?.rank).toBe(1);
    expect(result[0]?.orderable).toBe(false);
    expect(result[0]?.source).toBe("sample");
  });

  it("does not mark a live or manually sourced offer orderable when it is stale", () => {
    const result = comparePartOffers(
      [
        offer("stale-live", {
          source: "live",
          observedAt: "2026-09-29T08:00:00.000Z",
        }),
      ],
      now,
      180,
    );

    expect(result[0]?.rank).toBeNull();
    expect(result[0]?.orderable).toBe(false);
  });
});
