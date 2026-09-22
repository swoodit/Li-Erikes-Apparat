import type { FastifyRequest } from "fastify";
import type { AuthRole } from "@li-erikes/contracts";
import { AuthorizationError } from "../plugins/auth.js";
import type { RequestActor } from "../plugins/tenant.js";

export async function requireRole(
  request: FastifyRequest,
  roles: readonly AuthRole[],
): Promise<RequestActor> {
  const actor = await request.server.authenticateRequest(request);
  if (!roles.some((role) => actor.roles.includes(role))) {
    throw new AuthorizationError("The actor does not have a required role");
  }
  return actor;
}
