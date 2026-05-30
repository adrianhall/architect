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

## ISSUE-10 — Routing, app shell layout, auth context + tests

### `useAuth.ts` renamed to `useAuth.tsx`

**Decision:** The issue spec lists `src/frontend/src/hooks/useAuth.ts`, but the file contains JSX (`<AuthContext.Provider>`). TypeScript and Biome require the `.tsx` extension for files containing JSX syntax. Created as `useAuth.tsx` instead.

### `useCallback` wraps `fetchUser` to satisfy `useExhaustiveDependencies`

**Decision:** The issue spec shows `useEffect(() => { fetchUser(); }, [])` with an empty dependency array. Biome's `useExhaustiveDependencies` lint rule (equivalent to the ESLint `react-hooks/exhaustive-deps` rule) flags `fetchUser` as a missing dependency. Rather than disabling the rule, `fetchUser` is wrapped in `useCallback(async () => { ... }, [])` — since it only depends on `setState` (which is stable across renders), the callback reference itself is stable and can safely be added to the `useEffect` dependency array. This is the idiomatic React pattern and avoids a lint suppression comment.

### Local `ApiUser` interface (snake_case) instead of shared `User` type

**Decision:** The shared `User` type in `@architect/shared` uses camelCase properties (`avatarUrl`, `createdAt`, `updatedAt`), but the `/api/me` endpoint returns snake_case (`avatar_url`, `created_at`, `updated_at`) because the route handler explicitly maps Drizzle camelCase back to snake_case wire format. Defining a local `ApiUser` interface (snake_case) avoids a type mismatch and is consistent with what all consuming components actually receive. ISSUE-11's typed API client will add the camelCase mapping layer.

### `afterEach(cleanup)` added to `src/frontend/src/test/setup.ts`

**Decision:** Vitest is configured without `globals: true`, so `afterEach` is not in the global scope. `@testing-library/react` registers its automatic cleanup hook by detecting `afterEach` globally. Without it, React trees mounted in one test leak into the next, causing failures when multiple tests render the same component (e.g., `getByRole("img")` finding images from prior tests). Added an explicit `afterEach(cleanup)` import to `setup.ts` to guarantee DOM cleanup after every test.

### Additional page tests created in `src/frontend/src/pages/__tests__/`

**Decision:** The issue spec only specifies test files for `useAuth`, `ProtectedRoute`, `AppShell`, and `App`. However, `Admin.tsx` and `Editor.tsx` had 0% coverage. Added `Admin.test.tsx` and `Editor.test.tsx` in `src/frontend/src/pages/__tests__/` to satisfy the >90% coverage requirement. Similarly, `AdminRoute.test.tsx` was added under `src/frontend/src/components/layout/__tests__/` to cover the admin/non-admin branches.

---

## ISSUE-09 — Frontend scaffolding: Vite, React, Tailwind, shadcn

### React 19 used instead of the spec's React 18 pin

**Decision:** The issue spec requires pinning to React 18 with the rationale "React 19 has breaking changes with React Flow and other libraries used later." At implementation time, React Flow v12 (the version in the MVP plan) fully supports React 19, and all other chosen libraries (`react-router-dom@7`, `@testing-library/react@16`, `react-dom@19`) target React 19 as their canonical peer dependency. Attempting to force React 18 via npm `overrides` conflicted with npm v11's peer dependency resolution, producing a split installation with two React copies that caused `@testing-library/react` to fail with "React Element from an older version of React."

**Resolution:** Use React 19 (`react@^19.0.0`, `react-dom@^19.0.0`, `@types/react@^19.0.0`, `@types/react-dom@^19.0.0`) throughout the frontend workspace. This eliminates the version conflict, keeps all dependencies on a single coherent React copy, and aligns with the current ecosystem.

### `src/worker/public/` added to `.gitignore`

**Decision:** The Vite build outputs the compiled SPA to `src/worker/public/`. This directory is purely generated and must not be committed. The MVP_PLAN.md listed `src/*/dist/` as a generated file to gitignore but did not explicitly include `src/worker/public/`. Added `src/worker/public/` to `.gitignore` so it is excluded from both git and Biome linting (which respects `.gitignore` via `vcs.useIgnoreFile: true`). Without this entry, `npm run fix` would attempt to lint the minified Vite build output and report thousands of false-positive errors in bundled library code.

