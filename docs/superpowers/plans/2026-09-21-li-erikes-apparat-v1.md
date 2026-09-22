# Li-Erikes Apparat V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one secure, tenant-ready automotive-workshop vertical slice from vehicle and OBD-II input through compatible parts, booking, approval, payment, supplier order, work order, and maintenance history.

**Architecture:** Build a TypeScript modular monolith in a pnpm monorepo. Next.js provides the responsive PWA, Fastify owns business authorization and transactional APIs, a Railway worker handles durable external work, and Supabase provides PostgreSQL, authentication, and private storage. Domain packages own rules; adapter packages isolate external providers.

**Tech Stack:** Node.js 24, pnpm 10, TypeScript 5, Next.js 16, Fastify 5, Zod 4, PostgreSQL/Supabase, Drizzle ORM, Stripe, ClamAV, SMTP, Vitest, Playwright, Turborepo, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-21-li-erikes-apparat-v1-design.md`

## Global Constraints

- One workshop is active in V1, but every business-owned row has a non-null `tenant_id`.
- The browser never receives supplier, payment, database-service-role, or diagnostic-service credentials.
- Diagnostic suggestions never approve repairs; workshop confirmation is authoritative.
- Only compatible and sufficiently fresh supplier offers are purchasable.
- Parts default to 100 percent prepayment; labour deposit is configurable from 0 through 100 percent.
- External callbacks, imports, jobs, payments, and orders are idempotent.
- AD integration uses an authorized API, EDI feed, export, or manual order workflow; authenticated catalogue scraping is excluded.
- Original diagnostic reports remain private, immutable, and linked to parser version.
- Each task follows red-green-refactor, ends with its named verification command, and commits independently.

## File map

- `apps/web`: customer and workshop PWA; no direct privileged database calls.
- `apps/api`: Fastify composition root, HTTP routes, authorization, transactions, and webhook entry points.
- `apps/worker`: durable job polling and adapter execution.
- `packages/contracts`: Zod request/response schemas shared by API and web.
- `packages/domain`: pure domain types, policies, calculations, ranking, and state machines.
- `packages/database`: Drizzle schema, migrations, repositories, and tenant-scoped transaction helpers.
- `packages/integrations`: adapter contracts and concrete fake/manual implementations.
- `packages/testkit`: deterministic IDs, clocks, fixtures, and adapter fakes.
- `supabase/migrations`: SQL migrations and row-level-security policies.
- `tests/e2e`: Playwright acceptance flows.
- `.github/workflows/ci.yml`: repository verification.

## Review Focus

1. A duplicated or reordered payment webhook must produce one payment transition and no duplicate supplier order; Task 8 pins this with an idempotency integration test.
2. A stale or price-changed supplier offer must be blocked before payment/order and returned for customer reconfirmation; Tasks 6 and 8 pin both paths.
3. A valid identifier from another tenant must not disclose record existence; Tasks 3 and 4 assert tenant-scoped not-found behavior.
4. An invalid, oversized, spoofed, or unscanned diagnostic upload must remain quarantined and never reach the parser; Task 7 pins these cases.
5. Overlapping appointments and daylight-saving transitions must not double-book a workshop resource; Task 5 tests UTC storage with Europe/Stockholm boundaries.

---

### Task 1: Monorepo, health checks, and CI

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/test/health.test.ts`
- Create: `apps/worker/package.json`
- Create: `apps/worker/src/main.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/layout.tsx`
- Create: `packages/contracts/package.json`
- Create: `packages/domain/package.json`
- Create: `packages/database/package.json`
- Create: `packages/integrations/package.json`
- Create: `packages/testkit/package.json`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: `buildApp(): FastifyInstance`; workspace commands `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

- [ ] **Step 1: Create workspace manifests and install pinned majors**

Use `packageManager: "pnpm@10"`, `engines.node: ">=24"`, and workspace scripts backed by Turborepo. Add Next 16, Fastify 5, Zod 4, TypeScript 5, Vitest, ESLint, and Prettier; commit the generated `pnpm-lock.yaml`.

- [ ] **Step 2: Write the failing API health test**

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /health", () => {
  it("reports readiness", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 3: Run the focused test and observe failure**

Run: `pnpm --filter @li-erikes/api test -- health.test.ts`  
Expected: FAIL because `buildApp` does not exist.

- [ ] **Step 4: Implement the minimal API and app shells**

```ts
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" as const }));
  return app;
}
```

The worker exports `runWorker(signal: AbortSignal): Promise<void>`. The web page renders “Li-Erikes Apparat”. CI runs install with frozen lockfile, formatting check, lint, typecheck, test, and build.

- [ ] **Step 5: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`  
Expected: all commands exit 0.

