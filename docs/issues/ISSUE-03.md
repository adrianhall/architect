# D1 schema + Drizzle ORM + migrations + shared types

## Summary

Create the complete database layer: Drizzle ORM schema definitions for `users` and `diagrams` tables, a typed DB helper, initial migration generation, and the shared TypeScript types that both the worker and frontend consume. After this issue, `npm run db:migrate:local` applies the schema to local D1, the shared types package exports `GraphData`, `DiagramNode`, `DiagramEdge`, `User`, `UserRole`, `ApiResponse`, and `ApiError`, and all quality gates pass.

## Relevant Skills

- `cloudflare`
- `wrangler`
- `typescript-advanced-types`
- `workers-best-practices`

## Requirements Coverage

- [F1-US5](../REQUIREMENTS.md) — Idempotent deploy with pending schema migrations: this issue creates the migration infrastructure and initial migration that `npm run deploy` applies before shipping code.
- [F5](../REQUIREMENTS.md) — Diagram lifecycle schema foundation: the `diagrams` table with `graph_data`, `version`, and `user_id` FK provides the data model for all CRUD and concurrency features.

## Dependencies

- **ISSUE-02** — Terraform infrastructure must exist so `wrangler.jsonc` is available (needed for `drizzle-kit` to connect to local D1 and for `generate-types` to produce the `Env` type that includes the `DB` binding).

## Acceptance Criteria

- [ ] `drizzle-orm` and `drizzle-kit` are installed in `src/worker`.
- [ ] `src/worker/drizzle.config.ts` is configured for local D1 via wrangler.
- [ ] `src/worker/src/db/schema.ts` defines `users` and `diagrams` tables per Section 8 of MVP_PLAN.md.
- [ ] `src/worker/src/db/index.ts` exports a typed `getDb()` helper that wraps `drizzle(env.DB)`.
- [ ] A generated migration exists in `src/worker/src/db/migrations/` that creates both tables.
- [ ] `npm run db:migrate:local` applies the migration to local D1 without errors.
- [ ] `src/shared/src/diagram.ts` exports `GraphData`, `DiagramNode`, `DiagramEdge`, and `Viewport` interfaces.
- [ ] `src/shared/src/user.ts` exports `UserRole` type and `User` interface.
- [ ] `src/shared/src/api.ts` exports `ApiResponse`, `ApiError`, and `ApiErrorCode` types.
- [ ] `src/shared/src/index.ts` re-exports all types from all modules.
- [ ] `npm run check` passes (types, biome, markdown).
- [ ] `npm run build` builds all artifacts.
- [ ] `npm test` passes with > 90% coverage on new and changed files.
- [ ] `npm start` builds and starts the service without errors (after provisioning).

## Technical Approach

### Step 1 — Install Drizzle in the worker workspace

```bash
npm install drizzle-orm --workspace=src/worker
npm install --save-dev drizzle-kit --workspace=src/worker
```

### Step 2 — Create `src/worker/drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
 out: "src/db/migrations",
 schema: "src/db/schema.ts",
 dialect: "sqlite",
});
```

> **Note:** Drizzle Kit uses the `sqlite` dialect for D1. The `out` directory for migrations is `src/db/migrations` relative to the worker workspace root.

### Step 3 — Create `src/worker/src/db/schema.ts`

Define the Drizzle schema matching Section 8 of MVP_PLAN.md exactly:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Users table — accounts provisioned on first Cloudflare Access login.
 * Primary key is a ULID (text, lexicographically sortable).
 */
export const users = sqliteTable("users", {
 id: text("id").primaryKey(),
 email: text("email").notNull().unique(),
 name: text("name"),
 avatarUrl: text("avatar_url"),
 role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
 createdAt: integer("created_at", { mode: "number" }).notNull(),
 updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

/**
 * Diagrams table — architecture diagrams owned by users.
 * graph_data stores the full JSON representation (nodes, edges, viewport).
 * version column enables optimistic concurrency control.
 */
export const diagrams = sqliteTable("diagrams", {
 id: text("id").primaryKey(),
 userId: text("user_id")
  .notNull()
  .references(() => users.id),
 title: text("title").notNull(),
 graphData: text("graph_data").notNull(),
 version: integer("version").notNull().default(1),
 createdAt: integer("created_at", { mode: "number" }).notNull(),
 updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});
```

