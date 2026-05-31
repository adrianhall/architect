# CF-Architect v2 — MVP Plan

## 1. Overview

CF-Architect v2 is a visual architecture design tool built for Cloudflare. Users design
architectures on a graph canvas, drawing from a catalog of Cloudflare services, and manage
diagrams across a personal dashboard — all within a secure, multi-user environment deployed
entirely on the Cloudflare developer platform.

**MVP goal:** Deliver a functional prototype as rapidly as possible that meets all F1–F5
requirements (minus the explicitly deferred stories listed below), built on patterns that
support long-lived production operation.

---

## 2. MVP Scope

### 2.1 In-Scope Features

| Feature | Description |
|---------|-------------|
| F1 — Platform Foundations | Repeatable provisioning, structured logging, deploy pipeline |
| F2 — Identity, Access & Multi-User | Cloudflare Access auth, user management, admin role, audit log |
| F3 — Cloudflare Service Catalog | Service registry with icons, categories, doc links |
| F4 — Architecture Canvas | Full graph editor with undo/redo, auto-layout, auto-save |
| F5 — Diagram Lifecycle Management | Dashboard, create, duplicate, rename, delete |

### 2.2 Deferred User Stories (within MVP features)

These stories belong to in-scope features but are explicitly deferred:

| Story | Description |
|-------|-------------|
| F1-US3 | Rate limits on share creation, autosave, admin endpoints |
| F2-US8 | CSRF token / Origin check on mutating endpoints |
| F4-US2 | Palette search by service name |
| F4-US11 | Node and edge counts in status bar |
| F4-US13 | Dark/light theme toggle (system `prefers-color-scheme` respected, but no manual override) |
| F4-US14 | Keyboard-only accessibility (focus indicators and accessible names are implemented, but full keyboard-only operation is deferred) |
| F5-US6 | Diagram search by title |
| F5-US7 | Dashboard pagination |

### 2.3 Post-MVP Features (entire features deferred)

| Feature | Description |
|---------|-------------|
| F6 | Blueprints & Templates |
| F7 | Sharing & Read-Only View |
| F8 | Diagram Export & Print |
| F9 | Project Scaffold Export |
| F10 | MCP Server |
| F11 | In-App AI Architect Chat |

---

## 3. Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Runtime** | Cloudflare Workers | Required; the entire platform is deployed on Cloudflare |
| **API framework** | Hono v4 | Required by `@adrianhall/cloudflare-auth`; lightweight, Workers-native, excellent TypeScript support |
| **Database** | Cloudflare D1 + Drizzle ORM | First-class Cloudflare storage; Drizzle provides type-safe queries, migration tooling, and D1-native client |
| **Auth** | `@adrianhall/cloudflare-auth` | Handles Cloudflare Access JWT validation in production and dev-friendly PIN auth locally; two middleware, one interface |
| **Infrastructure** | Terraform (cloudflare v5) + Wrangler + `@adrianhall/cloudflare-scripts` | Per F1 notes; terraform owns resources, wrangler deploys code, `generate-wrangler` bridges the two |
| **Type generation** | `generate-types` from `@adrianhall/cloudflare-scripts` | Keeps `worker-configuration.d.ts` in sync with `wrangler.jsonc`; runs as a pre-step before build/deploy/start |
| **Frontend framework** | React 18 + Vite + TypeScript | React Flow requires React; Vite for fast incremental builds |
| **Canvas library** | React Flow v12 | Industry-standard graph editor for React; handles nodes, edges, connections, viewport, and minimap |
| **Auto-layout engine** | elkjs in a Web Worker | Per F4-US9; off-main-thread computation keeps the canvas interactive during layout |
| **Frontend state** | Zustand | Lightweight, devtools-friendly; well-suited for canvas state (nodes, edges, operation-based undo/redo stack) |
| **Server state / caching** | TanStack Query (React Query v5) | Caching, background refetch, loading/error state for API calls |
| **Styling** | Tailwind CSS v4 | Utility-first; fast to build consistent UIs; design token support |
| **Component primitives** | shadcn/ui | Pre-built, accessible Radix + Tailwind components; consistent patterns, faster development than bare Radix primitives |
| **Shared types** | `src/shared` workspace package | Types shared between worker and frontend (diagram, catalog, API envelope) live in a dedicated workspace to prevent drift |
| **Code quality** | Biome + TypeScript strict mode | Single tool for lint + format; fast, zero-config for greenfield projects |
| **Task runner** | npm-run-all2 (`run-s`) | Granular script composition without shell scripting |
| **Testing (unit/integration)** | Vitest with projects | Vitest projects pattern: root config defines `projects: ['src/worker', 'src/frontend']`; each workspace has its own vitest config with the appropriate test environment. Tests are written alongside every feature, not in a separate phase. |
| **Testing (E2E)** | Playwright | Cross-browser E2E; integrates with dev auth via `extraHTTPHeaders` |
| **Asset serving** | `run_worker_first: true` + `c.env.ASSETS.fetch()` catch-all | Per `@adrianhall/cloudflare-auth`: all requests (including the initial page load) must flow through the Hono middleware chain so the `CF_Authorization` cookie is set before the frontend makes API calls. Requires `run_worker_first: true`, `binding: "ASSETS"`, and `not_found_handling: "single-page-application"` in wrangler.jsonc. The Worker serves static assets via a `c.env.ASSETS.fetch(c.req.raw)` catch-all route. Do not use `serveStatic` from `hono/cloudflare-workers` (it targets the legacy Workers Sites KV namespace). |