```bash
git add .
git commit -m "build: bootstrap Li-Erikes Apparat monorepo"
```

### Task 2: Domain primitives and explicit state machines

**Files:**
- Create: `packages/domain/src/identity.ts`
- Create: `packages/domain/src/money.ts`
- Create: `packages/domain/src/errors.ts`
- Create: `packages/domain/src/state-machine.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/test/money.test.ts`
- Create: `packages/domain/test/state-machine.test.ts`
- Create: `packages/testkit/src/index.ts`

**Interfaces:**
- Produces: branded `TenantId`, `UserId`, `CustomerId`, `VehicleId`; `Money`; `transition<S>()`; deterministic `fixedClock` and `fixedId`.
- Consumes: none.

- [ ] **Step 1: Write failing money and transition tests**

```ts
expect(addMoney({ currency: "SEK", minor: 1000 }, { currency: "SEK", minor: 250 }))
  .toEqual({ currency: "SEK", minor: 1250 });
expect(() => addMoney(sek(1), { currency: "EUR", minor: 1 })).toThrow(CurrencyMismatchError);
expect(transition("draft", "approve", quoteTransitions)).toBe("approved");
expect(() => transition("paid", "approve", quoteTransitions)).toThrow(InvalidTransitionError);
```

- [ ] **Step 2: Run tests and observe missing exports**

Run: `pnpm --filter @li-erikes/domain test`  
Expected: FAIL on missing domain functions.

- [ ] **Step 3: Implement immutable primitives and transition table**

```ts
export type Money = Readonly<{ currency: "SEK"; minor: number }>;
export const quoteTransitions = {
  draft: { approve: "approved", cancel: "cancelled" },
  approved: { requestPayment: "awaiting_payment", cancel: "cancelled" },
  awaiting_payment: { confirmPayment: "paid", cancel: "cancelled" },
  paid: {},
  cancelled: {},
} as const;
```

Reject non-integer or negative minor units at construction. Return new values rather than mutating inputs.

- [ ] **Step 4: Run the domain suite**

Run: `pnpm --filter @li-erikes/domain test`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain packages/testkit
git commit -m "feat: add domain primitives and state machines"
```

### Task 3: Tenant-aware database foundation

**Files:**
- Create: `packages/database/src/schema/organisation.ts`
- Create: `packages/database/src/schema/customers.ts`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/tenant-transaction.ts`
- Create: `packages/database/src/repositories/customer-repository.ts`
- Create: `packages/database/test/tenant-isolation.test.ts`
- Create: `supabase/migrations/0001_tenant_customer_vehicle.sql`
- Create: `supabase/seed.sql`

**Interfaces:**
- Consumes: branded IDs from `@li-erikes/domain`.
- Produces: `withTenant<T>(db, context, work): Promise<T>`; `CustomerRepository.create`, `findById`; tables for tenant, workshop, membership, customer, vehicle, and vehicle ownership.

- [ ] **Step 1: Write the cross-tenant failing integration test**

```ts
const saved = await tenantA.customers.create({ name: "Anna", email: "anna@example.test" });
expect(await tenantA.customers.findById(saved.id)).toMatchObject({ name: "Anna" });
expect(await tenantB.customers.findById(saved.id)).toBeNull();
```

Also attempt a direct tenant-B SQL select under the tenant-B transaction context and expect zero rows.

- [ ] **Step 2: Run the migration test**

Run: `pnpm --filter @li-erikes/database test -- tenant-isolation.test.ts`  
Expected: FAIL because migrations and repositories do not exist.

- [ ] **Step 3: Implement schema, RLS, and transaction context**

Every business table has `tenant_id uuid not null references tenants(id)`. The transaction executes `select set_config('app.tenant_id', $1, true)`. RLS uses `tenant_id = current_setting('app.tenant_id', true)::uuid`. Repository methods never accept a tenant ID from request bodies.

