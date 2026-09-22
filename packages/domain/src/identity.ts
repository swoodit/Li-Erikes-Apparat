declare const tenantIdBrand: unique symbol;
declare const userIdBrand: unique symbol;
declare const customerIdBrand: unique symbol;
declare const vehicleIdBrand: unique symbol;

export type TenantId = string & { readonly [tenantIdBrand]: "TenantId" };
export type UserId = string & { readonly [userIdBrand]: "UserId" };
export type CustomerId = string & { readonly [customerIdBrand]: "CustomerId" };
export type VehicleId = string & { readonly [vehicleIdBrand]: "VehicleId" };

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

export const asTenantId = tenantId;
export const asUserId = userId;
export const asCustomerId = customerId;
export const asVehicleId = vehicleId;
