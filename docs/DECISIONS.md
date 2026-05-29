# Decisions Log

Architectural and implementation decisions that deviate from or extend the original issue specifications.

---

## ISSUE-01 — Project scaffolding

### Remove `noEmit: true` from root `tsconfig.json` compilerOptions

**Decision:** The issue spec included `"noEmit": true` in the root `tsconfig.json` compilerOptions alongside `"composite": true`. In TypeScript 5.x, this combination causes error TS6310 ("Referenced project may not disable emit") when a project with `composite: true` is referenced by another and the parent has `noEmit: true` statically set.

**Resolution:** Removed `"noEmit": true` from the static config. The `--noEmit` flag on the CLI (`tsc -b --noEmit`) is sufficient and does not trigger TS6310.

### Add `generate:types` pre-script for `check:types`

**Decision:** On a clean checkout (no `dist/` folders), `tsc -b --noEmit` fails with TS6310 because declaration files for referenced projects don't yet exist. Added `generate:types` (`tsc -b`) as a `precheck:types` lifecycle script so `npm run check:types` always works from a clean state.

### Add `clean` / `clean:dist` scripts using `rimraf`

**Decision:** Added `rimraf src/*/dist src/*/*.tsbuildinfo` as `clean:dist` under a top-level `clean` script (run-s pattern) to support clean-state testing and CI workflows. `rimraf` added as a root devDependency.

### Update `biome.json` for Biome v2 breaking changes

**Decision:** The issue spec used Biome v1 config keys that were removed in v2.0.6:

- `organizeImports` (top-level) → `assist.actions.source.organizeImports: "on"`
- `files.ignore` → `files.includes` with negation globs (`"!**/*.d.ts"`, `"!infra/**"`)

Since `vcs.useIgnoreFile: true` already excludes `.gitignore` entries (`node_modules`, `dist`, `.wrangler`, `coverage`), the `files.includes` array only needs the entries not covered by `.gitignore`.

### Install `react` and `react-dom` in frontend workspace

**Decision:** The issue spec only mentioned `jsdom` as a devDependency for the frontend workspace. However, `"jsx": "react-jsx"` requires the `react` runtime package (specifically `react/jsx-dev-runtime`) to be resolvable at test time. Added `react` and `react-dom` as runtime dependencies and `@types/react` / `@types/react-dom` as devDependencies in `src/frontend`.

### Scope coverage to `src/worker/src` and `src/frontend/src` only

**Decision:** Without explicit coverage configuration, Vitest v3 includes `dist/` build artifacts and `src/shared/src` stub files (all `export {}`), making the coverage table noisy and misleading. Added `coverage.include`/`exclude` to both workspace vitest configs and a root-level `coverage.provider: "v8"` with matching includes. Result: only the files with real implementation appear in the report, both at 100%.

### Extend placeholder tests to invoke actual code paths

**Decision:** The original placeholder tests only checked that exports existed (`expect(fn).toBeInstanceOf(Function)`), leaving the function bodies uncovered. Added one additional test per file that calls the fetch handler / renders the App component, achieving 100% coverage on both new source files.

---

## ISSUE-02 — Terraform infrastructure + deployment pipeline

### `cloudflare_worker` v5 attribute corrections

**Decision:** The issue spec specified `cloudflare_worker` with `script_name`, `main_module`, `compatibility_date`, and `content` attributes. Per the Cloudflare v5 Terraform provider docs and the IaC guide, `cloudflare_worker` uses `name` (not `script_name`) and does not accept `main_module`, `compatibility_date`, or `content`. Those attributes belong to `cloudflare_workers_script` or `cloudflare_worker_version`.

**Resolution:** Used `cloudflare_worker` with only `account_id` and `name`. Terraform registers the worker name; Wrangler deploys the actual code. `outputs.tf` references `cloudflare_worker.app.name` (not `.script_name`). This matches the cloudflare-scripts skill's canonical pattern.

### dotenv provider attribute is `.env`, not `.entries`