- [ ] **Step 4: Verify migrations and isolation**

Run: `pnpm db:test:reset && pnpm --filter @li-erikes/database test`  
Expected: migration succeeds; isolation tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/database supabase
git commit -m "feat: enforce tenant-aware persistence"
```

### Task 4: Authentication and role authorization

**Files:**
- Create: `apps/api/src/plugins/auth.ts`
- Create: `apps/api/src/plugins/tenant.ts`
- Create: `apps/api/src/security/authorize.ts`
- Create: `apps/api/test/auth.test.ts`
- Create: `packages/contracts/src/auth.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: Supabase JWT claims `sub`, membership rows, and tenant transaction helper.
- Produces: `RequestActor`, `requireRole(request, roles)`, authenticated request context with server-resolved `tenantId`.

- [ ] **Step 1: Write failing authorization tests**

Assert: missing token returns 401; customer calling a staff route returns 403; a valid technician membership succeeds; a token cannot select another tenant through a header or body field.

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @li-erikes/api test -- auth.test.ts`  
Expected: FAIL because auth plugins are absent.

- [ ] **Step 3: Implement verified JWT and membership lookup**

```ts
export type RequestActor = Readonly<{
  userId: UserId;
  tenantId: TenantId;
  roles: readonly ("customer" | "staff" | "technician" | "workshop_admin" | "platform_admin")[];
}>;
```

Verify signature, issuer, audience, expiry, and subject. Resolve tenant from the authenticated membership or server-side route context, never from untrusted payload data.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @li-erikes/api test -- auth.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/contracts
git commit -m "feat: add tenant-aware authentication"
```

### Task 5: Services, scheduling, customers, and vehicles

**Files:**
- Create: `packages/contracts/src/customer.ts`
- Create: `packages/contracts/src/booking.ts`
- Create: `packages/domain/src/scheduling.ts`
- Create: `packages/domain/test/scheduling.test.ts`
- Create: `packages/database/src/schema/operations.ts`
- Create: `apps/api/src/routes/customers.ts`
- Create: `apps/api/src/routes/vehicles.ts`
- Create: `apps/api/src/routes/bookings.ts`
- Create: `apps/api/test/booking.test.ts`
- Create: `supabase/migrations/0002_services_bookings.sql`

**Interfaces:**
- Produces: `CreateVehicleSchema`, `CreateBookingSchema`, `isSlotAvailable(existing, candidate, zone)`; customer, vehicle, service definition, workshop resource, and booking endpoints.
- Consumes: actor context and tenant repositories.

- [ ] **Step 1: Write failing scheduling tests**

Cover adjacent slots, overlapping slots, invalid end-before-start, and Europe/Stockholm transitions on 2026-03-29 and 2026-10-25. Persist instants in UTC and render in workshop timezone.

```ts
expect(isSlotAvailable([{ start, end }], { start: overlapStart, end: overlapEnd })).toBe(false);
expect(isSlotAvailable([{ start, end }], { start: end, end: later })).toBe(true);
```

- [ ] **Step 2: Write failing route tests**

Create customer and vehicle; create booking; assert another tenant gets 404 for the same vehicle ID; assert overlapping resource booking returns `409 SLOT_UNAVAILABLE`.

- [ ] **Step 3: Implement schemas, migrations, pure scheduling rule, and routes**

Use half-open intervals `[start, end)`. The database adds an exclusion constraint for active bookings per resource using a UTC `tstzrange`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @li-erikes/domain test -- scheduling.test.ts && pnpm --filter @li-erikes/api test -- booking.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/api supabase
git commit -m "feat: add vehicles services and booking"
```

### Task 6: Canonical catalogue, fitment, and ranked offers

**Files:**
- Create: `packages/domain/src/catalogue.ts`
- Create: `packages/domain/src/ranking.ts`
- Create: `packages/domain/test/ranking.test.ts`
- Create: `packages/contracts/src/catalogue.ts`
- Create: `packages/database/src/schema/catalogue.ts`
- Create: `apps/api/src/routes/catalogue.ts`
- Create: `apps/api/test/catalogue.test.ts`
- Create: `supabase/migrations/0003_catalogue.sql`

**Interfaces:**
- Produces: `rankOffers(input: RankOffersInput): RankedOffer[]`; canonical part, fitment, supplier part, offer, and ranking-policy persistence; compatible-offers endpoint.
- Consumes: vehicle identity/specification and tenant context.

- [ ] **Step 1: Write failing ranking tests**

```ts
const result = rankOffers({
  now,
  vehicle,
  policy: defaultRankingPolicy,
  offers: [compatibleFresh, incompatibleCheap, compatibleStale],
});
expect(result.map(x => x.offer.id)).toEqual([compatibleFresh.id]);
expect(result[0].explanation).toContain("confirmed fitment");
```

Add tests for deterministic tie-breaking, total delivered price, unknown stock, and expired freshness.

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @li-erikes/domain test -- ranking.test.ts`  
Expected: FAIL because ranking does not exist.