---

## 4. Technology Stack

```text
Runtime:         Cloudflare Workers
API:             Hono v4
Database:        Cloudflare D1
ORM:             Drizzle ORM + drizzle-kit
Auth:            @adrianhall/cloudflare-auth
Infra:           Terraform (cloudflare v5), Wrangler v4, @adrianhall/cloudflare-scripts
Frontend:        React 18, Vite, TypeScript
Canvas:          React Flow v12
Auto-layout:     elkjs (Web Worker)
State:           Zustand (canvas/UI), TanStack Query (server state)
Styling:         Tailwind CSS v4, shadcn/ui (Radix + Tailwind primitives)
Shared Types:    src/shared workspace package
Linting:         Biome
Testing:         Vitest (projects), @cloudflare/vitest-pool-workers, Playwright
Scripts:         npm workspaces, npm-run-all2
```

---

## 5. Project Structure

```text
architect/
├── .env                            # Credentials (gitignored)
├── .env.example                    # Template with all required vars
├── .gitignore
├── biome.json                      # Shared lint/format config
├── package.json                    # Root: workspaces, check/fix/provision/deploy/start/test
├── tsconfig.json                   # Project references base config
├── vitest.config.ts                # Root: projects = ['src/worker', 'src/frontend']
│
├── infra/
│   ├── terraform.tf                # Required providers (cloudflare v5, dotenv)
│   ├── main.tf                     # Provider config, resources
│   └── outputs.tf                  # String outputs for generate-wrangler
│
├── catalog/
│   ├── services.json               # All Cloudflare service definitions
│   └── icons/                      # SVG icons (copied from cloudflare-docs)
│
├── src/
│   ├── shared/                     # Shared types package (@architect/shared)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Re-exports all shared types
│   │       ├── diagram.ts          # GraphData, DiagramNode, DiagramEdge
│   │       ├── catalog.ts          # Service, Category, EdgeType types
│   │       ├── api.ts              # API envelope types, error codes
│   │       └── user.ts             # User role, profile types
│   │
│   ├── worker/                     # Cloudflare Worker (Hono API + asset serving)
│   │   ├── wrangler.jsonc.tpl      # Template; generate-wrangler produces wrangler.jsonc
│   │   ├── wrangler.jsonc          # Generated — gitignored
│   │   ├── worker-configuration.d.ts # Generated by generate-types — gitignored
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts        # Workers pool config (@cloudflare/vitest-pool-workers)
│   │   ├── drizzle.config.ts
│   │   └── src/
│   │       ├── index.ts            # Hono app entry point
│   │       ├── routes/
│   │       │   ├── version.ts      # GET /api/version (public)
│   │       │   ├── me.ts           # GET /api/me
│   │       │   ├── diagrams.ts     # CRUD: /api/diagrams
│   │       │   ├── catalog.ts      # GET /api/catalog
│   │       │   └── admin/
│   │       │       └── users.ts    # /api/admin/users (thin Hono shim)
│   │       ├── repositories/       # DB + business logic (one module per domain)
│   │       │   ├── index.ts        # Barrel re-export of all repository symbols
│   │       │   ├── types.ts        # Shared RepositoryError class + Db type alias
│   │       │   └── users.repository.ts  # Admin-users DB + business logic
│   │       ├── db/
│   │       │   ├── schema.ts       # Drizzle schema definitions
│   │       │   ├── index.ts        # Typed DB helpers
│   │       │   └── migrations/     # SQL migration files
│   │       ├── middleware/
│   │       │   ├── auth.ts         # Auth policy + user provisioning
│   │       │   ├── logger.ts       # Structured JSON logging
│   │       │   └── admin.ts        # Admin role guard
│   │       ├── lib/
│   │       │   ├── response.ts     # API response envelope helpers
│   │       │   └── errors.ts       # Error taxonomy
│   │       └── test/
│   │           └── helpers.ts      # signDevJwt wrapper, test data factories
│   │
│   └── frontend/                   # React SPA (served by the Worker)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts          # Outputs to ../worker/public/
│       ├── vitest.config.ts        # jsdom environment for component tests
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/                # Typed API client + TanStack Query hooks
│           ├── components/
│           │   ├── ui/             # shadcn/ui components
│           │   ├── canvas/         # React Flow custom nodes/edges
│           │   ├── palette/        # Service palette sidebar
│           │   └── panels/         # Properties panels
│           ├── pages/
│           │   ├── Dashboard.tsx
│           │   ├── Editor.tsx
│           │   └── Admin.tsx
│           ├── hooks/
│           ├── sync/               # DiagramSync interface + REST implementation
│           └── stores/
│               ├── diagram.ts      # Zustand: nodes, edges, undo/redo (operation-based)
│               └── ui.ts           # Zustand: palette state, panel visibility
│
└── docs/
    ├── REQUIREMENTS.md
    ├── MVP_PLAN.md                 # This document
    └── ISSUE-XX.md                 # Individual issue files
```