> **Key design decisions:**
>
> - `id` is `text` (ULID) not autoincrement — matches MVP_PLAN.md.
> - `created_at` and `updated_at` use `integer` with `mode: "number"` for Unix timestamps in milliseconds.
> - `role` uses Drizzle's `enum` constraint for type safety — only `"user"` or `"admin"` allowed.
> - `graph_data` is `text` storing JSON — parsed/validated at the application layer.
> - `user_id` has a foreign key reference to `users.id`.
> - `version` defaults to `1` for optimistic concurrency control.

### Step 4 — Create `src/worker/src/db/index.ts`

```ts
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema.js";

export type Database = DrizzleD1Database<typeof schema>;

/**
 * Create a typed Drizzle DB instance from the D1 binding.
 * Call this per-request — Drizzle is lightweight and does not pool connections.
 */
export function getDb(d1: D1Database): Database {
 return drizzle(d1, { schema });
}

export { schema };
```

> **Note:** The `D1Database` type comes from `@cloudflare/workers-types` (installed in ISSUE-01) or from the generated `worker-configuration.d.ts`. The `getDb` function accepts the raw D1 binding and returns a fully typed Drizzle instance with the schema attached for relational queries.

### Step 5 — Generate the initial migration

Run from the `src/worker` directory:

```bash
cd src/worker && npx drizzle-kit generate
```

This produces a SQL migration file in `src/worker/src/db/migrations/`. The generated file should contain `CREATE TABLE` statements for both `users` and `diagrams`. Verify the SQL looks correct.

The migration files **must be committed** to version control — they are the source of truth for the database schema.

### Step 6 — Update worker workspace migration scripts

Update `src/worker/package.json` scripts to replace the placeholders from ISSUE-02:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply cf-architect-db --local --config wrangler.jsonc",
    "db:migrate:remote": "wrangler d1 migrations apply cf-architect-db --remote --config wrangler.jsonc",
    "test": "vitest run"
  }
}
```

> **Important:** The `wrangler d1 migrations apply` command needs the D1 database name (not the binding name). The name is `${worker_name}-db` as defined in Terraform — the default is `cf-architect-db`. This must match what's in `wrangler.jsonc`.
>
> **Important:** `wrangler d1 migrations apply` expects migration files in a `migrations/` directory relative to `wrangler.jsonc` by default. Since our migrations are in `src/db/migrations/`, we need to configure this. Add a `migrations_dir` field to the D1 database binding in `wrangler.jsonc.tpl`:
>
> ```jsonc
> "d1_databases": [
>   {
>     "binding": "DB",
>     "database_name": "{{d1_database_name}}",
>     "database_id": "{{d1_database_id}}",
>     "migrations_dir": "src/db/migrations"
>   }
> ]
> ```
>
> Update `src/worker/wrangler.jsonc.tpl` to include this `migrations_dir` field.

### Step 7 — Populate shared types

#### `src/shared/src/diagram.ts`

Replace the empty stub with full type definitions matching Section 8 of MVP_PLAN.md:

```ts
/**
 * Viewport state for the canvas.
 */
export interface Viewport {
 x: number;
 y: number;
 zoom: number;
}

/**
 * A node on the architecture diagram canvas.
 */
export interface DiagramNode {
 /** Unique node ID (ULID) */
 id: string;
 /** Catalog service type ID (e.g. "workers", "d1", "r2") */
 type: string;
 /** Canvas position */
 position: { x: number; y: number };
 /** Node metadata */
 data: {
  /** Display label (1–80 chars) */
  label: string;
  /** Optional description (≤500 chars) */
  description?: string;
  /** Hex colour override; null/undefined = category default */
  accentColor?: string;
 };
}