- [ ] **Step 3: Implement hard filters before weighted scoring**

```ts
export type RankingPolicy = Readonly<{
  maxOfferAgeMinutes: number;
  qualityWeight: number;
  priceWeight: number;
  availabilityWeight: number;
  deliveryWeight: number;
}>;
```

Reject offers without confirmed fitment, current price, purchasable stock, or acceptable freshness. Return score components and human-readable explanations.

- [ ] **Step 4: Persist catalogue entities and expose compatible offers**

API response includes `observedAt`, `expiresAt`, delivered price, delivery estimate, and explanation. Staff-only endpoints import canonical parts and fitment.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @li-erikes/domain test && pnpm --filter @li-erikes/api test -- catalogue.test.ts`  
Expected: PASS.

```bash
git add packages apps/api supabase
git commit -m "feat: add compatible ranked parts catalogue"
```

### Task 7: Quarantined OBD-II report ingestion

**Files:**
- Create: `packages/integrations/src/diagnostics/diagnostics-adapter.ts`
- Create: `packages/integrations/src/diagnostics/generic-obd-report.ts`
- Create: `packages/integrations/test/generic-obd-report.test.ts`
- Create: `packages/integrations/src/security/malware-scanner.ts`
- Create: `packages/integrations/src/security/clamav-scanner.ts`
- Create: `packages/integrations/test/clamav-scanner.test.ts`
- Create: `packages/contracts/src/diagnostics.ts`
- Create: `packages/database/src/schema/diagnostics.ts`
- Create: `apps/api/src/routes/diagnostics.ts`
- Create: `apps/worker/src/jobs/scan-diagnostic.ts`
- Create: `apps/api/test/diagnostic-upload.test.ts`
- Create: `supabase/migrations/0004_diagnostics.sql`

**Interfaces:**
- Produces: `DiagnosticsAdapter.parse(input): Promise<NormalizedDiagnosticReport>`; `MalwareScanner.scan(input): Promise<ScanResult>`; ClamAV implementation; upload-init/finalize/status endpoints; scan job.
- Consumes: private storage, scanner result, vehicle ownership, tenant context.

- [ ] **Step 1: Write parser contract tests**

Use fixtures containing `P0300`, repeated codes, unknown text, and malformed input. Expect normalized uppercase codes, preserved raw observations, adapter name, and parser version.

- [ ] **Step 2: Write upload-security tests**

Assert rejection of size above configured maximum; MIME/file-signature mismatch; cross-tenant vehicle; parser invocation before clean scan; and scanner-unavailable status. The latter must remain `quarantined`, not `failed-open`.

- [ ] **Step 3: Implement adapter and quarantine state machine**

```ts
export interface DiagnosticsAdapter {
  readonly name: string;
  readonly version: string;
  parse(input: Readonly<{ bytes: Uint8Array; mediaType: string }>): Promise<NormalizedDiagnosticReport>;
}
```

States: `uploading → quarantined → clean → parsing → parsed`; `quarantined → rejected`. Only `clean` may transition to `parsing`.

- [ ] **Step 4: Implement private upload flow, ClamAV boundary, and worker scan job**

```ts
export interface MalwareScanner {
  scan(input: Readonly<{ bytes: Uint8Array; sha256: string }>): Promise<
    | { status: "clean" }
    | { status: "infected"; signature: string }
    | { status: "unavailable"; reason: string }
  >;
}
```

Use signed, short-lived upload URLs. Finalization records immutable object key and digest. `ClamAvScanner` talks to a configured ClamAV daemon; its contract test uses a fake TCP server. The worker verifies file signature, calls the scanner, and invokes the parser only for `clean`. `unavailable` leaves the object quarantined for retry.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @li-erikes/integrations test && pnpm --filter @li-erikes/api test -- diagnostic-upload.test.ts`  
Expected: PASS.

