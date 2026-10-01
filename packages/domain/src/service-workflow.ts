import { addMoney, type Money, sek } from "./money.js";
import { transition } from "./state-machine.js";

export const serviceTypes = [
  "seasonal_tyres",
  "scheduled_maintenance",
] as const;
export type ServiceType = (typeof serviceTypes)[number];

export const serviceRequestTransitions = {
  requested: {
    beginReview: "under_review",
    decline: "declined",
    cancel: "cancelled",
  },
  under_review: {
    offerRevision: "revision_offered",
    confirm: "confirmed",
    decline: "declined",
    cancel: "cancelled",
  },
  revision_offered: {
    acceptRevision: "customer_accepted",
    decline: "declined",
    cancel: "cancelled",
  },
  customer_accepted: {
    offerRevision: "revision_offered",
    confirm: "confirmed",
    decline: "declined",
    cancel: "cancelled",
  },
  confirmed: { cancel: "cancelled" },
  declined: {},
  cancelled: {},
} as const;

export type ServiceRequestStatus = keyof typeof serviceRequestTransitions;
export type ServiceRequestEvent =
  | "beginReview"
  | "offerRevision"
  | "acceptRevision"
  | "confirm"
  | "decline"
  | "cancel";

export function transitionServiceRequest(
  status: ServiceRequestStatus,
  event: ServiceRequestEvent,
): ServiceRequestStatus {
  return transition(
    status,
    event,
    serviceRequestTransitions,
  ) as ServiceRequestStatus;
}

export const appointmentTransitions = {
  requested: { confirm: "confirmed", cancel: "cancelled" },
  confirmed: {
    complete: "completed",
    markNoShow: "no_show",
    cancel: "cancelled",
  },
  completed: {},
  no_show: {},
  cancelled: {},
} as const;

export type AppointmentStatus = keyof typeof appointmentTransitions;
export type AppointmentEvent =
  | "confirm"
  | "cancel"
  | "complete"
  | "markNoShow";

export function transitionAppointment(
  status: AppointmentStatus,
  event: AppointmentEvent,
): AppointmentStatus {
  return transition(status, event, appointmentTransitions) as AppointmentStatus;
}

export type QuoteLineInput = Readonly<{
  description: string;
  quantity: number;
  supplierUnitCost: Money<"SEK">;
  markupBasisPoints: number;
}>;

export type CalculatedQuoteLine = Readonly<{
  description: string;
  quantity: number;
  supplierUnitCost: Money<"SEK">;
  supplierSubtotal: Money<"SEK">;
  markupBasisPoints: number;
  markup: Money<"SEK">;
  customerPartsTotal: Money<"SEK">;
}>;

export type QuoteBreakdown = Readonly<{
  currency: "SEK";
  lines: readonly CalculatedQuoteLine[];
  supplierParts: Money<"SEK">;
  markup: Money<"SEK">;
  labor: Money<"SEK">;
  total: Money<"SEK">;
}>;

function safeMinor(value: bigint, description: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${description} exceeds safe SEK minor units`);
  }

  return Number(value);
}

function markupMinor(subtotalMinor: number, basisPoints: number): number {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError("Markup basis points must be a non-negative integer");
  }

  const rounded =
    (BigInt(subtotalMinor) * BigInt(basisPoints) + 5_000n) / 10_000n;
  return safeMinor(rounded, "Markup");
}

/**
 * Calculate itemized supplier cost, markup, labor, and customer price in SEK.
 */
export function calculateQuote(
  lines: readonly QuoteLineInput[],
  labor: Money<"SEK">,
): QuoteBreakdown {
  if (lines.length === 0) {
    throw new RangeError("A quote must contain at least one parts line");
  }

  const checkedLabor = addMoney(labor, sek(0));
  let supplierParts = sek(0);
  let totalMarkup = sek(0);

  const calculatedLines = lines.map((line) => {
    const description = line.description.trim();
    if (description.length === 0 || description.length > 200) {
      throw new RangeError(
        "Quote line description must contain 1 to 200 characters",
      );
    }

    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new RangeError("Quote quantity must be a positive integer");
    }

    const supplierUnitCost = addMoney(line.supplierUnitCost, sek(0));
    const subtotalMinor = safeMinor(
      BigInt(supplierUnitCost.minor) * BigInt(line.quantity),
      "Supplier subtotal",
    );
    const supplierSubtotal = sek(subtotalMinor);
    const lineMarkup = sek(markupMinor(subtotalMinor, line.markupBasisPoints));
    const customerPartsTotal = addMoney(supplierSubtotal, lineMarkup);

    supplierParts = addMoney(supplierParts, supplierSubtotal);
    totalMarkup = addMoney(totalMarkup, lineMarkup);

    return {
      description,
      quantity: line.quantity,
      supplierUnitCost,
      supplierSubtotal,
      markupBasisPoints: line.markupBasisPoints,
      markup: lineMarkup,
      customerPartsTotal,
    };
  });

  return {
    currency: "SEK",
    lines: calculatedLines,
    supplierParts,
    markup: totalMarkup,
    labor: checkedLabor,
    total: addMoney(addMoney(supplierParts, totalMarkup), checkedLabor),
  };
}