---

## 6. Deployment Workflow

```text
Initial setup
─────────────
1. cp .env.example .env && <fill in values>
2. npm run provision          # terraform init + apply → generate-wrangler (writes wrangler.jsonc)
3. npm run deploy             # generates types, builds frontend, runs drizzle migrate, wrangler deploy

Subsequent deploys
──────────────────
npm run deploy                # idempotent; migrations run before code deploy

Teardown
────────
npm run teardown              # terraform destroy → removes generated files
```

### npm scripts (root package.json)

| Script | Command | Description |
|--------|---------|-------------|
| `preprovision` | `terraform -chdir=infra init` | Download providers; idempotent |
| `provision` | `terraform -chdir=infra apply -auto-approve` | Create/update all Cloudflare resources |
| `postprovision` | `generate-wrangler -cf -d src/worker -t infra` | Write wrangler.jsonc from terraform outputs |
| `generate:types` | `generate-types -d src/worker -- --include-runtime=false --strict-vars=false` | Regenerate `worker-configuration.d.ts` when `wrangler.jsonc` changes |
| `build` | `run-s generate:types build:frontend` | Build all artifacts |
| `build:frontend` | `npm run build --workspace=src/frontend` | One-shot frontend build |
| `predeploy` | `run-s generate:types build:frontend db:migrate:remote` | Generate types, build SPA, apply pending D1 migrations |
| `db:migrate:remote` | `npm run db:migrate:remote --workspace=src/worker` | Apply pending migrations to remote D1 (used by `predeploy`) |
| `db:migrate:local` | `npm run db:migrate:local --workspace=src/worker` | Apply pending migrations to local D1 (dev + test setup) |
| `deploy` | `wrangler deploy --config src/worker/wrangler.jsonc` | Deploy worker code |
| `teardown` | `terraform -chdir=infra destroy -auto-approve` | Destroy all resources |
| `postteardown` | `shx rm -f src/worker/wrangler.jsonc src/worker/worker-configuration.d.ts` | Clean up generated files |
| `start` | `run-s start:worker` | Run wrangler dev server (frontend pre-built by `prestart`) |
| `prestart` | `run-s generate:types build:frontend` | Generate types and build frontend before dev server starts |
| `start:frontend` | `npm run dev --workspace=src/frontend` | Vite watch build |
| `start:worker` | `wrangler dev --config src/worker/wrangler.jsonc` | Worker dev server |
| `test` | `vitest run` | Run all tests across all projects |
| `test:watch` | `vitest` | Watch mode for all projects |
| `test:coverage` | `vitest run --coverage` | Run tests with coverage reporting |
| `test:worker` | `vitest run --project worker` | Worker tests only |
| `test:frontend` | `vitest run --project frontend` | Frontend tests only |
| `check` | `run-s check:*` | Run all checks sequentially (fail-fast) |
| `check:types` | `tsc -b --noEmit` | TypeScript project references check |
| `check:biome` | `biome check .` | Lint + format check |
| `check:infra` | `terraform -chdir=infra validate` | Validate Terraform (requires `preprovision` first) |
| `fix` | `run-s fix:*` | Run all auto-fixers sequentially |
| `fix:biome` | `biome check --write .` | Apply safe lint fixes + format |
| `fix:infra` | `terraform -chdir=infra fmt` | Format Terraform files |

