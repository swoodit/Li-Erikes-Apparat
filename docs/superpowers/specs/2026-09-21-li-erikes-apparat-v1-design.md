# Li-Erikes Apparat V1 Design

Date: 2026-09-21  
Status: Approved conversational design; awaiting written-spec review

## Purpose

Li-Erikes Apparat is a reusable business platform owned by Li-Erikes. Its first usable release serves one automotive workshop while preserving clean tenant boundaries for later use by additional workshops, businesses, and brands.

V1 gives customers a coherent path from vehicle and diagnostic information to compatible parts, an appointment, payment, and a workshop work order. It must reduce administrative work without allowing automated diagnostics or supplier data to silently authorize unsafe or incorrect repairs.

## Success criteria

V1 succeeds when:

- a customer can register a vehicle in an installable responsive web app;
- the customer can upload a generic OBD-II diagnostic report or select a service need;
- the system can normalize diagnostic information without treating it as an approved repair;
- the catalogue shows curated, vehicle-compatible parts ranked by a configurable balanced score;
- the customer can select parts and an appointment together;
- the workshop can review and approve diagnosis, parts, price, and timing;
- parts can be prepaid and labour can use a configurable deposit up to full prepayment;
- successful approval and payment create traceable supplier-order and work-order records;
- external-system failures remain recoverable through retries and explicit staff workflows;
- all business records are tenant-scoped even though only one workshop is enabled initially.

## Scope

### Included in V1

- Customer and staff authentication
- One active workshop with tenant-ready data isolation
- Customer and vehicle records
- Generic OBD-II report upload and normalization
- Service definitions and labour estimates
- Curated canonical parts catalogue
- Vehicle-to-part fitment
- Supplier offers with price, stock, delivery, provenance, and freshness
- Configurable offer ranking
- Booking and workshop scheduling
- Quotes, customer approval, parts prepayment, and labour deposits
- Supplier-order tracking
- Work orders and service history
- Maintenance reminders
- Audit events
- Responsive PWA for customers and workshop staff

### Outside V1

- Native Android or iOS applications
- Direct OBD hardware communication
- Automatic approval of repairs
- Activation of multiple independent workshops
- Broad accounting or payroll functionality
- Reliance on undocumented authenticated-site scraping
- A large set of supplier integrations before the first complete vertical flow works

## Architecture

Use a modular TypeScript monolith in a monorepo. This keeps deployment and transactions simple while enforcing domain boundaries that can be extracted later if proven necessary.

### Repository structure

- `apps/web`: Next.js customer and staff PWA
- `apps/api`: Fastify HTTP API
- `apps/worker`: background imports, collection, retries, and notifications
- `packages/domain`: framework-independent business rules and state transitions
- `packages/integrations`: external adapter interfaces and implementations
- `packages/database`: PostgreSQL schema, migrations, and persistence helpers
- `packages/contracts`: shared, runtime-validated API contracts

### Runtime

- Vercel hosts the PWA.
- Railway hosts the API and worker.
- Supabase supplies PostgreSQL, authentication, and private object storage.
- GitHub Actions performs continuous verification.

The PWA talks to the Fastify API. The API owns business authorization and transaction boundaries. Background work is recorded durably and processed by the worker. The web client never receives supplier, payment, or service credentials.

## Tenant model

Every business-owned record carries a non-null `tenant_id`. User access is expressed through tenant memberships and roles. The first deployment provisions one workshop, but tenant isolation is enforced from the first migration in both API authorization and database policies.

V1 roles:

- customer
- staff
- technician
- workshop administrator
- platform administrator

## Core workflow

