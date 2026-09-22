import type { CustomerId, TenantId, VehicleId } from "@li-erikes/domain";

export const customers = {
  name: "customers",
  columns: ["id", "tenant_id", "name", "email", "created_at"],
} as const;

export const vehicles = {
  name: "vehicles",
  columns: ["id", "tenant_id", "registration_number", "vin", "created_at"],
} as const;

export const vehicleOwnerships = {
  name: "vehicle_ownerships",
  columns: ["tenant_id", "vehicle_id", "customer_id", "created_at"],
} as const;

export type CustomerRow = Readonly<{
  id: CustomerId;
  tenantId: TenantId;
  name: string;
  email: string;
}>;

export type VehicleRow = Readonly<{
  id: VehicleId;
  tenantId: TenantId;
  registrationNumber: string;
  vin: string | null;
}>;