> **Note:** `check:infra` requires terraform providers to be initialized. Run `npm run preprovision`
> (or `terraform -chdir=infra init -backend=false`) once before using `npm run check`.

---

## 7. Development Workflow

```bash
# First time
cp .env.example .env
# Fill in .env (only CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_TEAM_DOMAIN,
#                    SEED_ADMIN_EMAIL required for local dev)
npm install
npm start    # generates types, builds frontend once, then runs wrangler dev
# For live frontend rebuilds, run `npm run start:frontend` in a second terminal
```

For local development, `@adrianhall/cloudflare-auth` provides a PIN-based login form at
`/_auth/login` so there is no dependency on a live Cloudflare Access deployment. The worker
reads D1 from a local SQLite replica managed by wrangler.

**Important:** All requests (including static asset requests) must flow through the Hono
middleware chain to ensure the `CF_Authorization` cookie is set. This requires three settings
in `wrangler.jsonc`:

- `"run_worker_first": true` — routes every request through the Worker
- `"binding": "ASSETS"` — gives the Worker access to static assets via `c.env.ASSETS.fetch()`
- `"not_found_handling": "single-page-application"` — returns `index.html` for client-side routes

The Worker serves static assets via a `c.env.ASSETS.fetch(c.req.raw)` catch-all route. Do not
use `serveStatic` from `hono/cloudflare-workers` (it targets the legacy Workers Sites KV
namespace and is incompatible with the `assets.binding` system). The frontend must be built
before `wrangler dev` starts (handled by `prestart`).

---

## 8. Database Schema

All tables use `TEXT` primary keys (ULID format for lexicographic ordering).

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | ULID |
| `email` | TEXT UNIQUE NOT NULL | From Access JWT `email` claim |
| `name` | TEXT | Display name |
| `avatar_url` | TEXT | From IdP |
| `role` | TEXT NOT NULL | `'user'` or `'admin'` |
| `created_at` | INTEGER NOT NULL | Unix timestamp (ms) |
| `updated_at` | INTEGER NOT NULL | Unix timestamp (ms) |

### `diagrams`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | ULID |
| `user_id` | TEXT FK → users.id | Owner |
| `title` | TEXT NOT NULL | 1–80 chars |
| `graph_data` | TEXT NOT NULL | JSON: `{ nodes, edges, viewport }` |
| `version` | INTEGER NOT NULL DEFAULT 1 | Optimistic concurrency control |
| `created_at` | INTEGER NOT NULL | Unix timestamp (ms) |
| `updated_at` | INTEGER NOT NULL | Unix timestamp (ms) |

### Graph Data Schema (stored in `diagrams.graph_data`)