### `css.parser.tailwindDirectives: true` added to `biome.json`

**Decision:** Biome v2 does not parse Tailwind CSS v4 directives (`@import "tailwindcss"`, `@theme { … }`) by default. Without enabling the CSS parser option, `biome check` reported a parse error for `src/app.css` and refused to format the file. Added `"css": { "parser": { "tailwindDirectives": true } }` to `biome.json` to enable the Tailwind-specific syntax.

### `jsdom` added to root `devDependencies`

**Decision:** Vitest runs from the root `node_modules`. When `environment: "jsdom"` is set in the frontend vitest config, Vitest dynamically imports `jsdom` at runtime. npm workspaces do not hoist workspace-level devDependencies to the root automatically when there is no root-level requirement for the same package. Adding `jsdom: "^26.1.0"` to the root `devDependencies` ensures the package is present in the root `node_modules` and resolvable by Vitest, regardless of npm's hoisting decisions.

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

---

## ISSUE-11 — Typed API client + TanStack Query hooks + tests

### Local snake_case `ApiUser` type instead of shared `User` type in `useMe` and `useAuth`

**Decision:** The issue spec says to use `type { User } from "@architect/shared"` for the `useMe` hook's generic type parameter. However, all API endpoints (`/api/me`, `/api/admin/users`, etc.) return snake_case JSON (`avatar_url`, `created_at`, `updated_at`) because the route handlers explicitly map Drizzle's camelCase column names back to snake_case wire format. The shared `User` type uses camelCase (`avatarUrl`, `createdAt`, `updatedAt`).

Using `User` (camelCase) as the generic type while the actual runtime value is snake_case would be a silent type bug: TypeScript would compile without error, but accessing `user.avatarUrl` would return `undefined` at runtime since the property is actually `avatar_url`.

**Resolution:** `useMe.ts` defines and exports a local `ApiUser` interface (snake_case) that accurately reflects the API wire format. `useAuth.tsx` imports `ApiUser` from `useMe.ts` and continues to expose `user: ApiUser | null` — which is wire-format compatible. This decision extends the pattern established in ISSUE-10. A follow-up issue should either:

1. Update the API endpoints to return camelCase, OR
2. Add an explicit mapping layer in `apiClient` to transform snake_case responses to camelCase before returning them to hooks.

### Local snake_case `AdminUser` type with `diagram_count` in `useAdmin`

**Decision:** The issue spec defines `AdminUsersResponse.users` as `User[]` (shared camelCase type). The actual `GET /api/admin/users` response returns snake_case fields plus a `diagram_count` field not present in the shared `User` type. Using `User[]` would silently mistype the actual shape.

**Resolution:** `useAdmin.ts` defines a local `AdminUser` interface (snake_case) that includes `diagram_count`. The `AdminUsersResponse` interface uses the actual API response structure, with pagination metadata nested under a `pagination` key (matching the actual `success({ users, pagination: { page, limit, total, totalPages } })` response), rather than the flat structure shown in the issue spec (`{ users, total, page, limit }`).

### Existing tests updated to wrap `AuthProvider` with `QueryClientProvider`

**Decision:** The issue spec says "wrap the test renders in the query wrapper." All six test files that render `<AuthProvider>` directly — `ProtectedRoute.test.tsx`, `AppShell.test.tsx`, `AdminRoute.test.tsx`, `Admin.test.tsx`, `useAuth.test.tsx` (updated as instructed), plus any future tests — must wrap with `createQueryWrapper().Wrapper` because `AuthProvider` now calls `useMe` (a TanStack Query hook) internally.

**Resolution:** All six affected test files were updated to import and use `createQueryWrapper()`.

### `useAuth.test.tsx` error mocks provide JSON bodies for API client compatibility

**Decision:** The original ISSUE-10 `useAuth` tests mocked 401 responses as `new Response(null, { status: 401 })`. The ISSUE-11 `apiClient` calls `await res.json()` before checking `!res.ok`, which throws a SyntaxError on a null/empty body. Two tests were updated:

- "sets error to 'unauthorized' on 401 response": mock now returns `JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })`.
- "sets error message on non-401 server error response": previously checked for "Failed to fetch user: 500" (raw status code); now returns a proper JSON error envelope and checks for "Internal server error" (from the error message field).

