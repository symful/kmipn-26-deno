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
│   │   │   ├── Dashboard.tsx, Queue.tsx, CaseList.tsx, CaseDetail.tsx
│   │   │   ├── Audit.tsx, Analytics.tsx, AdminDaerah.tsx
│   │   │   ├── SubmitReport.tsx, CreateReport.tsx
│   │   │   └── ...         # Other page components
│   │   ├── theme/          # Design tokens (Colors, Typography, Radii)
│   │   └── api/            # API client with token interceptors
├── schema.sql              # Complete canonical D1/SQLite schema
├── scripts/                # Database seeders and maintenance utilities
├── wrangler.toml           # Cloudflare deployment & binding configuration
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
# Clone and install dependencies
cd kmipn-26-deno
npm install

# Install web SPA dependencies
cd web
npm install
cd ..
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and fill in the required environment parameters:

```bash
cp .env.example .env
```

Key environment variables:

```ini
APP_BASE_URL="https://sigap.live"
R2_PUBLIC_URL="https://r2.sigap.live"
ALLOWED_ORIGINS="http://localhost:5173,https://sigap.live"
```

Cloudflare Worker Secrets (configured via `wrangler secret put <KEY>`):

- `JWT_SECRET`: 256-bit cryptographically secure string (`openssl rand -base64 32`)
- `LLM_API_KEY`: LLM vision provider API key
- `LLM_API_URI`: LLM vision endpoint (e.g. Minimax or Gemini endpoint)

---

## 💾 Database setup

`schema.sql` is the complete canonical D1/SQLite schema. Edit it directly when the data model changes; there is no ordered migration chain. `scripts/seed.sql` supplies the five reference categories, three demo accounts, an active unit, SLA defaults, and the priority formula.

Use Node.js 22.13 or newer for the isolated SQLite validation:

```bash
npm run db:check
```

This validates a fresh in-memory database, checks the seeded login passwords, and rebuilds it a second time. It never touches the running local database or Cloudflare.

To create or rebuild the local demo database, stop the development servers first, then run:

```bash
npm run db:reset:local
npm run dev
```

The reset replaces every application table in **local D1** with the canonical schema and seed. Existing local reports, tasks, sessions, and settings are deleted. It preserves local R2 files and does not contact the deployed database. The reset helper only accepts `--local`; it has no remote mode.

To add missing demo seed rows to an existing compatible local schema without resetting it:

```bash
npm run db:seed:local
```

Deployment remains separate from database replacement. The ordinary test command does not change any database.

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

The platform is deployed live on Cloudflare Workers:

- **Live Worker URL**: [https://sigap.live](https://sigap.live)
- **Web SPA Entry**: Served at `/` and all web client routes
- **REST API Entry**: Served under `/api/*`

To deploy the latest changes:

```bash
npm run deploy
```

---

## 👥 Manual QA Test Accounts

For testing, auditing, and grading, 3 role accounts are pre-seeded in the remote database with standard credentials:

| Role        | Email                | Password     | Primary Scope / Access                                                        |
| ----------- | -------------------- | ------------ | ----------------------------------------------------------------------------- |
| **ADMIN**   | `admin@sigap.live`   | `admin123`   | Full system access: user management, categories, wilayah, SLA, audit, exports |
| **PETUGAS** | `petugas@sigap.live` | `petugas123` | Field tasks, progress notes, upload completion photos, survey checklists      |
| **WARGA**   | `warga@sigap.live`   | `warga123`   | Create public reports, upload evidence, track status, file sanggahan          |

---

## 📡 API Endpoints Catalog

### Authentication (`/api/auth`)

- `POST /api/auth/login` — Authenticate user and issue JWT access & refresh tokens
- `POST /api/auth/register` — Citizen registration
- `POST /api/auth/refresh` — Rotate and issue fresh access tokens
- `GET /api/auth/me` — Return current authenticated session and role details

### Reports & Geospatial (`/api/reports`)

- `GET /api/reports` — List and filter reports (supports pagination, category, status, search)
- `POST /api/reports` — Submit new infrastructure report
- `GET /api/reports/:id` — Get detailed report information with timeline & photos
- `POST /api/reports/photos/upload-url` — Obtain secure R2 photo upload URL
- `GET /api/reports/heatmap` — Geospatial coordinates for density heatmaps
- `GET /api/reports/duplicates` — Potential duplicate detection via spatial proximity

### Workflow Roles

- `/api/cases/*` — Case queue, review, accept/reject, sanggahan handling
- `/api/tasks/*` — Task lifecycle, acceptance, progress, completion evidence
- `/api/surveyor/*` — Field assessment tasks, structured checklist completion
- `/api/petugas/*` — Technical execution, progress updates, completion evidence upload
- `/api/rt-rw/*` — Neighborhood-level verification and feedback
- `/api/warga/*` — Citizen complaint timeline, photo attachments, and sanggahan filing

### Administration & Insights

- `/api/admin/users` — User account management and role assignments
- `/api/admin/categories` — Nested damage categories and icons
- `/api/admin/wilayah` — Administrative village, subdistrict, and regional hierarchy
- `/api/admin/priority-config` — Priority scoring formula and weight weights
- `/api/admin-daerah/*` — Regional unit management and SLA targets
- `/api/executive/stats` — High-level KPI aggregations and trend charts
- `/api/auditor/audit-search` — Paginated audit trail search with filters
- `/api/auditor/audit-export` — Export audit log as CSV or JSON
- `/api/auditor/stats` — Audit statistics (counts, top actors, suspicious activity)
- `/api/auditor/verify-chain` — Verify audit chain integrity
- `/api/auditor/system-logs` — System logs with level filter
- `/api/export/*` — Export report data to GeoJSON, CSV, and PDF

---

## 📄 License & Attribution Notice

This project is licensed under the **Server Side Public License Version 1.0 (SSPL-1.0)**. See the full license in [`LICENSE`](./LICENSE).

### ⚖️ Historical Versions & Open Source Licensing Notice

Previous releases and earlier repository snapshots that did not contain an explicit `LICENSE` file are legally classified as **unlicensed** under default copyright law (governed by the Berne Convention and GitHub Terms of Service § D.4 — _"All Rights Reserved"_).

**Important clarification on unlicensed open-source code:**
In software licensing, "unlicensed" or lacking an explicit license file **does not mean** the code is in the public domain, nor does it mean there are "no rules" or that anyone may freely copy, modify, distribute, or sub-license the software. Under international intellectual property law:

- The authors retain exclusive copyright ownership of all code and creative assets.
- Without an explicit open-source license grant, third parties only possess the default, non-transferable right to view the repository hosted on GitHub.
- No implied rights of commercial distribution, modification, or derivation existed for those earlier unlicensed commits.

With the formal inclusion of the [`LICENSE`](./LICENSE) file in this release, all rights, permissions, modification allowances, and mandatory public attribution requirements are governed explicitly under **SSPL-1.0**.