```typescript
interface GraphData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

interface DiagramNode {
  id: string;
  type: string;                   // catalog service typeId (e.g. "workers", "d1", "r2")
  position: { x: number; y: number };
  data: {
    label: string;                // 1–80 chars
    description?: string;         // ≤500 chars
    accentColor?: string;         // hex override; null = category default
  };
}

interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type: "data-flow" | "binding" | "trigger" | "dependency";
  data?: {
    label?: string;               // ≤80 chars
    protocol?: string;
    description?: string;
  };
}
```

> **Note:** These types are defined in `src/shared/src/diagram.ts` and imported by both the
> worker and frontend packages. The `src/shared` workspace is the single source of truth for
> all types shared across packages.

---

## 9. API Design

All responses follow a consistent envelope:

```typescript
// Success
{ "data": T }

// Error
{ "error": { "code": string, "message": string, "details"?: unknown } }
```

HTTP status codes are meaningful: `200` OK, `201` Created, `400` Bad Request,
`401` Unauthorized, `403` Forbidden, `404` Not Found, `409` Conflict (concurrency),
`500` Internal Server Error.

### Endpoints (MVP)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/version` | Public | App version |
| GET | `/api/me` | Required | Current user profile |
| GET | `/api/catalog` | Required | Full service catalog |
| GET | `/api/diagrams` | Required | List user's diagrams |
| POST | `/api/diagrams` | Required | Create blank diagram |
| GET | `/api/diagrams/:id` | Required | Get single diagram |
| PUT | `/api/diagrams/:id` | Required | Full update (with version check) |
| PATCH | `/api/diagrams/:id` | Required | Partial update (title rename) |
| DELETE | `/api/diagrams/:id` | Required | Delete diagram |
| POST | `/api/diagrams/:id/duplicate` | Required | Clone diagram |
| GET | `/api/admin/users` | Admin | Paginated user list |
| PATCH | `/api/admin/users/:id/role` | Admin | Promote / demote |
| DELETE | `/api/admin/users/:id` | Admin | Delete user |

---

## 10. Issue Plan

Each issue includes unit tests for the functionality it introduces. There is no standalone
"write all the tests" phase — test coverage grows with every issue.

### Phase 1: Foundation

| Issue | Title | Deps |
|-------|-------|------|
| ISSUE-01 | Project scaffolding: workspaces, Biome, TS, Vitest projects, shared types | — |
| ISSUE-02 | Terraform infrastructure + deployment pipeline | 01 |
| ISSUE-03 | D1 schema + Drizzle ORM + migrations + shared diagram types | 02 |
| ISSUE-04 | Auth middleware + structured logging + test helpers | 02 |
| ISSUE-05 | User provisioning + admin seeding + `/api/me` + tests | 03, 04 |

### Phase 2: Backend API

| Issue | Title | Deps |
|-------|-------|------|
| ISSUE-06 | Diagram API: CRUD, duplicate, rename, optimistic concurrency + tests | 05 |
| ISSUE-07 | Admin API + structured audit logging + tests | 05 |
| ISSUE-08 | Service catalog: data, shared types, API, icon serving + tests | 01, 04 |

### Phase 3: Frontend Foundation

| Issue | Title | Deps |
|-------|-------|------|
| ISSUE-09 | Frontend scaffolding: Vite, React, Tailwind, shadcn | 01 |
| ISSUE-10 | Routing, app shell layout, auth context + tests | 05, 09 |
| ISSUE-11 | Typed API client + TanStack Query hooks + tests | 10 |
| ISSUE-12 | Dashboard page: card grid, CRUD actions, empty state + tests | 06, 11 |

### Phase 4: Canvas Editor

| Issue | Title | Deps |
|-------|-------|------|
| ISSUE-13 | React Flow setup + custom node types + keyboard shortcuts + tests | 08, 10 |
| ISSUE-14 | Custom edge types + connection handling + tests | 13 |
| ISSUE-15 | Service palette: categories, collapse, drag-drop + tests | 13 |
| ISSUE-16 | Properties panel: node and edge editing + tests | 14 |
| ISSUE-17A | Operation types, apply/reverse pure functions + tests | 14 |
| ISSUE-17B | Store undo/redo integration + keyboard shortcuts + tests | 17A |
| ISSUE-18 | Auto-save via DiagramSync abstraction + save status + tests | 06, 13 |
| ISSUE-19 | ELK auto-layout in Web Worker + tests | 14 |