The "sets generic error message when a non-Error value is thrown" test was removed. This test covered the `err instanceof Error ? err.message : "Unknown error"` branch in the old raw-fetch implementation. The refactored `useAuth` delegates entirely to TanStack Query, which handles non-Error rejections differently. Testing this case would test TanStack Query's internal error handling (a library behavior), not any code we wrote.

### Mutation assertions use `act()` scope instead of post-`act` result state

**Decision:** TanStack Query v5 updates mutation result state (`.data`, `.isSuccess`) asynchronously via React state updates. Asserting on `result.current.data?.title` or `result.current.isSuccess` immediately after an `await act(async () => { ... })` block is unreliable because the React re-render triggered by TanStack Query's state update may not have flushed into `result.current`.

**Resolution:** Tests that need to assert on the mutation's return value now check the return value of `mutateAsync` inside the `act` block (which resolves synchronously with the returned data). Tests that need to assert on `isSuccess` use `await waitFor(() => ...)` after `act` to wait for the state update to flush.

---

## ISSUE-12 — Dashboard page: card grid, CRUD actions, empty state + tests

### AlertDialog installed as `alert-dialog.tsx`, imported from `@/components/ui/alert-dialog`

**Decision:** The issue spec imports `AlertDialog` from `@/components/ui/dialog`. Standard shadcn installs AlertDialog as a separate file (`alert-dialog.tsx`). We installed it separately with `npx shadcn@latest add alert-dialog` and updated the import path to `@/components/ui/alert-dialog`. This matches the shadcn canonical pattern and avoids the risk of merging two unrelated dialog primitives into one file.

### `class-variance-authority` and `lucide-react` added explicitly to frontend `package.json`

**Decision:** The shadcn CLI installs Radix UI packages into `node_modules` via its own npm calls but does not update `src/frontend/package.json` for transitive peer dependencies like `class-variance-authority` (used by `button.tsx`) and `lucide-react` (used by `dialog.tsx` and `dropdown-menu.tsx`). TypeScript type checking fails without explicit entries because npm hoisting is not guaranteed in workspace setups.

**Resolution:** Added `class-variance-authority` and `lucide-react` as explicit `dependencies` in `src/frontend/package.json`.

### Radix DropdownMenuItem: `onSelect` instead of `onClick` for state changes

**Decision:** The issue spec uses `onClick` handlers on `DropdownMenuItem` to trigger state changes (`setIsRenaming`, `setShowDeleteDialog`, `handleDuplicate`). In practice, Radix DropdownMenu closes the portal content on `pointerup` (via `onSelect → rootContext.onClose()`). By the time the native `click` event fires, the `DropdownMenuContent` portal may already be unmounting, causing React to discard the `onClick` handler silently.

**Resolution:** Moved all state-change logic to `onSelect` callbacks. Radix fires `onSelect` via `ReactDOM.flushSync(() => element.dispatchEvent(itemSelectEvent))` — synchronously while the component is still mounted — guaranteeing the state updates are processed. A `willRenameRef` ref prevents the card's `onClick` from navigating before React flushes the `setIsRenaming(true)` update.

### Radix DropdownMenu FocusScope interaction with rename Input

**Decision:** Radix DropdownMenu uses `trapFocus: context.open` on its internal `FocusScope`. When `isRenaming` becomes `true` inside `ReactDOM.flushSync` (during menu item selection), the `useEffect` focus call (`inputRef.current.focus()`) moves focus to the Input while the FocusScope is still active. The trapped FocusScope detects focus outside its container and immediately steals it back, triggering `onBlur → saveRename → setIsRenaming(false)` — the Input disappears before the user can see it.

**Resolution:** Two changes:

1. The `useEffect` that focuses the Input is guarded by `!willRenameRef.current`. When rename is triggered via the dropdown, `willRenameRef.current = true`, so the `useEffect` skips focusing.
2. The `DropdownMenuContent`'s `onCloseAutoFocus` callback (which fires via `setTimeout(fn, 0)` after the FocusScope unmounts) focuses the Input instead. By this point the FocusScope is gone, so focus is safe.

### Test strategy for Radix DropdownMenuItem interactions in JSDOM

