import { describe, expect, it } from "vitest";
import {
  CustomerBookingRequestSchema,
  PartOfferObservationSchema,
  QuoteRevisionInputSchema,
  StaffReviewDecisionSchema,
} from "../src/service-workflow.js";

const validBooking = {
  customer: { name: "Ada Example", email: "ada@example.com" },
  vehicle: {
    registration: "ABC123",
    make: "Volvo",
    model: "V60",
    modelYear: 2021,
  },
  serviceType: "seasonal_tyres",
  preferredSlot: {
    startsAt: "2026-10-12T08:00:00+02:00",
    endsAt: "2026-10-12T09:00:00+02:00",
  },
};

describe("customer booking contracts", () => {
  it("accepts a valid request while leaving the requested slot unconfirmed", () => {
    expect(CustomerBookingRequestSchema.safeParse(validBooking).success).toBe(true);
  });

  it("requires a contact route and a positive time range", () => {
    expect(
      CustomerBookingRequestSchema.safeParse({
        ...validBooking,
        customer: { name: "Ada Example" },
      }).success,
    ).toBe(false);
    expect(
      CustomerBookingRequestSchema.safeParse({
        ...validBooking,
        preferredSlot: {
          startsAt: "2026-10-12T09:00:00+02:00",
          endsAt: "2026-10-12T08:00:00+02:00",
        },
      }).success,
    ).toBe(false);
  });
});

describe("parts and quote contracts", () => {
  it("requires retrieval timestamps for live supplier observations", () => {
    const result = PartOfferObservationSchema.safeParse({
      sourceName: "Nordic Parts API",
      source: "live",
      state: "current",
      offers: [
        {
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
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("validates SEK quote amounts and bounded quantities", () => {
    expect(
      QuoteRevisionInputSchema.safeParse({
        revision: 1,
        currency: "SEK",
        laborMinor: 5_000,
        lines: [
          {
            description: "Brake pads",
            quantity: 2,
            supplierUnitCostMinor: 10_000,
            markupBasisPoints: 1_250,
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      QuoteRevisionInputSchema.safeParse({
        revision: 1,
        currency: "EUR",
        laborMinor: 5_000,
        lines: [],
      }).success,
    ).toBe(false);
  });

  it("requires a quote when staff offer a revision", () => {
    expect(
      StaffReviewDecisionSchema.safeParse({
        action: "offer_revision",
        reason: "Corrected part choice",
      }).success,
    ).toBe(false);
  });
});