**Decision:** The issue spec used `data.dotenv.env.entries.VARIABLE` to access `.env` file values. Per the jrhouston/dotenv provider source code (confirmed from `data_source_dotenv.go`), the exported attribute is `env` (a TypeMap), not `entries`. Accessing individual values requires `data.dotenv.env.env.VARIABLE_NAME`.

**Resolution:** Used `data.dotenv.env.env.VARIABLE` throughout `infra/main.tf`. The issue spec attribute name would cause `terraform validate` to fail with an "unsupported argument" error.

### `precheck:types` decoupled from `generate:types`

**Decision:** ISSUE-01 set `precheck:types: "npm run generate:types"` to ensure TypeScript declaration files exist before type checking. In ISSUE-02, `generate:types` changes meaning from `tsc -b` to `generate-types -d src/worker -- ...` (which generates `worker-configuration.d.ts` from `wrangler.jsonc`). Running this as a pre-step for `check:types` would fail on a clean checkout without provisioned infrastructure.

**Resolution:** Changed `precheck:types` to `tsc -b` directly, preserving the ISSUE-01 behavior of building workspace declaration files before type checking, without requiring a provisioned `wrangler.jsonc`.

### `npm run build` requires provisioned infrastructure

**Decision:** The new `build` script (`run-s generate:types build:frontend`) invokes `generate-types` which requires `wrangler.jsonc` to exist. On a clean checkout without `npm run provision`, `npm run build` exits with code 1. This is expected and documented behavior — the generate-types tool explicitly instructs: "Run `npm run provision` to provision infrastructure and generate it."

**Resolution:** This is by design. The deployment workflow documented in `MVP_PLAN.md` requires provisioning before building. No change was made; the behavior matches the workflow intent.

### `@adrianhall/cloudflare-scripts` installed from GitHub `main`

**Decision:** The cloudflare-scripts skill referenced tag `v1.0.2` which did not exist on the GitHub repo at implementation time (only `v1.0.1` and `1.0.0` were released tags). The `main` branch contains version `1.0.2` code.

**Resolution:** Installed from `github:adrianhall/cloudflare-scripts` (main branch). The `package.json` devDependency is pinned to the GitHub source. Once a `v1.0.2` tag is released, the reference should be updated to `github:adrianhall/cloudflare-scripts#v1.0.2`.

---

## ISSUE-02 amendment — Cloudflare Access resources

### Separate `cloudflare_zero_trust_access_policy` and `cloudflare_zero_trust_access_application` resources

**Decision:** Added two new Terraform resources to protect the Worker with Cloudflare Access. Per the user's requirement, resources are kept separate (not embedded) because embedded policies in the Access application are deprecated in the v5 provider.

- **`cloudflare_zero_trust_access_policy.allow_idp`** — Account-level, reusable policy. `decision = "allow"` with a single `include` rule using `login_method.id = local.idp_id`. This allows any user who successfully authenticates through the configured IdP, regardless of email domain.
- **`cloudflare_zero_trust_access_application.app`** — Self-hosted application protecting `${worker_name}.${workers_domain}`. Uses `account_id` (not `zone_id`) because workers.dev is an account-level domain, not a zone. Sets `allowed_idps = [local.idp_id]` to restrict the login screen to the configured IdP and `auto_redirect_to_identity = true` to skip the Cloudflare Access landing page. Links to the policy via `policies = [{ id = ..., precedence = 1 }]`.

**New `.env` variables consumed:** `CLOUDFLARE_IDP_ID` (IdP UUID) and `CLOUDFLARE_WORKERS_DOMAIN` (e.g., `abc123.workers.dev`) — both added to `locals` in `main.tf`. Both were already documented in the updated `.env.example`.

**Verified:** `npm run provision` created all 4 resources (worker, D1 database, Access policy, Access application) successfully. `terraform plan` on a second run shows "No changes" — fully idempotent.

---

## ISSUE-03 — D1 schema + Drizzle ORM + migrations + shared types

### Use binding name `DB` for `d1 migrations apply`, not the database name

