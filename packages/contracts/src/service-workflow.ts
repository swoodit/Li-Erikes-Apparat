import { z } from "zod";

const IdentifierSchema = z.string().trim().min(1).max(128);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const MoneyMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const ServiceTypeSchema = z.enum([
  "seasonal_tyres",
  "scheduled_maintenance",
]);

export const ServiceRequestStatusSchema = z.enum([
  "requested",
  "under_review",
  "revision_offered",
  "customer_accepted",
  "confirmed",
  "declined",
  "cancelled",
]);

export const AppointmentStatusSchema = z.enum([
  "requested",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
]);

export const PartOfferSourceSchema = z.enum(["live", "manual", "sample"]);

export const PartOfferResultStateSchema = z.enum([
  "current",
  "stale",
  "unavailable",
  "unknown",
  "no_match",
  "out_of_stock",
]);

const SlotTimeSchema = z
  .object({
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
  })
  .strict()
  .refine(
    (slot) => Date.parse(slot.endsAt) > Date.parse(slot.startsAt),
    "End time must be later than start time",
  );

export const CustomerBookingRequestSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(254).optional(),
        phone: z.string().trim().min(7).max(32).optional(),
      })
      .strict(),
    vehicle: z
      .object({
        registration: z.string().trim().min(2).max(16),
        make: z.string().trim().min(1).max(80),
        model: z.string().trim().min(1).max(80),
        modelYear: z.number().int().min(1886).max(2100).optional(),
      })
      .strict(),
    serviceType: ServiceTypeSchema,
    preferredSlot: SlotTimeSchema,
    notes: z.string().max(2_000).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (!request.customer.email && !request.customer.phone) {
      context.addIssue({
        code: "custom",
        path: ["customer"],
        message: "An email address or phone number is required",
      });
    }
  });

export const AvailabilitySlotSchema = z
  .object({
    id: IdentifierSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    capacity: z.number().int().min(1).max(100),
    availableCapacity: z.number().int().min(0).max(100),
  })
  .strict()
  .refine(
    (slot) => Date.parse(slot.endsAt) > Date.parse(slot.startsAt),
    "End time must be later than start time",
  )
  .refine(
    (slot) => slot.availableCapacity <= slot.capacity,
    "Available capacity cannot exceed total capacity",
  );

export const PartOfferCandidateSchema = z
  .object({
    id: IdentifierSchema,
    supplier: z.string().trim().min(1).max(128),
    partNumber: z.string().trim().min(1).max(128),
    priceMinor: MoneyMinorSchema,
    shippingMinor: MoneyMinorSchema,
    fitment: z.enum(["confirmed", "unknown", "incompatible"]),
    availability: z.enum(["in_stock", "out_of_stock", "unknown"]),
    deliveryDays: z.number().int().min(0).max(365),
    observedAt: IsoDateTimeSchema,
    source: PartOfferSourceSchema,
  })
  .strict();

export const PartOfferObservationSchema = z
  .object({
    sourceName: z.string().trim().min(1).max(128),
    source: PartOfferSourceSchema,
    state: PartOfferResultStateSchema,
    retrievedAt: IsoDateTimeSchema.optional(),
    offers: z.array(PartOfferCandidateSchema).max(100),
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.source === "live" && !observation.retrievedAt) {
      context.addIssue({
        code: "custom",
        path: ["retrievedAt"],
        message: "Live supplier observations require a retrieval timestamp",
      });
    }

    if (
      ["current", "stale"].includes(observation.state) &&
      observation.offers.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["offers"],
        message: "Current and stale observations require at least one offer",
      });
    }

    if (
      ["unavailable", "no_match"].includes(observation.state) &&
      observation.offers.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["offers"],
        message: "Unavailable and no-match observations cannot contain offers",
      });
    }

    if (
      observation.state === "out_of_stock" &&
      observation.offers.some((offer) => offer.availability === "in_stock")
    ) {
      context.addIssue({
        code: "custom",
        path: ["offers"],
        message: "Out-of-stock observations cannot contain in-stock offers",
      });
    }

    observation.offers.forEach((offer, index) => {
      if (offer.source !== observation.source) {
        context.addIssue({
          code: "custom",
          path: ["offers", index, "source"],
          message: "Offer source must match its observation",
        });
      }
    });
  });

export const PartOfferCsvImportSchema = z
  .object({
    sourceName: z.string().trim().min(1).max(128),
    fileName: z.string().trim().min(1).max(200),
    csv: z.string().min(1).max(1_000_000),
  })
  .strict();

export const QuoteRevisionInputSchema = z
  .object({
    revision: z.number().int().min(1).max(10_000),
    currency: z.literal("SEK"),
    laborMinor: MoneyMinorSchema,
    lines: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(200),
            quantity: z.number().int().min(1).max(1_000),
            supplierUnitCostMinor: MoneyMinorSchema,
            markupBasisPoints: z.number().int().min(0).max(1_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const PublicRequestStatusSchema = z
  .object({
    requestId: IdentifierSchema,
    status: ServiceRequestStatusSchema,
    updatedAt: IsoDateTimeSchema,
    preferredSlot: SlotTimeSchema,
    appointmentStatus: AppointmentStatusSchema.nullable(),
  })
  .strict();

export const CustomerRevisionDecisionSchema = z
  .object({
    decision: z.enum(["accept", "decline"]),
  })
  .strict();

export const StaffReviewDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin_review") }).strict(),
  z
    .object({
      action: z.literal("confirm"),
      appointment: SlotTimeSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("offer_revision"),
      quote: QuoteRevisionInputSchema,
      reason: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("decline"),
      reason: z.string().trim().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      reason: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict(),
]);

export type CustomerBookingRequest = z.infer<
  typeof CustomerBookingRequestSchema
>;
export type PublicRequestStatus = z.infer<typeof PublicRequestStatusSchema>;
export type PartOfferObservationContract = z.infer<
  typeof PartOfferObservationSchema
>;
export type QuoteRevisionInput = z.infer<typeof QuoteRevisionInputSchema>;
export type StaffReviewDecision = z.infer<typeof StaffReviewDecisionSchema>;
