# Li-Erikes Apparat

Li-Erikes Apparat is a tenant-ready platform for automotive workshop operations.

## Workspace

The monorepo contains the customer and staff web app, the Fastify API, a background
worker, and shared packages for contracts, domain rules, database access,
integrations, and test support.

Use Node 24 or newer and pnpm 10:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Copy `.env.example` to `.env` and provide environment values before connecting to
external services.
