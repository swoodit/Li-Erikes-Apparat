import type { AuthRole } from "@li-erikes/contracts";
import type { MembershipRow } from "@li-erikes/database/schema/organisation";
import type { TenantId, UserId } from "@li-erikes/domain";

export type RequestActor = Readonly<{
  userId: UserId;
  tenantId: TenantId;
  roles: readonly AuthRole[];
}>;

export class TenantResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantResolutionError";
  }
}

const authRoles = new Set<AuthRole>([
  "customer",
  "staff",
  "technician",
  "workshop_admin",
  "platform_admin",
]);

function isAuthRole(value: string): value is AuthRole {
  return authRoles.has(value as AuthRole);
}

/**
 * Builds the request actor solely from rows returned by the server-side
 * membership lookup. Tenant identifiers from request headers or bodies are
 * intentionally not accepted here.
 */
export function resolveActorFromMemberships(
  userId: UserId,
  memberships: readonly MembershipRow[],
): RequestActor {
  const matchingMemberships = memberships.filter(
    (membership) => membership.userId === userId && isAuthRole(membership.role),
  );

  if (matchingMemberships.length === 0) {
    throw new TenantResolutionError("The user has no valid tenant membership");
  }

  const tenantIds = new Set(
    matchingMemberships.map((membership) => membership.tenantId),
  );
  if (tenantIds.size !== 1) {
    throw new TenantResolutionError(
      "A server-side route tenant is required for users with multiple memberships",
    );
  }

  const [firstMembership] = matchingMemberships;
  const roles = [
    ...new Set(matchingMemberships.map((membership) => membership.role)),
  ];

  return Object.freeze({
    roles: Object.freeze(roles),
    tenantId: firstMembership.tenantId,
    userId,
  });
}