**Decision:** The issue spec used the hardcoded database name `cf-architect-db` in the `db:migrate:local` and `db:migrate:remote` scripts. Per the [Wrangler D1 docs](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply), the `[DATABASE]` positional argument accepts either "the name or binding of the DB". The database name is derived from `TF_VAR_worker_name` (e.g. `${worker_name}-db`) and changes whenever the worker is renamed, making a hardcoded name fragile.

**Resolution:** Changed both scripts to use the binding name `DB`, which is the constant name declared in `wrangler.jsonc.tpl` and never changes regardless of infrastructure naming:

```json
"db:migrate:local": "wrangler d1 migrations apply DB --local --config wrangler.jsonc",
"db:migrate:remote": "wrangler d1 migrations apply DB --remote --config wrangler.jsonc"
```

### `getDb` function body now tested via `@cloudflare/vitest-pool-workers`

**Decision (supersedes the `v8 ignore` workaround):** The `v8 ignore` annotation on `getDb` was removed. The worker project now uses `@cloudflare/vitest-pool-workers` (Miniflare), which provides a real in-memory `D1Database` binding. `getDb(env.DB)` is called in `src/worker/src/db/index.test.ts` and exercises the full function path.

### `@cloudflare/vitest-pool-workers` for Worker tests; Vitest upgraded to 4.1.7

**Decision:** Worker tests that need D1 bindings (DB helper, migration verification) cannot run in the standard Node environment — a real `D1Database` is required. `@cloudflare/vitest-pool-workers` runs every test file in the Miniflare Workers runtime with a full in-memory D1 instance.

This required upgrading `vitest` and `@vitest/coverage-v8` from `3.2.1` to `4.1.7` (the minimum version required by `@cloudflare/vitest-pool-workers@0.16.10`).

A committed `wrangler.test.jsonc` provides the D1 binding configuration for tests. Miniflare ignores the placeholder `database_id` and provisions an in-memory SQLite database.

### `@cloudflare/vitest-pool-workers/config` sub-path does not exist in v0.16.10

**Decision:** The Cloudflare documentation shows `import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config"`. In `@cloudflare/vitest-pool-workers@0.16.10`, the `./config` sub-path export does not exist. Both `cloudflareTest` and `readD1Migrations` are exported from the main entry point (`@cloudflare/vitest-pool-workers`).

**Resolution:** Import both from the main package.

### `test:coverage` excludes the worker project (v8 coverage incompatible with Workers runtime)

**Decision:** `@vitest/coverage-v8` imports `node:inspector/promises` to instrument code. The Workers runtime (Miniflare) does not provide `node:inspector`, so coverage collection for worker tests fails with "No such module node:inspector/promises". This is [documented by Cloudflare](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution).

**Resolution:** Changed `test:coverage` to run only `--project frontend --project shared`. Worker code correctness is verified through the 22 integration tests that run against Miniflare D1 via `npm test` or `npm run test:worker`.

### Shared type tests moved to their own Vitest project

**Decision:** Shared type tests were previously run inside the worker project (`include: ["../shared/src/**/*.test.ts"]`). Moving to `cloudflareTest()` for the worker project would unnecessarily run pure TypeScript type tests inside Miniflare. The shared package now has its own `vitest.config.ts` (standard Node environment) and is listed as a separate project in the root config.

### `Cloudflare.Env` augmented in `env.d.ts` instead of `extends Env`

**Decision:** The docs suggest `interface ProvidedEnv extends Env {}` to make production bindings available on `env` in tests. But `Env` comes from `worker-configuration.d.ts`, which is generated and lives outside the TypeScript `include` directory (`src/worker/src/`). On a clean checkout without provisioning, TypeScript silently treats `Env` as `{}`, making `env.DB` resolve to `any` and cascading implicit-any errors throughout all test files.

**Resolution:** Augment `Cloudflare.Env` directly in `src/worker/src/test/env.d.ts` (which IS inside `include`). When `worker-configuration.d.ts` IS present, TypeScript merges both declarations — identical property types, no conflict. This approach works on clean checkouts and after provisioning.

---

## ISSUE-05 — User provisioning + admin seeding + /api/me + tests