```bash
git add packages apps supabase
git commit -m "feat: ingest quarantined OBD reports"
```

### Task 8: Quotes, deposits, and idempotent payments

**Files:**
- Create: `packages/domain/src/quotes.ts`
- Create: `packages/domain/test/quotes.test.ts`
- Create: `packages/integrations/src/payments/payment-adapter.ts`
- Create: `packages/integrations/src/payments/fake-payment-adapter.ts`
- Create: `packages/integrations/src/payments/stripe-payment-adapter.ts`
- Create: `packages/integrations/test/payment-contract.ts`
- Create: `packages/integrations/test/stripe-payment-adapter.test.ts`
- Create: `packages/database/src/schema/commerce.ts`
- Create: `packages/contracts/src/quotes.ts`
- Create: `apps/api/src/routes/quotes.ts`
- Create: `apps/api/src/routes/payment-webhooks.ts`
- Create: `apps/api/test/payment-webhook.test.ts`
- Create: `supabase/migrations/0005_quotes_payments.sql`

**Interfaces:**
- Produces: `calculateQuote(input): QuoteTotals`; `PaymentAdapter.createIntent`, `verifyWebhook`, `refund`; Stripe production adapter and fake test adapter; quote approval and payment webhook endpoints.
- Consumes: compatible fresh offers, booking, labour estimate, state machine.

- [ ] **Step 1: Write failing quote tests**

Assert parts require 100 percent prepayment; labour accepts 0, 25, and 100 percent; values outside 0–100 fail; all arithmetic uses integer minor units; changed supplier price invalidates approval.

- [ ] **Step 2: Write failing duplicate-webhook test**

Send the same verified provider event twice and an older event after a newer event. Expect one payment transition, one financial event, and one `release_supplier_order` job.

- [ ] **Step 3: Implement quote calculation, Stripe adapter, and transactional webhook inbox**

```ts
export interface PaymentAdapter {
  createIntent(input: CreatePaymentIntent): Promise<PaymentIntent>;
  verifyWebhook(input: WebhookEnvelope): Promise<VerifiedPaymentEvent>;
  refund(input: RefundRequest): Promise<RefundResult>;
}
```

`StripePaymentAdapter` creates payment intents with the quote ID as idempotency key, stores only Stripe references, verifies the raw webhook body with the configured signing secret, and maps provider states into domain events. Run the shared payment contract against both Stripe fixtures and the fake adapter. Insert provider event ID into a unique inbox table before state changes. Perform inbox insert, payment transition, audit event, and job enqueue in one transaction.

- [ ] **Step 4: Recheck supplier offers before requesting payment**

