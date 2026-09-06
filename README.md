# SIGAP — Sistem Informasi Geospasial & Penanganan Laporan Desa

Backend API & Web Admin SPA for **SIGAP** — an end-to-end village infrastructure reporting, geospatial monitoring, and automated decision support platform. Built with **Hono** running on **Cloudflare Workers** (V8 Isolates), **Cloudflare D1** (Serverless SQLite), **Cloudflare R2** (Object Storage), and a **Vite React SPA** frontend.

---

## 🌟 System Overview

SIGAP connects rural communities, village officials, field surveyors, technical officers, and regional decision-makers in a unified, transparent reporting lifecycle:

```
[ Warga Submission ] ──> [ Agentic AI Assessment ] ──> [ RT/RW Review ]
                                                              │
                                                              ▼
[ Petugas / Surveyor ] <── [ Admin Case Assignment ] <── [ Admin Review ]
         │
         ▼
[ Completion Proof ] ──> [ Verification ] ──> [ Executive Insights ]
```

### ⚡ Key Capabilities

- **Multi-Level Verification Pipeline**: Citizen reports flow through AI validation, local RT/RW review, admin case review, field execution, and completion auditing.
- **Agentic AI Vision Engine**: Multi-tool LLM pipeline that performs severity scoring, damage categorization, fraud/duplication detection, and priority recommendations.
- **Geospatial Intelligence**: Nationwide Indonesia map viewport centering and boundary containment (`LatLng(-2.548926, 118.0148634)`), cluster analysis, heatmap visualizations, and GeoJSON exports.
- **Role-Based Access Control (RBAC)**: Strict role-isolated permissions covering 3 role-based access levels (ADMIN, PETUGAS, WARGA).
- **High-Performance Serverless Edge**: Sub-50ms latency globally powered by Cloudflare Workers and D1 database replication.

---

## 🛠️ Technology Stack