1. The customer registers a vehicle using registration number or VIN and confirms resolved details.
2. The customer uploads an OBD-II report or selects a service need.
3. Diagnostics normalization stores the original report, parser version, normalized fault codes, and observations.
4. The system suggests relevant service categories. Suggestions are informational until workshop confirmation.
5. The catalogue filters canonical parts by confirmed vehicle fitment.
6. Active supplier offers are ranked using compatibility, quality, total price, availability, and delivery time.
7. The customer selects parts and an available appointment slot.
8. The system creates a quote with parts, estimated labour, and required prepayment.
9. Workshop staff review diagnosis, compatibility, price, availability, and schedule.
10. The customer approves and pays the required amount.
11. Workshop confirmation creates the work order in a pending-payment state. Verified payment releases the supplier order and activates the work order.
12. Staff record actual work, labour, parts consumed, and remaining balance.
13. Completion updates vehicle history and future maintenance reminders.

## Payment policy

- Parts are prepaid at 100 percent by default.
- Labour uses a configurable deposit between 0 and 100 percent.
- Workshop staff may override the percentage per quote when authorized.
- Any remaining balance is paid after completion.
- No card data is stored by Li-Erikes Apparat.
- Payment creation, callbacks, refunds, and reconciliation use idempotency keys.
- Supplier purchasing never proceeds solely because a browser returned from a payment page; verified provider state is required.

## Domain model

### Organisation

`Tenant`, `Workshop`, `User`, `Membership`, and `Role` establish ownership and authorization.

### Customer and vehicle

`Customer`, `Vehicle`, and `VehicleOwnership` separate a person's profile from an asset and preserve ownership history.

### Diagnostics

`DiagnosticReport`, `DiagnosticObservation`, and `FaultCode` retain the original evidence and normalized interpretation. The parser version is immutable for each normalization result.

### Service

`ServiceDefinition`, `LabourEstimate`, and `MaintenanceRule` define offered work without binding it to a specific booking.

### Catalogue and supply

`Part` is the canonical product. `VehicleFitment` connects it to compatible vehicles. `SupplierPart` maps a supplier SKU to a canonical part. `SupplierOffer` stores price, stock, delivery estimate, quality signals, source, and observation time.

Supplier offers may change without changing the canonical part or service history.

### Workshop operations

`Booking`, `Quote`, `QuoteLine`, `WorkOrder`, `WorkLog`, and `PartConsumption` represent the progression from request to completed work.

### Commerce

`SupplierOrder`, `SupplierOrderLine`, `Payment`, `Refund`, and `FinancialEvent` record commercial state without attempting to replace a future accounting system.

### Maintenance

`ServiceHistoryEntry`, `MaintenancePlan`, and `Reminder` support recurring needs such as seasonal tyres and scheduled service.

## Catalogue ranking

Only compatible, purchasable offers enter the customer-facing result set. The default score balances:

- confirmed vehicle fitment;
- part and manufacturer quality;
- total price including delivery;
- current stock confidence;
- delivery time;
- offer freshness;
- workshop-configured preferences.

The calculation is deterministic, versioned, and explainable. Customers may sort or filter eligible offers, but cannot bypass hard compatibility exclusions. Staff may manually approve an exception with an audited reason.

## Supplier strategy

All suppliers implement `SupplierAdapter`. The interface separates:

- catalogue discovery or import;
- offer refresh;
- fitment evidence;
- availability confirmation;
- order placement;
- order status;
- cancellation where supported.

Public-site collection may be implemented only where technically and contractually permitted. Collectors store provenance and collection time and never masquerade stale data as current.

AD Sverige exposes a login-protected AD Katalog, but no public developer documentation was identified during design research. The workshop is believed to be AD-affiliated and already has an account. Before building authenticated automation, the customer should request supported API, EDI, product-feed, fitment, price, stock, and ordering access from AD. An `AdSupplierAdapter` remains an explicit boundary regardless of whether its first implementation uses an authorized API, export, or another supported mechanism. If AD does not grant supported machine access for V1, the fallback is an authorized catalogue export or CSV import plus manual supplier ordering; V1 will not scrape the authenticated catalogue.

## Diagnostics strategy

