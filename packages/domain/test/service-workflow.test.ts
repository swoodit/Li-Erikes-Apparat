import { describe, expect, it } from "vitest";
import {
  calculateQuote,
  createPartOfferObservation,
  InvalidTransitionError,
  money,
  sek,
  transitionAppointment,
  transitionServiceRequest,
} from "../src/index.js";
import type {
  PartOfferCandidate,
  PartOfferObservationInput,
} from "../src/index.js";

const candidate: PartOfferCandidate = {
  id: "offer-1",
  supplier: "Nordic Parts",
  partNumber: "BRK-42",
  priceMinor: 10_000,
  shippingMinor: 500,
  fitment: "confirmed",
  availability: "in_stock",
  deliveryDays: 2,
  observedAt: "2026-10-01T10:00:00.000Z",
  source: "live",
};

describe("service request lifecycle", () => {
  it("requires customer acceptance of a revision before staff confirmation", () => {
    expect(transitionServiceRequest("requested", "beginReview")).toBe(
      "under_review",
    );
    expect(transitionServiceRequest("under_review", "offerRevision")).toBe(
      "revision_offered",
    );
    expect(() =>
      transitionServiceRequest("revision_offered", "confirm"),
    ).toThrow(InvalidTransitionError);
    expect(transitionServiceRequest("revision_offered", "acceptRevision")).toBe(
      "customer_accepted",
    );
    expect(transitionServiceRequest("customer_accepted", "confirm")).toBe(
      "confirmed",
    );
  });

  it("keeps cancelled and declined requests terminal", () => {
    expect(() => transitionServiceRequest("cancelled", "beginReview")).toThrow(
      InvalidTransitionError,
    );
    expect(() => transitionServiceRequest("declined", "confirm")).toThrow(
      InvalidTransitionError,
    );
  });
});

describe("appointment lifecycle", () => {
  it("does not treat a requested time as confirmed", () => {
    expect(transitionAppointment("requested", "confirm")).toBe("confirmed");
    expect(transitionAppointment("confirmed", "complete")).toBe("completed");
    expect(() => transitionAppointment("completed", "cancel")).toThrow(
      InvalidTransitionError,
    );
  });
});

describe("calculateQuote", () => {
  it("keeps supplier cost, rounded markup, labor, and customer total itemized", () => {
    const quote = calculateQuote(
      [
        {
          description: "Brake pads",
          quantity: 2,
          supplierUnitCost: sek(999),
          markupBasisPoints: 1_250,
        },
      ],
      sek(5_000),
    );

    expect(quote.lines[0]).toMatchObject({
      supplierSubtotal: { currency: "SEK", minor: 1_998 },
      markup: { currency: "SEK", minor: 250 },
      customerPartsTotal: { currency: "SEK", minor: 2_248 },
    });
    expect(quote.supplierParts).toEqual(sek(1_998));
    expect(quote.markup).toEqual(sek(250));
    expect(quote.labor).toEqual(sek(5_000));
    expect(quote.total).toEqual(sek(7_248));
  });

  it("rounds half minor units upward deterministically", () => {
    const quote = calculateQuote(
      [
        {
          description: "Washer",
          quantity: 1,
          supplierUnitCost: sek(1),
          markupBasisPoints: 5_000,
        },
      ],
      sek(0),
    );

    expect(quote.markup.minor).toBe(1);
  });

  it("rejects invalid quantities, negative markup, and non-SEK values", () => {
    expect(() =>
      calculateQuote(
        [
          {
            description: "Brake pads",
            quantity: 0,
            supplierUnitCost: sek(100),
            markupBasisPoints: 0,
          },
        ],
        sek(0),
      ),
    ).toThrow(RangeError);

    expect(() =>
      calculateQuote(
        [
          {
            description: "Brake pads",
            quantity: 1,
            supplierUnitCost: sek(100),
            markupBasisPoints: -1,
          },
        ],
        sek(0),
      ),
    ).toThrow(RangeError);

    expect(() =>
      calculateQuote(
        [
          {
            description: "Brake pads",
            quantity: 1,
            supplierUnitCost: money("EUR", 100) as never,
            markupBasisPoints: 0,
          },
        ],
        sek(0),
      ),
    ).toThrow();
  });
});

describe("createPartOfferObservation", () => {
  it("requires a valid retrieval time for live observations", () => {
    const observation = createPartOfferObservation({
      source: "live",
      sourceName: "Nordic Parts API",
      state: "current",
      retrievedAt: "2026-10-01T10:00:00.000Z",
      offers: [candidate],
    });

    expect(observation.retrievedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(() =>
      createPartOfferObservation({
        source: "live",
        sourceName: "Nordic Parts API",
        state: "current",
        offers: [candidate],
      } as unknown as PartOfferObservationInput),
    ).toThrow(RangeError);
  });

  it("keeps unavailable and no-match results distinct from an empty success", () => {
    expect(
      createPartOfferObservation({
        source: "live",
        sourceName: "Nordic Parts API",
        state: "unavailable",
        retrievedAt: "2026-10-01T10:00:00.000Z",
        offers: [],
      }).state,
    ).toBe("unavailable");

    expect(() =>
      createPartOfferObservation({
        source: "manual",
        sourceName: "Workshop entry",
        state: "current",
        offers: [],
      }),
    ).toThrow(RangeError);
  });
});
