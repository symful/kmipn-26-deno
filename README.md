# SIGAP — Sistem Informasi Gestão Área Penyakit

Backend API for SIGAP, a disease area management information system. Built on Hono running on Cloudflare Workers, with a Vite React SPA for the admin interface.

## Project Overview

SIGAP is a full-stack application for managing disease area reports and verification workflows. The backend exposes a REST API consumed by both the React admin SPA and external integrations. Reports flow through a structured pipeline: warga submissions, surveyor tasks, verifikator review, and operator management.

The system uses event sourcing via an outbox pattern to sync with external systems (SIPD, Satu Data). Background jobs handle retry logic, token cleanup, and assessment processing.

## Stack

| Layer | Technology |
|---|---|
| API Framework | [Hono](https://hono.dev/) |
| Runtime | Cloudflare Workers (V8 isolates) |
| Frontend | Vite + React SPA (served from `web/`) |
| Database | PostgreSQL + PostGIS via Cloudflare Hyperdrive |
| D1 | D1 binding reserved for future use; current data layer is PostgreSQL via Hyperdrive |
| Object Storage | Cloudflare R2 |
| Auth | JWT via [jose](https://github.com/panva/jose) |
| Validation | [Zod](https://zod.dev/) |
| TypeScript | Throughout |

## Prerequisites

- Node.js 20 or later
- npm 10 or later
- Cloudflare Wrangler (`npm install -g wrangler`)
- A Cloudflare account with Workers and Hyperdrive available

## Setup

Install dependencies:

```bash
npm install
```

Configure environment variables:

```bash
cp .env.example .env
```

Open `.env` and fill in the required values. The variables most critical for local development are:

| Variable | Description |
|---|---|
| `POSTGRESQL_URI` | PostgreSQL connection string (from Hyperdrive) |
| `JWT_SECRET` | Secret for signing JWTs. Generate with `openssl rand -base64 32` |
| `LLM_API_KEY` | API key for the LLM provider |
| `LLM_API_URI` | LLM provider endpoint |
| `R2_PUBLIC_URL` | Public URL for R2 bucket |

Check your setup:

```bash
npm run check:env
```

## Database Migrations

Migrations live in `migrations/` as timestamped SQL files. They are applied in filename order.

Apply all pending migrations:

```bash
npm run migrate
```

Check migration status without running them:

```bash
npm run migrations:status
```

Run migrations first before seeding or starting the dev server.

## Seeding

Seed the database with development data:

```bash
npm run seed
```

This runs migrations first, then seeds accounts only. It does not seed wilayah (regional) data or reports.

For KPI-phase seeding:

```bash
npm run seed:kpis
```

## Development

Start the dev server:

```bash
npm run dev
```

Wrangler will start the Worker on `http://localhost:8787`. The SPA from `web/dist` is served by the Worker itself.

## Building

Build both the SPA and the Worker:

```bash
npm run build
```

The SPA is compiled to `web/dist` and copied to `dist/client`. The Worker is compiled to `dist/index.js`.

## Type Checking

Run TypeScript type checking without emitting files:

```bash
npm run typecheck
```

## Code Generation

Run code generation scripts:

```bash
npm run codegen
```

## Testing

Run unit tests:

```bash
npm run test
```

Watch mode for unit tests:

```bash
npm run test:watch
```

Run API integration tests:

```bash
npm run test:api
```

Run end-to-end tests with Playwright:

```bash
npm run test:e2e
```

Open the Playwright UI:

```bash
npm run test:e2e:ui
```

## Deployment

### Pre-Deployment Checklist

Before deploying, verify:

1. **Environment variables** — `.env` has all required values (`POSTGRESQL_URI`, `JWT_SECRET`, `LLM_API_KEY`, `R2_PUBLIC_URL`, `APP_BASE_URL`)
2. **Migrations applied** — Run `npm run migrations:status` to confirm all migrations are applied
3. **Build succeeds** — Run `npm run build` locally to catch any compilation errors
4. **TypeScript clean** — Run `npm run typecheck` to verify no type errors

### Production Environment Setup

For production, ensure the following variables are set in your Cloudflare Workers environment (via `wrangler secret put` or Cloudflare dashboard):

```bash
# Required secrets
wrangler secret put JWT_SECRET
wrangler secret put LLM_API_KEY
wrangler secret put POSTGRESQL_URI

# Required vars (can be in .env or dashboard)
# POSTGRESQL_URI, R2_PUBLIC_URL, APP_BASE_URL, ALLOWED_ORIGINS
```

### Deploy

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

Dry run (validates config without deploying):

```bash
npm run deploy:dryrun
```

Both commands run `npm run build` first, then deploy with `wrangler deploy`.

### Test Against Deployed URL

After deploying, verify the worker is running:

```bash
# Health check
curl https://your-worker.your-subdomain.workers.dev/api/health

# Expected: {"ok":true}
```

The `APP_BASE_URL` environment variable should match the deployed worker URL (e.g., `https://sigap.live`). Update this before deploying if the URL changed.

## Project Structure

```
kmipn-26-deno/
├── src/
│   ├── index.ts              # Hono app entry point, route registration
│   ├── lib/                  # Shared libraries
│   │   ├── auth.ts           # JWT validation and token handling
│   │   ├── db.ts            # Database client (Hyperdrive)
│   │   ├── r2.ts            # R2 storage client
│   │   ├── logger.ts        # Structured logging
│   │   ├── schemas.ts       # Zod schemas
│   │   ├── rbac.ts          # Role-based access control
│   │   ├── audit.ts         # Audit logging
│   │   ├── outbox/          # Outbox pattern implementation
│   │   │   └── adapters/    # SIPD and Satu Data adapters
│   │   ├── agent/           # LLM agent tools
│   │   │   └── tools/        # Individual agent tools
│   │   └── priority/        # Priority calculation
│   ├── routes/               # API route modules
│   │   └── api/             # Route handlers under /api/*
│   │       ├── auth/         # Login, refresh, logout
│   │       ├── reports/      # Report CRUD and actions
│   │       ├── verifikator/  # Verifikator queue and case handling
│   │       ├── operator/     # Operator case management
│   │       ├── petugas/      # Petugas task handling
│   │       ├── surveyor/     # Surveyor tasks
│   │       ├── warga/        # Warga complaint and evidence
│   │       ├── admin/       # Admin panel endpoints
│   │       ├── admin-daerah/ # Regional admin endpoints
│   │       ├── auditor/      # Auditor search and export
│   │       ├── executive/    # Executive dashboard
│   │       ├── agent/        # LLM agent endpoints
│   │       ├── facilities/   # Facility management
│   │       ├── public/       # Public (unauthenticated) endpoints
│   │       ├── audit/        # Audit trail endpoints
│   │       ├── export/       # GeoJSON and CSV export
│   │       ├── sync/         # Batch sync operations
│   │       ├── cron/         # Scheduled job endpoints
│   │       └── webhooks/     # Inbound webhook handlers
│   ├── scripts/              # Standalone scripts
│   │   ├── run_migrations.ts  # Migration runner
│   │   ├── migrations_status.ts
│   │   ├── seed.ts           # Main seed script
│   │   ├── seed_phase2.ts    # Phase 2 seed data
│   │   ├── seed_phase_kpis.ts # KPI seed data
│   │   ├── codegen.ts        # Code generation
│   │   ├── check_env.ts      # Environment validation
│   │   └── purge.ts          # Data purge script
│   ├── middleware/           # Hono middleware
│   │   ├── csp.ts           # Content Security Policy
│   │   └── roles.ts         # Role validation
│   └── types/                # TypeScript types
│       └── bindings.ts       # Cloudflare bindings (Env)
├── web/                      # React SPA (Vite)
│   ├── src/                 # SPA source
│   ├── dist/                # Built SPA (served by Worker)
│   └── package.json
├── migrations/               # SQL migration files (timestamped)
├── wrangler.jsonc            # Wrangler configuration
└── package.json              # Root npm scripts
```

## Authentication

The API uses JWT-based authentication. Clients obtain a token by POSTing username and password to `/api/auth/login`. The token must be sent in the `Authorization` header as `Bearer <token>`.

JWTs are signed with the secret in `JWT_SECRET` and validated on every protected route using the `AuthVariables` middleware.

All authentication is username/password only.

Token refresh is available via `/api/auth/refresh`. Logout invalidates the token on the server side.

## API Routes Overview

The API is organized under `/api/`. Key route groups:

- `/api/auth/*` — Login, logout, refresh, registration
- `/api/reports/*` — Report CRUD, priority, assignment, escalation, resolution
- `/api/verifikator/*` — Verifikator queue, case review, accept/reject/decide
- `/api/operator/*` — Operator case management, merge, separate
- `/api/petugas/*` — Petugas task handling, evidence, completion
- `/api/surveyor/*` — Surveyor task management
- `/api/warga/*` — Warga complaint submissions, evidence upload
- `/api/admin/*` — Admin panel: users, units, KPI config, sync
- `/api/admin-daerah/*` — Regional admin: dashboard, cases, stats, SLA
- `/api/auditor/*` — Audit search, export, system logs
- `/api/executive/*` — Executive dashboard, regional stats, trends
- `/api/agent/*` — LLM agent assessment and consolidation
- `/api/facilities/*` — Facility management, merge, split
- `/api/public/*` — Public endpoints (no auth required)
- `/api/export/*` — GeoJSON and CSV export
- `/api/audit/*` — Audit trail queries
- `/api/outbox/*` — Outbox management and DLQ
- `/api/cron/*` — Cron-triggered job endpoints
- `/api/webhooks/*` — Inbound webhook handlers
- `/api/notifications/*` — User notifications
- `/api/health` — Health check

## Scheduled Jobs

The Worker handles scheduled invocations (via Cloudflare Cron Triggers) for:

- Processing pending outbox events
- Retrying failed outbox events
- Retrying failed LLM assessments
- Cleaning up revoked tokens

These run automatically based on the cron schedule configured in `wrangler.jsonc`.

## Environment Variables

Full configuration is in `.env.example`. Key variables:

### Required for Development

- `POSTGRESQL_URI` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing secret
- `LLM_API_KEY` — LLM provider API key

### Storage and URLs

- `R2_PUBLIC_URL` — Public URL for uploaded files
- `APP_BASE_URL` — Base URL of the deployed application
- `CF_REPORTING_DOMAIN` — Domain for Cloudflare reporting

### Outbox and Integrations

- `OUTBOUND_TARGETS` — JSON object mapping event types to outbound endpoints
- `SIPD_ENDPOINT_URL` — SIPD integration endpoint
- `SATU_DATA_ENDPOINT_URL` — Satu Data integration endpoint
- `OUTBOX_MAX_RETRIES` — Max retries for failed outbox events
- `OUTBOX_RETRY_DELAYS_MINUTES` — Retry delay schedule

### LLM Configuration

- `TEXT_MODEL_NAME` — Text generation model name
- `VISION_MODEL_NAME` — Vision model name
- `LLM_API_URI` — LLM API endpoint

### Security

- `ALLOWED_ORIGINS` — Comma-separated list of allowed CORS origins
- `RATE_LIMIT_ENABLED` — Toggle rate limiting
- `JWT_SECRET` — Must be set for auth to work

## Troubleshooting

### Migration fails

Run `npm run migrations:status` to see which migrations are applied and which are pending. Check that `POSTGRESQL_URI` is correct and the database is reachable.

### Login returns 401

Verify `JWT_SECRET` is set in `.env`. If the secret changes, existing tokens become invalid and users must log in again.

### SPA not loading

Run `npm run build` to ensure `web/dist` is populated. The Worker serves static files from `dist/client`.

### TypeScript errors everywhere

Run `npm run typecheck` to see the full list. Common causes: missing `.env` variables, stale `node_modules`, or mismatched TypeScript versions. Try `npm install` first.

### LLM requests failing

Check `LLM_API_KEY`, `LLM_API_URI`, `TEXT_MODEL_NAME`, and `VISION_MODEL_NAME`. Ensure the API key has sufficient quota.

### Outbox events not processing

Check the outbox DLQ at `/api/outbox/dlq`. Increase `OUTBOX_MAX_RETRIES` if events are failing permanently. Verify `OUTBOUND_TARGETS` is correctly configured.
