export type PartOfferSource = "live" | "manual" | "sample";

export type PartOfferCandidate = {
  id: string;
  supplier: string;
  partNumber: string;
  priceMinor: number;
  shippingMinor: number;
  fitment: "confirmed" | "unknown" | "incompatible";
  availability: "in_stock" | "out_of_stock" | "unknown";
  deliveryDays: number;
  observedAt: string;
  source: PartOfferSource;
};

export type PartOfferResultState =
  "current" | "stale" | "unavailable" | "unknown" | "no_match" | "out_of_stock";

type LivePartOfferObservationInput = Readonly<{
  source: "live";
  sourceName: string;
  state: PartOfferResultState;
  retrievedAt: string;
  offers: readonly PartOfferCandidate[];
}>;

type NonLivePartOfferObservationInput = Readonly<{
  source: "manual" | "sample";
  sourceName: string;
  state: PartOfferResultState;
  retrievedAt?: string;
  offers: readonly PartOfferCandidate[];
}>;

export type PartOfferObservationInput =
  LivePartOfferObservationInput | NonLivePartOfferObservationInput;

export type PartOfferObservation = PartOfferObservationInput;

export type ComparedPartOffer = PartOfferCandidate & {
  deliveredPriceMinor: number | null;
  rank: number | null;
  orderable: boolean;
  reason: string | null;
};

/**
 * Validate a provider observation without turning missing data into an empty
 * success.
 */
export function createPartOfferObservation(
  input: PartOfferObservationInput,
): PartOfferObservation {
  if (input.sourceName.trim().length === 0) {
    throw new RangeError("Offer source name is required");
  }

  if (
    input.source === "live" &&
    (!input.retrievedAt || !Number.isFinite(Date.parse(input.retrievedAt)))
  ) {
    throw new RangeError(
      "Live offer observations require a valid retrieval time",
    );
  }

  if (
    input.retrievedAt !== undefined &&
    !Number.isFinite(Date.parse(input.retrievedAt))
  ) {
    throw new RangeError("Offer retrieval time must be a valid date");
  }

  if (
    (input.state === "current" || input.state === "stale") &&
    input.offers.length === 0
  ) {
    throw new RangeError(
      `${input.state} offer observations require at least one offer`,
    );
  }

  if (
    (input.state === "unavailable" || input.state === "no_match") &&
    input.offers.length > 0
  ) {
    throw new RangeError(`${input.state} observations cannot include offers`);
  }

  if (
    input.state === "out_of_stock" &&
    input.offers.some((offer) => offer.availability === "in_stock")
  ) {
    throw new RangeError(
      "Out-of-stock observations cannot include in-stock offers",
    );
  }

  if (input.offers.some((offer) => offer.source !== input.source)) {
    throw new RangeError("Offer source kind must match its observation");
  }

  return {
    ...input,
    sourceName: input.sourceName.trim(),
    offers: [...input.offers],
  };
}

/**
 * Rank offers that are safe to compare, while retaining excluded offers and
 * their reason so the workshop can see why a result was not recommended.
 */
export function comparePartOffers(
  offers: readonly PartOfferCandidate[],
  asOf: Date,
  maxAgeMinutes: number,
): ComparedPartOffer[] {
  if (!Number.isFinite(asOf.getTime())) {
    throw new RangeError("Comparison time must be a valid date");
  }

  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes < 0) {
    throw new RangeError("Maximum offer age must be zero or greater");
  }

  const assessed: ComparedPartOffer[] = offers.map((offer) => {
    const hasValidPrice =
      Number.isSafeInteger(offer.priceMinor) &&
      offer.priceMinor >= 0 &&
      Number.isSafeInteger(offer.shippingMinor) &&
      offer.shippingMinor >= 0;
    const deliveredPriceMinor = hasValidPrice
      ? offer.priceMinor + offer.shippingMinor
      : null;
    const hasSafeTotal =
      deliveredPriceMinor !== null && Number.isSafeInteger(deliveredPriceMinor);
    const observedAt = Date.parse(offer.observedAt);
    const ageMinutes = (asOf.getTime() - observedAt) / 60_000;

    let reason: string | null = null;

    if (offer.fitment !== "confirmed") {
      reason =
        offer.fitment === "incompatible"
          ? "Offer does not fit this vehicle"
          : "Vehicle fitment is not confirmed";
    } else if (offer.availability !== "in_stock") {
      reason =
        offer.availability === "out_of_stock"
          ? "Out of stock"
          : "Stock availability is not confirmed";
    } else if (!hasValidPrice || !hasSafeTotal) {
      reason = "Price or shipping cost is invalid";
    } else if (
      !Number.isSafeInteger(offer.deliveryDays) ||
      offer.deliveryDays < 0
    ) {
      reason = "Delivery estimate is missing or invalid";
    } else if (!Number.isFinite(observedAt)) {
      reason = "Offer freshness could not be verified";
    } else if (ageMinutes < 0) {
      reason = "Offer timestamp is in the future";
    } else if (ageMinutes > maxAgeMinutes) {
      reason = "Offer is stale";
    }

    return {
      ...offer,
      deliveredPriceMinor: hasSafeTotal ? deliveredPriceMinor : null,
      rank: null,
      orderable: false,
      reason,
    };
  });

  const ranked = assessed
    .filter((offer) => offer.reason === null)
    .sort((left, right) => {
      const priceDifference =
        (left.deliveredPriceMinor ?? 0) - (right.deliveredPriceMinor ?? 0);
      const deliveryDifference = left.deliveryDays - right.deliveryDays;

      return (
        priceDifference ||
        deliveryDifference ||
        left.supplier.localeCompare(right.supplier) ||
        left.id.localeCompare(right.id)
      );
    });

  const rankedResults = ranked.map((offer, index) => ({
    ...offer,
    rank: index + 1,
    orderable: offer.source === "live",
  }));
  const excludedResults = assessed.filter((offer) => offer.reason !== null);

  return [...rankedResults, ...excludedResults];
}