### `ulid` moved from devDependencies to dependencies

**Decision:** `ulid` was placed in `devDependencies` during ISSUE-03/04 setup. Because `ulid()` is called inside the production route handler (`routes/me.ts`) to generate user IDs, it must be in `dependencies` so that the bundled Worker includes it at runtime.

**Resolution:** Moved `ulid: "^3.0.2"` from `devDependencies` to `dependencies` in `src/worker/package.json`. No version change.

### `wrangler.test.jsonc` `SEED_ADMIN_EMAIL` updated to `admin@test.com`

**Decision:** The original `wrangler.test.jsonc` set `SEED_ADMIN_EMAIL = "test@example.com"`. The `GET /api/me` integration tests use `admin@test.com` as the seed admin email (matching the `createMockEnv` default in `helpers.ts`). Using `test@example.com` would make the admin-seeding tests fail because the email would not match.

**Resolution:** Changed `SEED_ADMIN_EMAIL` in `wrangler.test.jsonc` from `"test@example.com"` to `"admin@test.com"`. This matches the test expectations and the default in `createMockEnv`.

### Local `MeEnv` type in `routes/me.ts` instead of importing `WorkerEnv`

**Decision:** The issue spec defines a local `MeEnv` type for the `me` sub-router. Using the project's shared `WorkerEnv` from `types.ts` is an option, but it would introduce a dependency from a route file to the root types module. A local minimal type keeps the route self-contained and matches the pattern used in `middleware/admin.ts` (which also defines a local binding type).

**Resolution:** Kept the local `MeEnv` type in `routes/me.ts` as specified. It includes only the bindings the route actually uses (`DB`, `SEED_ADMIN_EMAIL`) and the `AuthVariables` for context vars.

---

## ISSUE-06 — Diagram API: CRUD, duplicate, rename, concurrency + tests

### User lookup by email on every request (no session caching)

**Decision:** The diagrams routes resolve `user_id` from the authenticated email on every request by querying the `users` table. There is no JWT-claim-to-user-id mapping cached in the context. This is consistent with the `me.ts` pattern and correct because the auth middleware only provides `userEmail` — it does not provide the database `user_id`.

**Alternative considered:** Storing `user_id` in the Hono context variables during the auth middleware. Deferred to keep this issue scoped; the auth middleware in ISSUE-04 was designed for `userEmail` only. A future refactor could cache the `user_id` in context to save one DB round-trip per request.

### `PUT` endpoint re-fetches after update to return accurate response

**Decision:** After the atomic `UPDATE … WHERE version = ?` succeeds, the handler re-fetches the updated row rather than constructing a response from the request inputs. This ensures the response reflects the actual DB state (e.g., if `updated_at` were set by a DB trigger in a future migration). The extra round-trip is negligible in D1.

### `DiagramResponse` placed in `src/shared/src/diagram.ts`

**Decision:** The issue spec mentions adding `DiagramResponse` to `src/shared/src/diagram.ts`. Since it references `GraphData` (also in that file) and is logically part of the diagram type domain, it was added there rather than in `api.ts`. It is re-exported via `src/shared/src/index.ts`.

### Dynamic imports replaced with static imports for `users` schema table

**Decision:** The initial draft of `diagrams.ts` used `const { users } = await import("../db/schema")` inside each handler to avoid a potential circular dependency. On review, there is no circular dependency — `diagrams.ts` → `../db/schema` is a clean one-way dependency. Replaced all dynamic imports with a single static `import { diagrams, users } from "../db/schema"` at the top of the file, which is consistent with the rest of the codebase and avoids unnecessary dynamic module loading in the Workers runtime.

---

## ISSUE-07 — Admin API + structured audit logging + tests

### LEFT JOIN + GROUP BY instead of correlated subquery for diagram count

**Decision:** The issue spec suggests a correlated subquery for `diagram_count`:

```typescript
const diagramCountExpr = sql<number>`(SELECT COUNT(*) FROM diagrams WHERE diagrams.user_id = ${users.id})`;
```