| Layer                 | Technology                                    | Description                                                       |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| **API Framework**     | [Hono v4](https://hono.dev/)                  | Ultra-fast web framework tailored for edge runtimes               |
| **Runtime Engine**    | Cloudflare Workers                            | V8 isolates with zero cold-starts                                 |
| **Database**          | Cloudflare D1                                 | Distributed serverless SQLite with full ACID compliance           |
| **Media Storage**     | Cloudflare R2                                 | S3-compatible zero-egress bucket storage for report photos        |
| **Frontend Web**      | React 18 + Vite + Tailwind CSS                | Admin and Public Web Portals                                      |
| **Geospatial Maps**   | Leaflet + OpenStreetMap                       | Interactive mapping, clusters, heatmaps, and coordinate geocoding |
| **Authentication**    | JWT via [jose](https://github.com/panva/jose) | Secure JWT access tokens with role claims and refresh rotation    |
| **Schema Validation** | [Zod](https://zod.dev/)                       | Type-safe schema validation across all request endpoints          |
| **Language**          | TypeScript                                    | End-to-end strict type safety                                     |

---

## 📁 Repository Structure

```
kmipn-26-deno/
├── src/                    # Backend API (Cloudflare Worker)
│   ├── index.ts            # Main application router and middleware
│   ├── routes/             # Modular API route families
│   │   ├── r2.ts           # R2 proxy route
│   │   └── api/            # File-based API route modules
│   │       ├── auth/       # Authentication & registration endpoints
│   │       ├── reports/    # Report CRUD, photos, geospatial queries
│   │       ├── cases/      # Case queue, review, accept/reject, sanggahan
│   │       ├── tasks/      # Task lifecycle, acceptance, progress, completion
│   │       ├── agent/      # AI assessment agent tools
│   │       ├── admin-daerah/ # Regional unit management & SLA
│   │       ├── auditor/    # Immutable audit trail & search
│   │       ├── executive/  # Executive KPI trends & aggregations
│   │       ├── export/     # GeoJSON, CSV & PDF export services
│   │       ├── public/     # Public-facing data endpoints
│   │       └── ...         # Other route modules (categories, wilayah, etc.)
│   ├── db/                 # D1 database client and queries
│   ├── middleware/         # Auth, RBAC, Rate-limit, CORS, Logger
│   └── services/           # AI LLM vision, R2 upload & notifications
├── web/                    # Frontend React SPA
│   ├── src/
│   │   ├── components/     # Layout, Sidebar, Maps, StatusBadges, Tables
│   │   ├── pages/          # Dashboard and workflow pages
│   │   ├── theme/          # Design tokens (Colors, Typography, Radii)
│   │   └── api/            # API client with token interceptors
├── scripts/
│   ├── drop_all_tables.sql # Drop all application tables
│   ├── schema.sql          # Complete canonical D1/SQLite schema
│   └── seed.sql            # Reference data (users, categories, units, SLA, etc.)
├── wrangler.json           # Cloudflare deployment & binding configuration
└── package.json            # Project scripts and dependencies
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Wrangler CLI**: `npm install -g wrangler`
- **Cloudflare Account**: with D1 and R2 activated

### 2. Installation

```bash
cd kmipn-26-deno
npm install
cd web && npm install && cd ..
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and fill in the required environment parameters:

```bash
cp .env.example .env
```

Cloudflare Worker Secrets (configured via `wrangler secret put <KEY>`):

- `JWT_SECRET`: 256-bit cryptographically secure string (`openssl rand -base64 32`)
- `LLM_API_KEY`: LLM vision provider API key
- `LLM_API_URI`: LLM vision endpoint
- `PHOTO_EVIDENCE_SECRET`: Photo metadata encryption key

---

## 💾 Database Setup

All SQL files live in `scripts/`:

| File                    | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `scripts/drop_all_tables.sql` | Drops all application tables (order-safe) |
| `scripts/schema.sql`    | Creates all 27 tables and indexes              |
| `scripts/seed.sql`      | Seeds users, categories, units, SLA rules, priority formula, checklists |

### Rebuild Remote Database

```bash
# Drop everything
npx wrangler d1 execute kmipn-26-deno --remote --file=scripts/drop_all_tables.sql --yes

# Create tables
npx wrangler d1 execute kmipn-26-deno --remote --file=scripts/schema.sql --yes

# Seed reference data
npx wrangler d1 execute kmipn-26-deno --remote --file=scripts/seed.sql --yes
```

### Local Development

```bash
# Reset local D1 (drops + creates + seeds)
npm run db:reset:local

# Or seed only missing rows
npm run db:seed:local

# Validate schema in isolated SQLite
npm run db:check
```

---

## 💻 Available Scripts

| Command                  | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `npm run dev`            | Runs backend worker and frontend Vite SPA simultaneously in dev mode |
| `npm run build`          | Compiles Vite frontend SPA and checks Worker TypeScript code         |
| `npm run deploy`         | Builds and deploys Worker + Web SPA to Cloudflare production         |
| `npm run typecheck`      | Runs TypeScript compiler checks without emitting files               |
| `npm run db:seed:local`  | Adds missing local demo seed rows                                    |
| `npm run db:reset:local` | Rebuilds local D1 from the canonical schema and seed                 |
| `npm run db:check`       | Validates a clean schema and seed in isolated SQLite                 |

---

## 🌐 Production Deployment

```bash
npm run deploy
```

- **Live Worker URL**: [https://sigap.live](https://sigap.live)
- **Web SPA Entry**: Served at `/` and all web client routes
- **REST API Entry**: Served under `/api/*`

---

## 👥 Test Accounts

| Role        | Email                | Password     | Access                                                          |
| ----------- | -------------------- | ------------ | --------------------------------------------------------------- |
| **ADMIN**   | `admin@sigap.live`   | `admin123`   | Full system access: users, categories, SLA, audit, exports      |
| **PETUGAS** | `petugas@sigap.live` | `petugas123` | Field tasks, progress, completion photos, survey checklists     |
| **WARGA**   | `warga@sigap.live`   | `warga123`   | Create reports, upload evidence, track status, file sanggahan   |

---

## 📡 API Endpoints

### Authentication (`/api/auth`)

- `POST /api/auth/login` — Authenticate and issue JWT tokens
- `POST /api/auth/register` — Citizen registration
- `POST /api/auth/refresh` — Rotate refresh token
- `GET /api/auth/me` — Current session and role

### Reports & Geospatial (`/api/reports`)

- `GET /api/reports` — List and filter reports
- `POST /api/reports` — Submit new report
- `GET /api/reports/:id` — Report detail with timeline
- `POST /api/reports/photos/upload-url` — R2 photo upload URL
- `GET /api/reports/heatmap` — Heatmap coordinates
- `GET /api/reports/duplicates` — Duplicate detection

### Workflow

- `/api/cases/*` — Case queue, review, accept/reject
- `/api/tasks/*` — Task lifecycle, progress, completion
- `/api/surveyor/*` — Field assessment, checklists
- `/api/petugas/*` — Technical execution, evidence upload
- `/api/rt-rw/*` — Neighborhood verification
- `/api/warga/*` — Citizen timeline, sanggahan

### Administration

- `/api/admin/users` — User management
- `/api/admin/categories` — Damage categories
- `/api/admin/wilayah` — Regional hierarchy
- `/api/admin/priority-config` — Priority scoring weights
- `/api/admin-daerah/*` — Unit management and SLA
- `/api/executive/stats` — KPI aggregations
- `/api/auditor/*` — Audit trail, export, verification
- `/api/export/*` — GeoJSON, CSV, PDF export

---

## 📄 License

Licensed under **Server Side Public License Version 1.0 (SSPL-1.0)**. See [`LICENSE`](./LICENSE).