/**
 * Edge type representing the nature of a connection between nodes.
 */
export type EdgeType = "data-flow" | "binding" | "trigger" | "dependency";

/**
 * A connection between two nodes on the diagram.
 */
export interface DiagramEdge {
 /** Unique edge ID (ULID) */
 id: string;
 /** Source node ID */
 source: string;
 /** Target node ID */
 target: string;
 /** Source handle ID */
 sourceHandle?: string;
 /** Target handle ID */
 targetHandle?: string;
 /** Connection type */
 type: EdgeType;
 /** Edge metadata */
 data?: {
  /** Optional label (≤80 chars) */
  label?: string;
  /** Protocol (e.g. "HTTP", "gRPC") */
  protocol?: string;
  /** Optional description */
  description?: string;
 };
}

/**
 * Complete graph data stored in diagrams.graph_data.
 * This is the serialised form persisted to D1.
 */
export interface GraphData {
 nodes: DiagramNode[];
 edges: DiagramEdge[];
 viewport?: Viewport;
}
```

#### `src/shared/src/user.ts`

Replace the empty stub:

```ts
/**
 * User roles in the system.
 */
export type UserRole = "user" | "admin";

/**
 * User profile as returned by the API.
 */
export interface User {
 id: string;
 email: string;
 name: string | null;
 avatarUrl: string | null;
 role: UserRole;
 createdAt: number;
 updatedAt: number;
}
```

#### `src/shared/src/api.ts`

Replace the empty stub:

```ts
/**
 * Standard API error codes used across all endpoints.
 */
export type ApiErrorCode =
 | "BAD_REQUEST"
 | "UNAUTHORIZED"
 | "FORBIDDEN"
 | "NOT_FOUND"
 | "CONFLICT"
 | "INTERNAL_ERROR";

/**
 * API error envelope.
 */
export interface ApiError {
 code: ApiErrorCode;
 message: string;
 details?: unknown;
}

/**
 * Successful API response envelope.
 */
export interface ApiSuccessResponse<T> {
 data: T;
}

/**
 * Error API response envelope.
 */
export interface ApiErrorResponse {
 error: ApiError;
}