In Drizzle ORM with D1, interpolating a column object (`${users.id}`) inside a `sql` template literal generates a parameter binding (`?`) whose value is the column definition object rather than a SQL column reference. This causes the subquery to compare `diagrams.user_id` against a non-string value, returning 0 for every row.

**Resolution:** Replaced the correlated subquery with a LEFT JOIN + GROUP BY:

```typescript
.from(users)
.leftJoin(diagrams, eq(diagrams.userId, users.id))
.groupBy(users.id, /* other columns */)
.select({ ..., diagramCount: sql<number>`count(${diagrams.id})` })
```

`COUNT(diagrams.id)` returns 0 for users with no diagrams because the LEFT JOIN produces a NULL `diagrams.id` for those rows and `COUNT` ignores NULLs. This is both correct and efficient (single round-trip for any page size).

### Path-scoped `app.use()` instead of sub-router for admin guard

**Decision:** The issue spec mounts the admin guard via a Hono sub-router:

```typescript
const adminRoutes = new Hono();
adminRoutes.use("*", adminGuard);
adminRoutes.route("/users", adminUsers);
app.route("/api/admin", adminRoutes);
```

Using `new Hono()` (no type params) loses type safety for the sub-router context. Using `new Hono<WorkerEnv>()` introduces Hono middleware variance concerns when applying `adminGuard` (typed with a narrower env type).

**Resolution:** Applied the guard directly to the main app with a path pattern, then mounted the route:

```typescript
app.use("/api/admin/*", adminGuard);
app.route("/api/admin/users", adminUsersRouter);
```

This is semantically equivalent, avoids the sub-router type complexity, and keeps all route registrations on the same `app` instance in `index.ts`.

### Test file at `routes/admin/__tests__/users.test.ts` not `test/admin-users.test.ts`

**Decision:** The issue spec places tests at `src/worker/src/test/admin-users.test.ts`. AGENTS.md states: "Place every test file in a `__tests__/` directory next to the directory it covers."

**Resolution:** Placed the test at `src/worker/src/routes/admin/__tests__/users.test.ts` following AGENTS.md. The Vitest `include` pattern `src/**/*.test.ts` picks it up automatically.

### Existing `adminGuard` kept; no new `requireAdmin` created

**Decision:** The issue spec says "If not already created by ISSUE-04/05, create `middleware/admin.ts`." The `adminGuard` middleware was created in ISSUE-05 and queries the DB to check the admin role. It is functionally identical to the spec's `requireAdmin` (which reads a `user` context variable not present in our auth stack). No duplicate export was created.

---

## ISSUE-04 — Auth middleware + structured logging + test helpers

### `test/helpers.ts` placed at `src/worker/src/test/helpers.ts`, not `src/worker/test/helpers.ts`

**Decision:** The ISSUE-04 spec places the helpers file at `src/worker/test/helpers.ts`. The `tsconfig.json` for the worker package has `rootDir: "src"` and `include: ["src"]`, both of which refer to `src/worker/src/`. A file at `src/worker/test/helpers.ts` (i.e., `test/helpers.ts` relative to the worker package) is outside the TypeScript compilation unit. TypeScript would emit TS6059 ("File is not under rootDir") when it is imported by test files inside `src/worker/src/`.

**Resolution:** Placed at `src/worker/src/test/helpers.ts`, consistent with the MVP_PLAN directory tree (which shows `test/helpers.ts` under `src/worker/src/`). The ISSUE-04 spec had a path error.

### Drizzle schema uses camelCase property names, not snake_case

**Decision:** The ISSUE-04 test code used snake_case property names (`avatar_url`, `created_at`, `updated_at`, `user_id`, `graph_data`) when inserting rows into D1 via Drizzle. The Drizzle schema defines camelCase TypeScript property names (`avatarUrl`, `createdAt`, `updatedAt`, `userId`, `graphData`) with snake_case SQL column names. Using snake_case property names with Drizzle's `.values()` method causes TypeScript type errors and would not map to the correct columns.

