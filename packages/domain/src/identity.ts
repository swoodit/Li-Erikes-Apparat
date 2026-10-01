declare const tenantIdBrand: unique symbol;
declare const userIdBrand: unique symbol;
declare const customerIdBrand: unique symbol;
declare const vehicleIdBrand: unique symbol;
declare const serviceRequestIdBrand: unique symbol;
declare const partOfferIdBrand: unique symbol;
declare const quoteIdBrand: unique symbol;
declare const appointmentIdBrand: unique symbol;
declare const bookingLinkIdBrand: unique symbol;

export type TenantId = string & { readonly [tenantIdBrand]: "TenantId" };
export type UserId = string & { readonly [userIdBrand]: "UserId" };
export type CustomerId = string & { readonly [customerIdBrand]: "CustomerId" };
export type VehicleId = string & { readonly [vehicleIdBrand]: "VehicleId" };
export type ServiceRequestId = string & {
  readonly [serviceRequestIdBrand]: "ServiceRequestId";
};
export type PartOfferId = string & {
  readonly [partOfferIdBrand]: "PartOfferId";
};
export type QuoteId = string & { readonly [quoteIdBrand]: "QuoteId" };
export type AppointmentId = string & {
  readonly [appointmentIdBrand]: "AppointmentId";
};
export type BookingLinkId = string & {
  readonly [bookingLinkIdBrand]: "BookingLinkId";
};

export function tenantId(value: string): TenantId {
  return value as TenantId;
}

export function userId(value: string): UserId {
  return value as UserId;
}

export function customerId(value: string): CustomerId {
  return value as CustomerId;
}

export function vehicleId(value: string): VehicleId {
  return value as VehicleId;
}

export function serviceRequestId(value: string): ServiceRequestId {
  return value as ServiceRequestId;
}

export function partOfferId(value: string): PartOfferId {
  return value as PartOfferId;
}

export function quoteId(value: string): QuoteId {
  return value as QuoteId;
}

export function appointmentId(value: string): AppointmentId {
  return value as AppointmentId;
}

export function bookingLinkId(value: string): BookingLinkId {
  return value as BookingLinkId;
}

export const asTenantId = tenantId;
export const asUserId = userId;
export const asCustomerId = customerId;
export const asVehicleId = vehicleId;
export const asServiceRequestId = serviceRequestId;
export const asPartOfferId = partOfferId;
export const asQuoteId = quoteId;
export const asAppointmentId = appointmentId;
export const asBookingLinkId = bookingLinkId;