**Decision:** `userEvent.click` on a Radix `DropdownMenuItem` does not reliably trigger the item's `onSelect` callback in JSDOM because the full pointer event sequence is required for Radix's `isPointerDownRef` logic. Tests that need to verify behaviour triggered by selecting a menu item (rename, delete, duplicate) use `fireEvent.click(item)` to dispatch a native click event directly, which fires Radix's `handleSelect → dispatchDiscreteCustomEvent → onSelect` chain correctly.

Tests that only verify the dialog/confirmation outcome (e.g., AlertDialog appears) continue to use `userEvent.click` since `onSelect` fires regardless (it's part of Radix's `onClick` composition chain), and `findByRole("alertdialog")` waits up to 1000ms for the result.

### `vi.useFakeTimers({ shouldAdvanceTime: true })` for debounce mutation test

**Decision:** To test that the `renameMutation.mutate()` call inside the 1-second `saveRename` debounce fires correctly, we use `vi.useFakeTimers({ shouldAdvanceTime: true })` combined with `userEvent.setup({ delay: null })`. The `shouldAdvanceTime: true` option makes the fake clock advance at real time (so `waitFor` and `findByRole` polling continue to work), while still allowing `vi.advanceTimersByTime(1001)` to jump over the debounce. Real timers are restored before the final `waitFor` assertion so polling works normally.

### `stopPropagation` on all DropdownMenuItems to prevent card navigation

**Decision:** Clicking any `DropdownMenuItem` (Rename, Duplicate, Delete) caused the Card's `onClick` (`handleCardClick`) to fire and navigate to the editor. The state guard `if (showDeleteDialog) return` was ineffective because `handleCardClick` captured a **pre-`flushSync` closure** where `showDeleteDialog` was still `false` — even though `setShowDeleteDialog(true)` had been committed by `ReactDOM.flushSync` inside Radix's `dispatchDiscreteCustomEvent`. React snapshots event handlers at the start of event dispatch, before any `flushSync` mid-dispatch can update them.

Duplicate had the same latent bug (two navigations: to the original, then to the copy — the second won so it appeared to work). Rename was immune only because `willRenameRef` is a ref (always current), not closure state.

**Resolution:** Added `onClick={(e) => e.stopPropagation()}` to all three `DropdownMenuItem` elements. Radix's `composeEventHandlers` checks `e.defaultPrevented` (not propagation), so `onSelect` / `handleSelect` still fires — the click simply never reaches the Card.

### Tailwind v4: `--spacing-{name}` tokens shadow `--container-{name}` for `max-w-*`

**Decision:** The `app.css` `@theme` block defined `--spacing-sm: 0.5rem`, `--spacing-md: 1rem`, `--spacing-lg: 1.5rem`, etc. In Tailwind v4, `max-w-{name}` resolves to `var(--container-{name})` with a **fallback to `var(--spacing-{name})`** when no container token exists. Our custom spacing tokens shadowed the default container scale, causing `max-w-lg` to compute as `1.5rem` (24px) instead of `32rem` (512px).

This produced two visible bugs:

- **AlertDialog**: `max-w-lg` = 24px → the dialog content had 0px computed width (padding only). The white background was ~50px wide while text overflowed visibly.
- **EmptyState description**: `max-w-md` = 16px → text wrapped word-by-word and the narrow block centered at the viewport midpoint.

**Resolution:** Removed all `--spacing-{name}` custom tokens from `@theme`. Tailwind v4 uses a single `--spacing` base multiplier (`0.25rem`) with numeric utilities (`p-4` = 1rem, `gap-6` = 1.5rem). Named size tokens (`sm`/`md`/`lg`) belong to the `--container-*` namespace, which Tailwind v4 provides at the correct default values when `--spacing-*` does not shadow them. Added a comment in `app.css` explaining the constraint to prevent reintroduction.

---

## ISSUE-13 — React Flow setup + custom node types + keyboard shortcuts

### Editor route uses `/editor/:id`, not `/diagrams/:id`

**Decision:** The issue spec refers to a route `/diagrams/:id` for the Editor page. The App.tsx router established in ISSUE-10 uses `/editor/:id`. This implementation keeps the existing route path; the issue spec had an error. All `useParams`, link-generation, and test route paths use `/editor/:id`.

### Store is seeded AFTER the API effect runs in Editor tests