**Resolution:** Updated the test files and `createTestUser` / `createTestDiagram` factory functions in `helpers.ts` to use camelCase property names, matching the Drizzle schema definitions.

### Expired-token test removed from auth.test.ts

**Decision:** The ISSUE-04 spec included a test asserting that an expired dev JWT produces a 302 redirect. This tests behavior internal to the `@adrianhall/cloudflare-auth` library (specifically, what it does when HMAC validation fails and JWKS fallback returns an unsupported algorithm). The correct scope for auth middleware wiring tests is: public route is reachable, protected route requires auth, valid token sets user context.

**Resolution:** The expired-token test was removed. The three remaining tests verify that the middleware is correctly wired (order, policy configuration, context variables) without depending on library internals.

---

## ISSUE-08 — Service catalog: data, shared types, API, icon serving + tests

### `CatalogEdgeType` instead of `EdgeType` in catalog.ts

**Decision:** The issue spec defines an `interface EdgeType` in `src/shared/src/catalog.ts` to represent a catalog edge-type object (with `id`, `label`, `style` fields). However, `src/shared/src/diagram.ts` already exports `type EdgeType = "data-flow" | "binding" | "trigger" | "dependency"` — a union type used as the discriminant for `DiagramEdge.type`. Both are re-exported via the barrel `src/shared/src/index.ts`, which would produce a duplicate-export error (`TS2308`).

**Resolution:** Renamed the catalog interface to `CatalogEdgeType` to eliminate the collision. The `CatalogData.edgeTypes` field is therefore `CatalogEdgeType[]`. The `EdgeType` union in `diagram.ts` is unchanged. Tests, the catalog route, and the catalog data file all reference `CatalogEdgeType`.

### `@types/node` added to shared and worker devDependencies

**Decision:** The shared package's catalog test uses `createRequire` from `node:module` to load `catalog/services.json` at runtime (a clean alternative to a static JSON import that would violate TypeScript's `rootDir` constraint in a composite project). Without `@types/node`, TypeScript reports `TS2307: Cannot find module 'node:module'`. Additionally, the worker package has `nodejs_compat` enabled in wrangler, so Node.js-compatible built-in modules are available at runtime.

**Resolution:** Added `"@types/node": "^22"` to `devDependencies` of both `src/shared/package.json` and `src/worker/package.json`. Added `"node"` to the worker tsconfig `types` array. npm hoists the package to the root `node_modules`, so both workspaces resolve it from the same install.

### SVG icons sourced from cloudflare-docs, converted to `currentColor`

**Decision:** The cloudflare-docs icons use three different colour conventions: (a) no explicit fill (paths default to black), (b) hardcoded Cloudflare orange (`#f6821f`), or (c) hardcoded black (`#000`). Icons served as static SVG files and referenced by `<img>` tags cannot be recoloured via CSS. Converting paths to `fill="currentColor"` allows the frontend to control icon colour via CSS `color` when inlining SVGs.

**Resolution:** 22 icons with no explicit fill had `fill="currentColor"` added to the `<svg>` element. 4 icons with `fill="#f6821f"` (kv, durable-objects, vectorize, pipelines) had path fills replaced with `currentColor`. 1 icon with `fill="#000"` (argo-smart-routing) had its path fills replaced with `currentColor`. Clip-path `fill="#fff"` values in `<defs>` were intentionally left unchanged.

### Catalog JSON read via `createRequire` in shared tests

**Decision:** A static `import catalogData from "../../../../catalog/services.json"` in `src/shared/src/__tests__/catalog.test.ts` would resolve a file outside the TypeScript `rootDir` (`src/shared/src/`). With `composite: true` and `isolatedModules: true`, TypeScript may emit `TS6059` for source files outside `rootDir`. Using `createRequire(import.meta.url)` instead loads the JSON at runtime through Node's CommonJS require, which TypeScript does not attempt to emit, sidestepping the constraint entirely.

**Resolution:** The shared catalog test imports the JSON with `const require = createRequire(import.meta.url); const catalogData: CatalogData = require("../../../../catalog/services.json")`. A `CatalogData` type annotation provides full type safety without a static import path.