All diagnostic sources implement `DiagnosticsAdapter`. V1 accepts uploaded generic OBD-II reports. The original file is stored privately. Parsing produces normalized observations linked to a parser name and version.

Later adapters may ingest directly from diagnostic software or hardware without changing booking, service, or work-order domains.

Diagnostic output may suggest service categories and candidate parts. It never confirms a repair or fitment without the configured workshop review.

## Other integrations

External boundaries include:

- `SupplierAdapter`
- `DiagnosticsAdapter`
- `VehicleDataAdapter`
- `PaymentAdapter`
- `NotificationAdapter`

Adapter contracts use domain-owned request and result types so third-party payloads do not leak into core business logic.

## State and failure handling

Bookings, quotes, payments, supplier orders, and work orders use explicit state transitions. Invalid transitions fail without partial mutation.

Integration rules:

- imports and callbacks are idempotent;
- raw source references and observation timestamps are retained;
- prices and stock have configurable freshness limits;
- price and availability are rechecked before payment or supplier ordering;
- transient failures enter a durable retry queue with bounded backoff;
- terminal failures create actionable staff alerts;
- duplicate payment webhooks cannot duplicate payments or supplier orders;
- staff can complete supplier ordering manually and record the external reference;
- customer-facing status distinguishes pending confirmation, delayed integration, and failure.

## Security and privacy

- Supabase provides authentication; the API performs business authorization.
- Database policies reinforce tenant isolation.
- Backend credentials remain in managed environment variables.
- Supplier account credentials are never exposed to customer clients.
- Diagnostic files and vehicle records are private by default.
- Sensitive actions create append-only audit events.
- Stored personal data is limited to operational need.
- Export, correction, retention, and deletion workflows support GDPR obligations.
- Payment providers handle card data; the platform stores only provider references and business status.
- Uploaded content is size-limited, validated by declared type and file signature, quarantined in private storage, scanned before parsing, and processed outside request threads. Files remain quarantined if the scanner is unavailable.

## Testing

### Unit tests

Cover fitment rules, ranking, deposits, quote totals, permissions, and state transitions.

### Contract tests

Every adapter implementation must pass a shared contract suite covering success, retryable failure, terminal failure, stale data, and idempotency.

### Integration tests

Run against PostgreSQL and verify migrations, tenant isolation, persistence, durable jobs, and webhook handling.

### End-to-end tests

The principal acceptance flow is:

OBD-II report → service suggestion → compatible parts → booking → workshop approval → payment → supplier order → work order → completion.

Additional end-to-end cases cover stale offers, changed prices, duplicate webhooks, supplier outage, manual ordering, refund, and unauthorized cross-tenant access.

### Continuous integration

GitHub Actions runs formatting, linting, type checking, unit tests, integration tests, migration validation, dependency review, and security scanning.

## Delivery sequence

Implementation should preserve a running vertical slice:

1. Monorepo, tooling, health checks, and CI
2. Tenant-aware authentication and authorization
3. Customer and vehicle records
4. Services, bookings, and scheduling
5. Canonical catalogue, fitment, supplier offers, and ranking
6. OBD-II upload and normalization
7. Quotes and configurable prepayment
8. Payment adapter and webhook handling
9. Supplier ordering and worker retries
10. Work-order completion, history, and reminders
11. PWA installability, accessibility, and operational hardening

## Decision summary

- One workshop first; tenant-ready from the first migration
- Responsive PWA rather than native applications
- TypeScript modular monolith rather than microservices
- Vercel, Railway, and Supabase deployment split
- Generic OBD-II report import first; direct integrations later
- Curated canonical catalogue backed by replaceable supplier adapters
- Balanced, explainable offer ranking
- AD supported integration preferred; authenticated automation only with authorization
- Parts prepaid; labour deposit configurable up to full prepayment
- Workshop approval remains authoritative for diagnosis, parts, pricing, and repair