Return `409 OFFER_RECONFIRMATION_REQUIRED` with updated quote when price, stock, or freshness changed. Never silently charge the new amount.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @li-erikes/domain test -- quotes.test.ts && pnpm --filter @li-erikes/api test -- payment-webhook.test.ts`  
Expected: PASS.

```bash
git add packages apps/api supabase
git commit -m "feat: add quotes deposits and payments"
```

### Task 9: Supplier adapters, imports, orders, and durable retries

**Files:**
- Create: `packages/integrations/src/suppliers/supplier-adapter.ts`
- Create: `packages/integrations/src/suppliers/csv-supplier-adapter.ts`
- Create: `packages/integrations/src/suppliers/manual-order-adapter.ts`
- Create: `packages/integrations/test/supplier-contract.ts`
- Create: `packages/integrations/test/csv-supplier-adapter.test.ts`
- Create: `packages/database/src/schema/jobs.ts`
- Create: `apps/worker/src/job-runner.ts`
- Create: `apps/worker/src/jobs/import-supplier-offers.ts`
- Create: `apps/worker/src/jobs/release-supplier-order.ts`
- Create: `apps/worker/test/retry.test.ts`
- Create: `supabase/migrations/0006_supplier_jobs.sql`

**Interfaces:**
- Produces: `SupplierAdapter.discoverOffers`, `confirmOffer`, `placeOrder`, `getOrder`, `cancelOrder`; durable job runner.
- Consumes: quote/payment release job, canonical-part mappings, tenant supplier configuration.

- [ ] **Step 1: Write the shared adapter contract suite**

The suite exercises deterministic import, preserved provenance, retryable failure, terminal failure, idempotent order keys, confirmed-price change, order lookup, and unsupported cancellation.

- [ ] **Step 2: Implement CSV and manual-order adapters against the contract**

```ts
export interface SupplierAdapter {
  discoverOffers(input: DiscoverOffersInput): Promise<readonly SupplierOfferObservation[]>;
  confirmOffer(input: ConfirmOfferInput): Promise<ConfirmedOffer>;
  placeOrder(input: PlaceSupplierOrderInput): Promise<SupplierOrderResult>;
  getOrder(input: GetSupplierOrderInput): Promise<SupplierOrderSnapshot>;
  cancelOrder(input: CancelSupplierOrderInput): Promise<CancelSupplierOrderResult>;
}
```

CSV rows require supplier SKU, canonical part mapping, SEK price, observed time, stock status, and delivery estimate. Manual ordering produces `awaiting_manual_action` plus a staff task.

- [ ] **Step 3: Write failing retry tests**

Use a fixed clock. Assert bounded exponential backoff, lease expiry recovery, no concurrent double execution, terminal dead-letter status, and staff alert creation.

- [ ] **Step 4: Implement transactional leasing and idempotent order release**

Worker claims jobs with `FOR UPDATE SKIP LOCKED`, stores attempt count and next-run time, and uses quote ID as supplier-order idempotency key. Reconfirm offer immediately before ordering.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @li-erikes/integrations test && pnpm --filter @li-erikes/worker test`  
Expected: PASS.

```bash
git add packages apps/worker supabase
git commit -m "feat: add supplier imports orders and retries"
```

### Task 10: Work orders, completion, history, and reminders

**Files:**
- Create: `packages/domain/src/work-orders.ts`
- Create: `packages/domain/test/work-orders.test.ts`
- Create: `packages/database/src/schema/work-orders.ts`
- Create: `packages/contracts/src/work-orders.ts`
- Create: `apps/api/src/routes/work-orders.ts`
- Create: `apps/worker/src/jobs/create-reminders.ts`
- Create: `packages/integrations/src/notifications/notification-adapter.ts`
- Create: `packages/integrations/src/notifications/smtp-notification-adapter.ts`
- Create: `packages/integrations/test/notification-contract.ts`
- Create: `apps/api/test/work-orders.test.ts`
- Create: `supabase/migrations/0007_work_orders.sql`

**Interfaces:**
- Produces: pending-payment → active → in-progress → completed/cancelled work-order state machine; completion endpoint; service-history entry; `NotificationAdapter.send(message)`; SMTP implementation; reminder jobs.
- Consumes: confirmed booking, verified payment, supplier-order status, actual labour, consumed parts.

- [ ] **Step 1: Write failing work-order tests**

Assert work order is pending before verified payment, becomes active once only, cannot complete without technician and completion time, records actual parts/labour, and creates immutable service history.

- [ ] **Step 2: Write reminder tests**

For a completed seasonal tyre service, create one next-season reminder in workshop timezone and one notification-outbox entry. Re-running the job must not duplicate either. Run the shared notification contract against a recording fake and an SMTP fixture server.

- [ ] **Step 3: Implement work-order transitions and completion transaction**

Completion writes work log, part consumption, remaining balance financial event, service-history entry, audit event, and reminder job atomically. The reminder job writes an idempotent outbox record before `SmtpNotificationAdapter` delivers email; a delivery failure retries without duplicating the reminder.

- [ ] **Step 4: Add staff routes with role checks**

