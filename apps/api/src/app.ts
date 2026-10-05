import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { TibberGateway } from "./integrations/tibber.js";
import {
  AuthorizationError,
  configureAuthentication,
  type AuthenticationOptions,
  UnauthenticatedError,
} from "./plugins/auth.js";
import {
  registerTibberRoutes,
  type TibberRouteOptions,
} from "./tibber.js";

export type BuildAppOptions = Readonly<{
  auth?: AuthenticationOptions;
  tibber?: TibberGateway | null;
  tibberRoutes?: TibberRouteOptions;
}>;

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  if (options.auth !== undefined) {
    configureAuthentication(app, options.auth);
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof UnauthenticatedError) {
      return reply.status(401).send({ error: "unauthenticated" });
    }
    if (error instanceof AuthorizationError) {
      return reply.status(403).send({ error: "forbidden" });
    }
    return reply.send(error);
  });

  app.get("/health", async () => ({ status: "ok" as const }));
  registerTibberRoutes(app, options.tibber, options.tibberRoutes);
  return app;
}
