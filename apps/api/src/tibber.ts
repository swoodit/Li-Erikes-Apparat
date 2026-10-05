import { createHash, timingSafeEqual } from "node:crypto";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import {
  TibberApiError,
  TibberClient,
  type TibberGateway,
  type TibberHome,
  type TibberPrice,
  type TibberPriceResponse,
} from "./integrations/tibber.js";
import { buildEnergyAdvice } from "./energy-intelligence.js";
import { UnauthenticatedError } from "./plugins/auth.js";
import { requireRole } from "./security/authorize.js";

const DEFAULT_HOME_CACHE_MS = 60 * 60 * 1000;
const DEFAULT_PRICE_CACHE_MS = 24 * 60 * 60 * 1000;
const PRICE_RETRY_CACHE_MS = 60 * 60 * 1000;

export type TibberRouteOptions = Readonly<{
  clock?: () => Date;
  defaultHomeId?: string | null;
  homeCacheMaxAgeMs?: number;
  homeEnergyApiKey?: string | null;
  priceCacheMaxAgeMs?: number;
}>;

type TimedCache<T> = Readonly<{
  expiresAt: number;
  value: T;
}>;

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

function configuredValue(
  provided: string | null | undefined,
  environmentValue: string | undefined,
): string | null {
  if (provided !== undefined) {
    const value = provided?.trim() ?? "";
    return value.length > 0 ? value : null;
  }

  const value = environmentValue?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function configuredHomeEnergyKey(
  provided: string | null | undefined,
): string | null {
  return configuredValue(provided, process.env.HOME_ENERGY_API_KEY);
}

function safeSecretEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function headerValue(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" ? value : null;
}

function makeAccessGuard(
  app: FastifyInstance,
  homeEnergyApiKey: string | null,
) {
  return async (request: FastifyRequest): Promise<void> => {
    const suppliedKey = headerValue(request, "x-home-energy-key");
    if (
      homeEnergyApiKey !== null &&
      suppliedKey !== null &&
      safeSecretEqual(suppliedKey, homeEnergyApiKey)
    ) {
      return;
    }

    if (
      app.hasDecorator("authenticateRequest") &&
      request.headers.authorization?.startsWith("Bearer ") === true
    ) {
      await requireRole(request, ["workshop_admin", "platform_admin"]);
      return;
    }

    throw new UnauthenticatedError(
      "Tibber account routes require authentication",
    );
  };
}

function priceStartsAt(price: TibberPrice): number | null {
  if (price.startsAt === null) {
    return null;
  }
  const value = Date.parse(price.startsAt);
  return Number.isFinite(value) ? value : null;
}

function deriveCurrentPrice(
  response: TibberPriceResponse,
  now: Date,
): TibberPriceResponse {
  const subscription = response.currentSubscription;
  const info = subscription?.priceInfo;
  if (subscription === null || info === null) {
    return response;
  }

  const schedule = [...info.today, ...info.tomorrow]
    .map((price) => ({ price, startsAt: priceStartsAt(price) }))
    .filter(
      (
        item,
      ): item is Readonly<{ price: TibberPrice; startsAt: number }> =>
        item.startsAt !== null,
    )
    .sort((left, right) => left.startsAt - right.startsAt);

  const nowMs = now.getTime();
  let current: TibberPrice | null = null;

  for (let index = 0; index < schedule.length; index += 1) {
    const entry = schedule[index];
    const next = schedule[index + 1];
    const nextStart =
      next?.startsAt ??
      entry.startsAt +
        Math.max(
          15 * 60 * 1000,
          entry.startsAt - (schedule[index - 1]?.startsAt ?? entry.startsAt),
        );

    if (entry.startsAt <= nowMs && nowMs < nextStart) {
      current = entry.price;
      break;
    }
  }

  return {
    ...response,
    currentSubscription: {
      ...subscription,
      priceInfo: {
        ...info,
        current,
      },
    },
  };
}

function priceCacheLifetime(
  response: TibberPriceResponse,
  configuredMaxAgeMs: number,
): number {
  const hasTomorrow =
    (response.currentSubscription?.priceInfo?.tomorrow.length ?? 0) > 0;
  return hasTomorrow
    ? configuredMaxAgeMs
    : Math.min(configuredMaxAgeMs, PRICE_RETRY_CACHE_MS);
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
  options: TibberRouteOptions = {},
): void {
  const client =
    providedClient === undefined ? tibberFromEnvironment() : providedClient;
  const clock = options.clock ?? (() => new Date());
  const homeCacheMaxAgeMs =
    options.homeCacheMaxAgeMs ?? DEFAULT_HOME_CACHE_MS;
  const priceCacheMaxAgeMs =
    options.priceCacheMaxAgeMs ?? DEFAULT_PRICE_CACHE_MS;
  const homeEnergyApiKey = configuredHomeEnergyKey(
    options.homeEnergyApiKey,
  );
  const defaultHomeId = configuredValue(
    options.defaultHomeId,
    process.env.TIBBER_HOME_ID,
  );
  const requireTibberAccess = makeAccessGuard(app, homeEnergyApiKey);

  let homesCache: TimedCache<readonly TibberHome[]> | null = null;
  const pricesCache = new Map<string, TimedCache<TibberPriceResponse>>();

  async function homes(): Promise<readonly TibberHome[]> {
    if (client === null) {
      throw new TibberApiError("Tibber is not configured");
    }

    const nowMs = clock().getTime();
    if (homesCache !== null && homesCache.expiresAt > nowMs) {
      return homesCache.value;
    }

    const value = await client.homes();
    homesCache = {
      expiresAt: nowMs + homeCacheMaxAgeMs,
      value,
    };
    return value;
  }

  async function resolveHomeId(
    requestedHomeId?: string,
  ): Promise<string> {
    const requested = requestedHomeId?.trim();
    if (requested !== undefined && requested.length > 0) {
      return requested;
    }

    if (defaultHomeId !== null) {
      return defaultHomeId;
    }

    const visibleHomes = await homes();
    const firstHome = visibleHomes[0];
    if (firstHome === undefined) {
      throw new TibberApiError("No Tibber homes are visible to this token");
    }
    return firstHome.id;
  }

  async function prices(homeId: string): Promise<TibberPriceResponse> {
    if (client === null) {
      throw new TibberApiError("Tibber is not configured");
    }

    const now = clock();
    const cached = pricesCache.get(homeId);
    if (cached !== undefined && cached.expiresAt > now.getTime()) {
      return deriveCurrentPrice(cached.value, now);
    }

    const value = await client.prices(homeId);
    pricesCache.set(homeId, {
      expiresAt:
        now.getTime() + priceCacheLifetime(value, priceCacheMaxAgeMs),
      value,
    });
    return deriveCurrentPrice(value, now);
  }

  app.get("/api/energy/tibber/status", async () => ({
    configured: client !== null,
    protected:
      homeEnergyApiKey !== null ||
      app.hasDecorator("authenticateRequest"),
  }));

  app.get(
    "/api/energy/tibber/homes",
    { preHandler: requireTibberAccess },
    async (_request, reply) => {
      if (client === null) {
        return reply.status(503).send({
          error: "tibber_not_configured",
        });
      }

      try {
        return { homes: await homes() };
      } catch (error) {
        return tibberFailure(reply, error);
      }
    },
  );

  app.get<{
    Querystring: { homeId?: string };
  }>(
    "/api/energy/tibber/prices",
    { preHandler: requireTibberAccess },
    async (request, reply) => {
      if (client === null) {
        return reply.status(503).send({
          error: "tibber_not_configured",
        });
      }

      try {
        const homeId = await resolveHomeId(request.query.homeId);
        return await prices(homeId);
      } catch (error) {
        return tibberFailure(reply, error);
      }
    },
  );

  app.get<{
    Querystring: { homeId?: string };
  }>(
    "/api/energy/tibber/advice",
    { preHandler: requireTibberAccess },
    async (request, reply) => {
      if (client === null) {
        return reply.status(503).send({
          error: "tibber_not_configured",
        });
      }

      try {
        const homeId = await resolveHomeId(request.query.homeId);
        return buildEnergyAdvice(await prices(homeId), clock());
      } catch (error) {
        return tibberFailure(reply, error);
      }
    },
  );

  app.get<{
    Querystring: { days?: string; homeId?: string };
  }>(
    "/api/energy/tibber/consumption",
    { preHandler: requireTibberAccess },
    async (request, reply) => {
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
        const homeId = await resolveHomeId(request.query.homeId);
        return await client.consumption(homeId, days);
      } catch (error) {
        return tibberFailure(reply, error);
      }
    },
  );
}
