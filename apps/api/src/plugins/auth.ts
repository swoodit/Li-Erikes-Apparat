import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
  type JSONWebKeySet,
  type JWSAlgorithm,
} from "jose";
import type { AuthRole } from "@li-erikes/contracts";
import type { MembershipRow } from "@li-erikes/database/schema/organisation";
import type { UserId } from "@li-erikes/domain";
import {
  resolveActorFromMemberships,
  type RequestActor,
  TenantResolutionError,
} from "./tenant.js";

const asymmetricAlgorithms = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
] as const;

export type AsymmetricJwtAlgorithm = (typeof asymmetricAlgorithms)[number];

export type JwtVerifier =
  | Readonly<{
      kind: "hs256";
      secret: string;
    }>
  | Readonly<{
      algorithms: readonly AsymmetricJwtAlgorithm[];
      jwks: JSONWebKeySet;
      kind: "jwks";
    }>
  | Readonly<{
      algorithms: readonly AsymmetricJwtAlgorithm[];
      fetch?: FetchImplementation;
      jwksUrl: string;
      kind: "remote-jwks";
    }>;

export type AuthenticationOptions = Readonly<{
  audience: string;
  clock?: () => Date;
  issuer: string;
  membershipsForUser: (userId: UserId) => Promise<readonly MembershipRow[]>;
  verifier: JwtVerifier;
}>;

export class UnauthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticateRequest(request: FastifyRequest): Promise<RequestActor>;
  }

  interface FastifyRequest {
    actor: RequestActor | null;
  }
}

function trustedRemoteJwksUrl(value: string, issuer: string): URL {
  let url: URL;
  let issuerUrl: URL;
  try {
    url = new URL(value);
    issuerUrl = new URL(issuer);
  } catch {
    throw new Error("The remote JWKS URL and issuer must be absolute");
  }

  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("The remote JWKS URL must be a pinned HTTPS URL");
  }
  if (issuerUrl.protocol !== "https:" || url.origin !== issuerUrl.origin) {
    throw new Error(
      "The remote JWKS URL must use the same origin as the issuer",
    );
  }

  return url;
}

function configuredAlgorithms(
  algorithms: readonly AsymmetricJwtAlgorithm[],
): JWSAlgorithm[] {
  if (
    algorithms.length === 0 ||
    algorithms.some(
      (algorithm) =>
        !asymmetricAlgorithms.includes(algorithm as AsymmetricJwtAlgorithm),
    )
  ) {
    throw new Error("JWKS verification requires pinned asymmetric algorithms");
  }
  return [...algorithms];
}

type VerificationKey =
  | Uint8Array
  | ReturnType<typeof createLocalJWKSet>
  | ReturnType<typeof createRemoteJWKSet>;

type ConfiguredVerifier = Readonly<{
  algorithms: JWSAlgorithm[];
  key: VerificationKey;
}>;

function configureVerifier(
  verifier: JwtVerifier,
  issuer: string,
): ConfiguredVerifier {
  switch (verifier.kind) {
    case "hs256":
      if (verifier.secret.trim().length === 0) {
        throw new Error("HS256 verification requires a non-empty secret");
      }
      return {
        algorithms: ["HS256"],
        key: new TextEncoder().encode(verifier.secret),
      };
    case "jwks":
      return {
        algorithms: configuredAlgorithms(verifier.algorithms),
        key: createLocalJWKSet(verifier.jwks),
      };
    case "remote-jwks":
      return {
        algorithms: configuredAlgorithms(verifier.algorithms),
        key: createRemoteJWKSet(
          trustedRemoteJwksUrl(verifier.jwksUrl, issuer),
          {
            ...(verifier.fetch === undefined
              ? {}
              : { [customFetch]: verifier.fetch }),
          },
        ),
      };
  }
}

async function verifiedUserId(
  token: string,
  options: AuthenticationOptions,
  verifier: ConfiguredVerifier,
): Promise<UserId> {
  try {
    const { payload } = await jwtVerify(token, verifier.key, {
      algorithms: verifier.algorithms,
      audience: options.audience,
      currentDate: options.clock?.(),
      issuer: options.issuer,
      requiredClaims: ["exp", "sub"],
    });
    if (typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
      throw new UnauthenticatedError("JWT subject is invalid");
    }
    return payload.sub as UserId;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      throw error;
    }
    throw new UnauthenticatedError("JWT verification failed");
  }
}

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "");
  if (match === null) {
    throw new UnauthenticatedError("A bearer token is required");
  }
  return match[1];
}

export function configureAuthentication(
  app: FastifyInstance,
  options: AuthenticationOptions,
): void {
  const verifier = configureVerifier(options.verifier, options.issuer);
  app.decorateRequest("actor", null);
  app.decorate("authenticateRequest", async (request: FastifyRequest) => {
    if (request.actor !== null) {
      return request.actor;
    }

    try {
      const userId = await verifiedUserId(
        bearerToken(request),
        options,
        verifier,
      );
      const memberships = await options.membershipsForUser(userId);
      const actor = resolveActorFromMemberships(userId, memberships);
      request.actor = actor;
      return actor;
    } catch (error) {
      if (error instanceof TenantResolutionError) {
        throw new AuthorizationError(error.message);
      }
      throw error;
    }
  });
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type AuthorizedRole = AuthRole;
