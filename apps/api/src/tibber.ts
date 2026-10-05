import type { FastifyInstance, FastifyReply } from "fastify";
import {
  TibberApiError,
  TibberClient,
  type TibberGateway,
} from "./integrations/tibber.js";

function tibberFromEnvironment(): TibberGateway | null {
  const token = process.env.TIBBER_TOKEN?.trim();
  if (token === undefined || token.length === 0) {
    return null;
  }

  return new TibberClient({
    token,
    endpoint: process.env.TIBBER_API_URL,
  });
}

async function resolveHomeId(
  client: TibberGateway,
  requestedHomeId?: string,
): Promise<string> {
  const requested = requestedHomeId?.trim();
  if (requested !== undefined && requested.length > 0) {
    return requested;
  }

  const homes = await client.homes();
  const firstHome = homes[0];
  if (firstHome === undefined) {
    throw new TibberApiError("No Tibber homes are visible to this token");
  }
  return firstHome.id;
}

function tibberFailure(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown Tibber error";

  return reply.status(502).send({
    error: "tibber_unavailable",
    message,
  });
}

export function registerTibberRoutes(
  app: FastifyInstance,
  providedClient?: TibberGateway | null,
): void {
  const client =
    providedClient === undefined ? tibberFromEnvironment() : providedClient;

  app.get("/api/energy/tibber/status", async (_request, reply) => {
    if (client === null) {
      return {
        configured: false,
        connected: false,
      };
    }

    try {
      const homes = await client.homes();
      return {
        configured: true,
        connected: true,
        homes: homes.length,
      };
    } catch (error) {
      return tibberFailure(reply, error);
    }
  });

  app.get("/api/energy/tibber/homes", async (_request, reply) => {
    if (client === null) {
      return reply.status(503).send({
        error: "tibber_not_configured",
      });
    }

    try {
      return { homes: await client.homes() };
    } catch (error) {
      return tibberFailure(reply, error);
    }
  });

  app.get<{
    Querystring: { homeId?: string };
  }>("/api/energy/tibber/prices", async (request, reply) => {
    if (client === null) {
      return reply.status(503).send({
        error: "tibber_not_configured",
      });
    }

    try {
      const homeId = await resolveHomeId(client, request.query.homeId);
      return await client.prices(homeId);
    } catch (error) {
      return tibberFailure(reply, error);
    }
  });

  app.get<{
    Querystring: { days?: string; homeId?: string };
  }>("/api/energy/tibber/consumption", async (request, reply) => {
    if (client === null) {
      return reply.status(503).send({
        error: "tibber_not_configured",
      });
    }

    const days =
      request.query.days === undefined ? 7 : Number(request.query.days);
    if (!Number.isInteger(days) || days < 1 || days > 31) {
      return reply.status(400).send({
        error: "invalid_days",
        message: "days must be an integer from 1 to 31",
      });
    }

    try {
      const homeId = await resolveHomeId(client, request.query.homeId);
      return await client.consumption(homeId, days);
    } catch (error) {
      return tibberFailure(reply, error);
    }
  });
}