/**
 * Union type for all API responses.
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

#### `src/shared/src/index.ts`

Update the barrel export to re-export everything:

```ts
export * from "./diagram.js";
export * from "./catalog.js";
export * from "./api.js";
export * from "./user.js";
```

(This should already be correct from ISSUE-01, but verify the exports now include real types.)

### Step 8 — Write tests

#### `src/worker/src/db/schema.test.ts`

Test that the Drizzle schema is correctly defined:

```ts
import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { diagrams, users } from "./schema.js";

describe("users schema", () => {
 it("should have table name 'users'", () => {
  expect(getTableName(users)).toBe("users");
 });

 it("should have all required columns", () => {
  const columns = getTableColumns(users);
  expect(columns.id).toBeDefined();
  expect(columns.email).toBeDefined();
  expect(columns.name).toBeDefined();
  expect(columns.avatarUrl).toBeDefined();
  expect(columns.role).toBeDefined();
  expect(columns.createdAt).toBeDefined();
  expect(columns.updatedAt).toBeDefined();
 });

 it("should have id as primary key", () => {
  const columns = getTableColumns(users);
  expect(columns.id.primary).toBe(true);
 });

 it("should have email as unique and not null", () => {
  const columns = getTableColumns(users);
  expect(columns.email.isUnique).toBe(true);
  expect(columns.email.notNull).toBe(true);
 });

 it("should default role to 'user'", () => {
  const columns = getTableColumns(users);
  expect(columns.role.hasDefault).toBe(true);
 });
});

describe("diagrams schema", () => {
 it("should have table name 'diagrams'", () => {
  expect(getTableName(diagrams)).toBe("diagrams");
 });

 it("should have all required columns", () => {
  const columns = getTableColumns(diagrams);
  expect(columns.id).toBeDefined();
  expect(columns.userId).toBeDefined();
  expect(columns.title).toBeDefined();
  expect(columns.graphData).toBeDefined();
  expect(columns.version).toBeDefined();
  expect(columns.createdAt).toBeDefined();
  expect(columns.updatedAt).toBeDefined();
 });

 it("should have version default to 1", () => {
  const columns = getTableColumns(diagrams);
  expect(columns.version.hasDefault).toBe(true);
 });
});
```

#### `src/worker/src/db/index.test.ts`

Test the DB helper:

```ts
import { describe, expect, it } from "vitest";
import { getDb, schema } from "./index.js";

describe("getDb", () => {
 it("should be a function", () => {
  expect(getDb).toBeInstanceOf(Function);
 });

 it("should export schema with users and diagrams", () => {
  expect(schema.users).toBeDefined();
  expect(schema.diagrams).toBeDefined();
 });
});
```

> **Note:** We cannot fully test `getDb()` instantiation without a real D1 binding or mock. The function signature test confirms the module loads correctly. Full integration tests with D1 come in later issues using `@cloudflare/vitest-pool-workers`.

#### `src/shared/src/diagram.test.ts`

Type-level validation test for shared diagram types:

```ts
import { describe, expect, it } from "vitest";
import type { DiagramEdge, DiagramNode, EdgeType, GraphData, Viewport } from "./diagram.js";

describe("shared diagram types", () => {
 it("should allow constructing a valid GraphData object", () => {
  const viewport: Viewport = { x: 0, y: 0, zoom: 1 };

  const node: DiagramNode = {
   id: "node-1",
   type: "workers",
   position: { x: 100, y: 200 },
   data: { label: "My Worker" },
  };

  const edge: DiagramEdge = {
   id: "edge-1",
   source: "node-1",
   target: "node-2",
   type: "data-flow",
  };

  const graph: GraphData = {
   nodes: [node],
   edges: [edge],
   viewport,
  };

  expect(graph.nodes).toHaveLength(1);
  expect(graph.edges).toHaveLength(1);
  expect(graph.viewport).toEqual(viewport);
 });

 it("should support all edge types", () => {
  const types: EdgeType[] = ["data-flow", "binding", "trigger", "dependency"];
  expect(types).toHaveLength(4);
 });

 it("should allow optional edge data fields", () => {
  const edge: DiagramEdge = {
   id: "edge-1",
   source: "node-1",
   target: "node-2",
   type: "binding",
   data: {
    label: "KV binding",
    protocol: "binding",
    description: "Connects to KV namespace",
   },
  };

  expect(edge.data?.label).toBe("KV binding");
 });

 it("should allow optional node data fields", () => {
  const node: DiagramNode = {
   id: "node-1",
   type: "d1",
   position: { x: 0, y: 0 },
   data: {
    label: "Main DB",
    description: "Primary D1 database",
    accentColor: "#FF6633",
   },
  };

  expect(node.data.description).toBe("Primary D1 database");
  expect(node.data.accentColor).toBe("#FF6633");
 });
});
```

#### `src/shared/src/api.test.ts`

Type-level validation test for API types:

```ts
import { describe, expect, it } from "vitest";
import type { ApiErrorCode, ApiErrorResponse, ApiResponse, ApiSuccessResponse } from "./api.js";

describe("shared API types", () => {
 it("should allow constructing a success response", () => {
  const response: ApiSuccessResponse<{ id: string }> = {
   data: { id: "123" },
  };

  expect(response.data.id).toBe("123");
 });

 it("should allow constructing an error response", () => {
  const response: ApiErrorResponse = {
   error: {
    code: "NOT_FOUND",
    message: "Diagram not found",
   },
  };

  expect(response.error.code).toBe("NOT_FOUND");
 });

 it("should support all error codes", () => {
  const codes: ApiErrorCode[] = [
   "BAD_REQUEST",
   "UNAUTHORIZED",
   "FORBIDDEN",
   "NOT_FOUND",
   "CONFLICT",
   "INTERNAL_ERROR",
  ];
  expect(codes).toHaveLength(6);
 });

 it("should allow details on error responses", () => {
  const response: ApiErrorResponse = {
   error: {
    code: "BAD_REQUEST",
    message: "Validation failed",
    details: { field: "title", reason: "too long" },
   },
  };

  expect(response.error.details).toBeDefined();
 });
});
```

#### `src/shared/src/user.test.ts`

Type-level validation test for user types:

```ts
import { describe, expect, it } from "vitest";
import type { User, UserRole } from "./user.js";

describe("shared user types", () => {
 it("should allow constructing a User object", () => {
  const user: User = {
   id: "01HQ...",
   email: "sasha@example.com",
   name: "Sasha",
   avatarUrl: null,
   role: "user",
   createdAt: Date.now(),
   updatedAt: Date.now(),
  };

  expect(user.role).toBe("user");
  expect(user.name).toBe("Sasha");
 });

 it("should support both user roles", () => {
  const roles: UserRole[] = ["user", "admin"];
  expect(roles).toHaveLength(2);
 });

 it("should allow null name and avatarUrl", () => {
  const user: User = {
   id: "01HQ...",
   email: "tomas@example.com",
   name: null,
   avatarUrl: null,
   role: "admin",
   createdAt: Date.now(),
   updatedAt: Date.now(),
  };

  expect(user.name).toBeNull();
  expect(user.avatarUrl).toBeNull();
 });
});
```

### Step 9 — Update Vitest config for shared package tests

The shared package tests need to run somewhere. Since `src/shared` has no vitest config of its own and doesn't belong to either the worker or frontend test environments, add the shared tests to the **worker** project's Vitest config:

Update `src/worker/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
 test: {
  name: "worker",
  include: ["src/**/*.test.ts", path.resolve(__dirname, "../shared/src/**/*.test.ts")],
 },
});
```

Alternatively, add a third Vitest project for shared. The simpler approach is to include shared tests in the worker project since they share the same Node/standard environment. Choose whichever approach keeps `npm test` running all tests.

### Step 10 — Run all quality gates

```bash
npm run fix:biome
npm run check
npm test
npm run test:coverage
```

Fix any issues. All checks and tests must pass before the issue is complete.

## Testing

### Unit Tests

| File | What it tests |
|------|---------------|
| `src/worker/src/db/schema.test.ts` | Drizzle schema table names, columns, primary keys, unique constraints, defaults |
| `src/worker/src/db/index.test.ts` | `getDb` export exists; schema re-exports users and diagrams |
| `src/shared/src/diagram.test.ts` | `GraphData`, `DiagramNode`, `DiagramEdge`, `Viewport` type construction and all `EdgeType` values |
| `src/shared/src/api.test.ts` | `ApiSuccessResponse`, `ApiErrorResponse`, all `ApiErrorCode` values, optional `details` field |
| `src/shared/src/user.test.ts` | `User` construction, both `UserRole` values, nullable fields |

### Manual Tests

| Step | Command | Expected Result |
|------|---------|-----------------|
| 1 | `npm install` | Drizzle dependencies installed in worker workspace |
| 2 | `npm run check` | All checks pass (types, biome, markdown) |
| 3 | `npm test` | All tests pass (schema, db helper, shared types, plus existing tests) |
| 4 | `npm run test:coverage` | Coverage > 90% on all new files |
| 5 | `cd src/worker && npx drizzle-kit generate` | Migration SQL file generated (or already exists) |
| 6 | `npm run db:migrate:local` | Migration applied to local D1 (requires provisioning first) |
| 7 | `npm start` | Dev server starts; D1 available locally |
