import type { TenantId, UserId } from "@li-erikes/domain";

export const tenants = {
  name: "tenants",
  columns: ["id", "name", "created_at"],
} as const;

export const workshops = {
  name: "workshops",
  columns: ["id", "tenant_id", "name", "created_at"],
} as const;

export const memberships = {
  name: "memberships",
  columns: ["id", "tenant_id", "user_id", "role", "created_at"],
} as const;

export type TenantRow = Readonly<{
  id: TenantId;
  name: string;
}>;

export type WorkshopRow = Readonly<{
  id: string;
  tenantId: TenantId;
  name: string;
}>;

export type MembershipRole =
  "customer" | "staff" | "technician" | "workshop_admin" | "platform_admin";

export type MembershipRow = Readonly<{
  id: string;
  tenantId: TenantId;
  userId: UserId;
  role: MembershipRole;
}>;