Technicians may update assigned work; workshop administrators may reassign or cancel; customers may read only their own work-order summary.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @li-erikes/domain test -- work-orders.test.ts && pnpm --filter @li-erikes/api test -- work-orders.test.ts`  
Expected: PASS.

```bash
git add packages apps supabase
git commit -m "feat: add work orders and maintenance history"
```

### Task 11: Customer and workshop PWA

**Files:**
- Create: `apps/web/lib/api-client.ts`
- Create: `apps/web/lib/auth.ts`
- Create: `apps/web/app/(customer)/vehicles/page.tsx`
- Create: `apps/web/app/(customer)/book/page.tsx`
- Create: `apps/web/app/(customer)/book/actions.ts`
- Create: `apps/web/app/(staff)/workshop/page.tsx`
- Create: `apps/web/app/manifest.ts`
- Create: `apps/web/public/icon-192.png`
- Create: `apps/web/public/icon-512.png`
- Create: `apps/web/test/booking-flow.test.tsx`
- Create: `tests/e2e/booking-to-work-order.spec.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Consumes: contract-derived API client, authenticated session, all V1 endpoints.
- Produces: installable responsive customer booking journey and staff approval/work-order dashboard.

- [ ] **Step 1: Write failing component tests**

Test vehicle selection, diagnostic upload status, compatible-offer explanations, stale-offer reconfirmation, appointment selection, quote summary, deposit disclosure, and accessible validation messages.

- [ ] **Step 2: Implement contract-validated API client and customer flow**

The client validates API responses with shared Zod schemas. Use server actions only as authenticated API proxies; do not import database code into the web app.

- [ ] **Step 3: Implement staff dashboard**

Show bookings awaiting review, diagnostics, chosen parts, freshness, quote, payment, supplier-order/manual-action status, and work-order transitions. Require explicit confirmation for diagnosis and fitment exceptions.

- [ ] **Step 4: Write and run the full Playwright acceptance test**

```ts
test("customer booking becomes a completed work order", async ({ page }) => {
  await seedWorkshopScenario();
  await customerBooksWithObdReport(page);
  await staffApprovesQuote(page);
  await fakeProviderConfirmsPayment();
  await workerDrainsJobs();
  await staffCompletesWorkOrder(page);
  await expect(page.getByText("Service completed")).toBeVisible();
});
```

Run: `pnpm test:e2e`  
Expected: principal flow PASS on mobile and desktop projects.

- [ ] **Step 5: Verify PWA and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`  
Expected: all commands exit 0; manifest and icons are present; critical pages pass automated accessibility checks.

```bash
git add apps/web tests playwright.config.ts
git commit -m "feat: deliver customer and workshop PWA"
```

### Task 12: Security hardening, deployment, and operational proof

**Files:**
- Create: `apps/api/src/plugins/security.ts`
- Create: `apps/api/src/routes/privacy.ts`
- Create: `apps/api/test/security.test.ts`
- Create: `apps/api/test/privacy.test.ts`
- Create: `docs/operations/deployment.md`
- Create: `docs/operations/ad-integration-request.md`
- Create: `docs/operations/incident-runbook.md`
- Create: `railway.toml`
- Create: `vercel.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed vertical slice.
- Produces: rate limits, secure headers, upload limits, privacy export/deletion workflow, deployment configuration, AD access request, and operating runbooks.

- [ ] **Step 1: Write failing security and privacy tests**

Assert secure headers; route-specific rate limits; body and upload size limits; webhook signature failure; audit immutability; customer export contains owned data; deletion anonymizes legally retainable financial records while removing unnecessary personal data.

- [ ] **Step 2: Implement security controls and privacy jobs**

Configure Fastify helmet, rate limiting, schema body limits, request IDs, redacted structured logs, and append-only audit repository. Privacy deletion uses an explicit retention policy and records completion without retaining the deleted payload.

- [ ] **Step 3: Add deployment configuration and environment validation**

Document exact required variables by service, including Supabase URLs/keys, Stripe secret and webhook secret, ClamAV host/port, SMTP host/port/user/password/from-address, and public API origin. Startup must fail with a named missing-variable error. Railway runs separate API and worker commands; Vercel builds only `apps/web`; Supabase migrations run as an explicit release step.

- [ ] **Step 4: Write AD integration request and fallback runbook**

The request asks for supported API/EDI/export access to product, fitment, customer pricing, stock, delivery, ordering, status, cancellation, rate limits, sandbox, and licensing. The fallback documents CSV import plus manual orders and explicitly prohibits authenticated scraping.

- [ ] **Step 5: Run the release gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && pnpm audit --prod`  
Expected: all tests/builds pass and production audit reports no known high or critical vulnerabilities.

```bash
git add .
git commit -m "chore: harden and document V1 deployment"
```