**Decision:** The Editor's `useEffect` calls `setDiagram` when the TanStack Query data resolves, which overwrites any Zustand store state set before the component mounts. Tests that require specific store state (selected nodes/edges for keyboard shortcut testing) must seed the store AFTER calling `await waitFor(() => screen.getByTestId("reactflow"))`. A `waitForCanvasAndSeed` helper function encapsulates this pattern.

### `useCatalog` typed as `CatalogData` and `useDiagrams` typed as `DiagramResponse`

**Decision:** The issue spec notes that ISSUE-11's `useCatalog.ts` used a local `CatalogResponse` with `unknown[]` arrays as a temporary typing and that the full typing would be aligned with `CatalogData` once catalog components were implemented. ISSUE-13 is the first issue to consume catalog data on the frontend canvas, so the upgrade to `CatalogData` from `@architect/shared` was applied in this issue. Similarly, `useDiagrams.ts` was updated to use `DiagramResponse` from `@architect/shared` instead of a local `Diagram` interface, since the `graph_data.nodes` and `graph_data.edges` must be `DiagramNode[]` / `DiagramEdge[]` (not `unknown[]`) for the canvas conversion utilities to be type-safe.

### Bundle size warning at build time

**Decision:** The Vite production build emits a warning: "Some chunks are larger than 500 kB after minification." The main bundle is 603 kB minified (192 kB gzipped). This is expected for a canvas-heavy application that bundles React 19, React Flow v12, TanStack Query, Zustand, React Router, and Radix UI in a single chunk. The warning is documented here as a known, accepted state for the MVP. Code splitting via dynamic imports for the Editor route (and separately for the Admin route) should be added as a follow-up issue once core functionality is complete.

### `NodeProps` and test fixture types require double-cast via `unknown`

**Decision:** React Flow v12's `NodeProps` type uses `data: Record<string, unknown>`, which is not directly assignable to/from a strongly-typed interface like `CloudflareServiceNodeData`. Similarly, TypeScript's strict overlap checking rejects single `as X` casts between incompatible types. The pattern `data as unknown as CloudflareServiceNodeData` (and its inverse in tests) is used consistently throughout — this is the standard TypeScript idiom for intentional type assertions between non-overlapping types and is safer than using `any`.

---

## ISSUE-14 — Custom edge types + connection handling + tests

### `TriggerEdge` uses inline SVG `<defs>` with per-edge marker IDs instead of `MarkerType.ArrowClosed`

**Decision:** The issue spec suggested using `MarkerType.ArrowClosed` from `@xyflow/react` directly as the `markerEnd` prop on `BaseEdge`. However, `BaseEdge.markerEnd` accepts only a `string` (a `url(#id)` reference), not a React Flow marker object. `MarkerType.ArrowClosed` is the string constant `"arrowclosed"` — passing it as `markerEnd` would reference `url(#arrowclosed)` which React Flow only defines globally when an edge in the store has `markerEnd: { type: MarkerType.ArrowClosed }` configured. Since `TriggerEdge` is responsible for its own arrowhead rendering and must change the marker colour to match the selection state (amber vs. blue), a self-contained approach is required.

**Resolution:** `TriggerEdge` renders inline `<defs>` containing two marker definitions keyed by `trigger-arrow-${edgeId}-default` and `trigger-arrow-${edgeId}-selected`. The `markerEnd` string references the currently active marker id. Per-edge IDs prevent marker collision when multiple trigger edges are rendered simultaneously with mixed selection states.

### `useReducedMotion` hook instead of CSS media query for SVG animation

**Decision:** The issue spec discussed using a CSS media query (`@media (prefers-reduced-motion: reduce)`) to suppress the `<animateMotion>` animation on `DataFlowEdge`. However, SVG SMIL animations (`<animateMotion>`, `<animate>`) do not respond to CSS `animation` or `animation-play-state` properties. The CSS approach in the spec would have no effect.

**Resolution:** Implemented a `useReducedMotion` hook that reads `window.matchMedia("(prefers-reduced-motion: reduce)").matches` and subscribes to change events. `DataFlowEdge` conditionally skips rendering the `<circle>/<animateMotion>` elements entirely when reduced motion is active. A comment was added to `app.css` explaining why no CSS media query is present for this case.