### Phase 5: Admin UI + E2E

| Issue | Title | Deps |
|-------|-------|------|
| ISSUE-20 | Admin UI: user management + audit log display + tests | 07, 11 |
| ISSUE-21 | E2E tests: Sasha flows (auth, dashboard, canvas editing) | 12, 18 |
| ISSUE-22 | E2E tests: Tomas flows (admin user management) | 20, 21 |

### Parallel Work Opportunities

Once Phase 1 (ISSUE-01–05) is complete, multiple tracks can proceed in parallel:

- **Backend track:** ISSUE-06 → 07 (diagram and admin APIs)
- **Catalog track:** ISSUE-08 (can start after ISSUE-01 + 04)
- **Frontend track:** ISSUE-09 → 10 → 11 → 12 (can start ISSUE-09 after ISSUE-01)
- **Canvas track:** ISSUE-13 → 14, 15, 16, 17, 18, 19 (after 08 + 10)

---

## 11. Key Design Constraints

- **`run_worker_first: true` required** — Per `@adrianhall/cloudflare-auth`, all requests (including the initial page load) must flow through the Worker's Hono middleware chain so the `CF_Authorization` cookie is set before the frontend makes API calls. The `assets` config in `wrangler.jsonc` requires `run_worker_first: true`, `binding: "ASSETS"`, and `not_found_handling: "single-page-application"`. The Worker serves static assets via a `c.env.ASSETS.fetch(c.req.raw)` catch-all route. Do not use `serveStatic` from `hono/cloudflare-workers`.
- **`wrangler.jsonc` is generated, never committed** — it is always consistent with Terraform state.
- **`worker-configuration.d.ts` is generated, never committed** — produced by `generate-types` from `wrangler.jsonc`; regenerated automatically by `prebuild`, `predeploy`, and `prestart`.
- **`check:infra` requires terraform init** — run `npm run preprovision` once per checkout before using `npm run check`.
- **Migrations run as part of `deploy`** — `wrangler deploy` is preceded by `drizzle-kit migrate` to ensure schema is always up to date.
- **Sensitive values** — `CLOUDFLARE_TEAM_DOMAIN` and `SEED_ADMIN_EMAIL` flow from `.env` through Terraform outputs into `wrangler.jsonc` as vars for the MVP. Post-MVP, `SEED_ADMIN_EMAIL` should be migrated to a wrangler secret.
- **Icons are committed** — SVG icons are copied from `../cloudflare-docs/src/icons` into `catalog/icons/` and committed to this repo. This avoids a runtime dependency on the cloudflare-docs repo.
- **Audit logging is console-only** — Per F2 notes, audit log entries are emitted as structured JSON to `console.log`, which flows into Cloudflare Logs. There is no `audit_logs` DB table and no queryable audit API endpoint in the MVP.
- **Dashboard thumbnails** — For the MVP, diagram cards display a styled placeholder (title + metadata). A rendered thumbnail requires export functionality (F8, post-MVP).
- **Concurrency** — The `diagrams.version` column provides optimistic concurrency. A `PUT` that sends a stale version receives a `409`; the frontend shows a "another session saved changes — reload?" modal.
- **Tests accompany every feature** — Each issue that introduces API routes or UI components includes unit tests for that functionality. There is no standalone "write all the tests" phase. Vitest projects pattern (`projects: ['src/worker', 'src/frontend']`) gives each workspace its own test environment.
- **Undo/redo is operation-based** — Each user action (add node, move, connect, delete, edit property) is a discrete, reversible operation pushed onto a stack. No full-document snapshots per undo step. This keeps memory efficient for 50+ steps and maps directly to the operation stream a Durable Object would broadcast for future real-time collaboration.
- **Auto-save/sync layer is abstracted** — The Zustand diagram store dispatches saves through a `DiagramSync` interface, not directly via fetch. The MVP implementation is REST-based (debounced PUT of the full graph). A future collaboration feature can swap in a WebSocket-to-Durable-Object implementation without touching canvas components.
