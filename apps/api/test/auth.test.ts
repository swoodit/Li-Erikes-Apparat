import { createHmac, createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantId } from "@li-erikes/domain";
import { buildApp } from "../src/app";
import { requireRole } from "../src/security/authorize";

const clock = () => new Date("2030-01-01T00:00:00.000Z");
const jwtSecret = "task-4-deterministic-local-jwt-secret";
const issuer = "https://auth.example.test";
const audience = "authenticated";
const tenantA = "00000000-0000-4000-8000-000000000001" as TenantId;
const tenantB = "00000000-0000-4000-8000-000000000002" as TenantId;
const technicianId = "00000000-0000-4000-8000-000000000010";
const customerId = "00000000-0000-4000-8000-000000000011";
const es256KeyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const es256Jwks = {
  keys: [
    {
      kid: "test-es256-key",
      ...es256KeyPair.publicKey.export({ format: "jwk" }),
    },
  ],
};

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function signToken(
  claims: Record<string, unknown>,
  secret = jwtSecret,
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: issuer,
      aud: audience,
      sub: technicianId,
      exp: Math.floor(clock().getTime() / 1000) + 60,
      ...claims,
    }),
  );
  const input = `${header}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(input)
    .digest("base64url");
  return `${input}.${signature}`;
}

function signEs256Token(
  claims: Record<string, unknown>,
  alg = "ES256",
): string {
  const header = base64url(
    JSON.stringify({ alg, kid: "test-es256-key", typ: "JWT" }),
  );
  const payload = base64url(
    JSON.stringify({
      iss: issuer,
      aud: audience,
      sub: technicianId,
      exp: Math.floor(clock().getTime() / 1000) + 60,
      ...claims,
    }),
  );
  const input = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(input);
  signer.end();
  const signature = signer.sign({
    dsaEncoding: "ieee-p1363",
    key: es256KeyPair.privateKey,
  });
  return `${input}.${signature.toString("base64url")}`;
}

function buildAuthenticatedApp() {
  const app = buildApp({
    auth: {
      audience,
      clock,
      issuer,
      membershipsForUser: async (userId) => {
        if (userId === technicianId) {
          return [
            {
              id: "00000000-0000-4000-8000-000000000100",
              role: "technician",
              tenantId: tenantA,
              userId,
            },
          ];
        }

        if (userId === customerId) {
          return [
            {
              id: "00000000-0000-4000-8000-000000000101",
              role: "customer",
              tenantId: tenantA,
              userId,
            },
          ];
        }

        return [];
      },
      verifier: {
        kind: "hs256",
        secret: jwtSecret,
      },
    },
  });

  app.post(
    "/staff/authorizations",
    {
      preHandler: async (request) =>
        requireRole(request, ["staff", "technician", "workshop_admin"]),
    },
    async (request) => ({ actor: request.actor }),
  );

  return app;
}

function buildAsymmetricAuthenticatedApp() {
  const app = buildApp({
    auth: {
      audience,
      clock,
      issuer,
      membershipsForUser: async (userId) => [
        {
          id: "00000000-0000-4000-8000-000000000100",
          role: "technician",
          tenantId: tenantA,
          userId,
        },
      ],
      verifier: {
        algorithms: ["ES256"],
        jwks: es256Jwks,
        kind: "jwks",
      },
    },
  });

  app.post(
    "/staff/authorizations",
    {
      preHandler: async (request) => requireRole(request, ["technician"]),
    },
    async (request) => ({ actor: request.actor }),
  );

  return app;
}

function buildRemoteJwksAuthenticatedApp() {
  const app = buildApp({
    auth: {
      audience,
      clock,
      issuer,
      membershipsForUser: async (userId) => [
        {
          id: "00000000-0000-4000-8000-000000000100",
          role: "technician",
          tenantId: tenantA,
          userId,
        },
      ],
      verifier: {
        algorithms: ["ES256"],
        fetch: async () =>
          new Response(JSON.stringify(es256Jwks), {
            headers: { "content-type": "application/json" },
          }),
        jwksUrl: `${issuer}/.well-known/jwks.json`,
        kind: "remote-jwks",
      },
    },
  });

  app.post(
    "/staff/authorizations",
    {
      preHandler: async (request) => requireRole(request, ["technician"]),
    },
    async (request) => ({ actor: request.actor }),
  );

  return app;
}

describe("staff authorization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("returns 401 when a protected route has no bearer token", async () => {
    const response = await buildAuthenticatedApp().inject({
      method: "POST",
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });

  it("returns 403 when a customer calls a staff route", async () => {
    const response = await buildAuthenticatedApp().inject({
      headers: { authorization: `Bearer ${signToken({ sub: customerId })}` },
      method: "POST",
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("allows a valid technician membership", async () => {
    const response = await buildAuthenticatedApp().inject({
      headers: { authorization: `Bearer ${signToken({})}` },
      method: "POST",
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      actor: {
        roles: ["technician"],
        tenantId: tenantA,
        userId: technicianId,
      },
    });
  });

  it("allows a valid ES256 token from pinned JWKS material", async () => {
    const response = await buildAsymmetricAuthenticatedApp().inject({
      headers: { authorization: `Bearer ${signEs256Token({})}` },
      method: "POST",
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actor.tenantId).toBe(tenantA);
  });

  it("allows a valid ES256 token from a configured remote JWKS", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("global fetch must not be used for this verifier");
    });
    const response = await buildRemoteJwksAuthenticatedApp().inject({
      headers: { authorization: `Bearer ${signEs256Token({})}` },
      method: "POST",
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actor.tenantId).toBe(tenantA);
  });

  it("rejects a remote JWKS configured outside the issuer origin", () => {
    expect(() =>
      buildApp({
        auth: {
          audience,
          issuer,
          membershipsForUser: async () => [],
          verifier: {
            algorithms: ["ES256"],
            jwksUrl: "https://untrusted.example.test/jwks.json",
            kind: "remote-jwks",
          },
        },
      }),
    ).toThrow("same origin as the issuer");
  });

  it("ignores tenant identifiers supplied in headers and body", async () => {
    const response = await buildAuthenticatedApp().inject({
      headers: {
        authorization: `Bearer ${signToken({})}`,
        "x-tenant-id": tenantB,
      },
      method: "POST",
      payload: { tenantId: tenantB },
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actor.tenantId).toBe(tenantA);
  });

  it.each([
    ["signature", signToken({}, "a-different-deterministic-secret")],
    ["issuer", signToken({ iss: "https://other.example.test" })],
    ["audience", signToken({ aud: "other-audience" })],
    ["expiry", signToken({ exp: Math.floor(clock().getTime() / 1000) - 1 })],
    ["subject", signToken({ sub: "" })],
  ])("rejects a token with an invalid %s", async (_name, token) => {
    const response = await buildAuthenticatedApp().inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });

  it.each([
    ["a malformed JWT structure", "not-a-jwt"],
    ["invalid base64url", "a+b.c.d"],
    ["a non-bearer authorization scheme", signToken({}), "Basic"],
  ])("rejects %s", async (_name, token, scheme = "Bearer") => {
    const response = await buildAuthenticatedApp().inject({
      headers: { authorization: `${scheme} ${token}` },
      method: "POST",
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });

  it.each([
    ["an unsigned algorithm", signEs256Token({}, "none")],
    [
      "an algorithm outside the configured JWKS allowlist",
      signEs256Token({}, "RS256"),
    ],
  ])("rejects %s from the asymmetric verifier", async (_name, token) => {
    const response = await buildAsymmetricAuthenticatedApp().inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      url: "/staff/authorizations",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });
});
