# User provisioning + admin seeding + /api/me + tests

## Summary

Create the Hono app entry point that wires together all middleware and routes, implement the `/api/version` public endpoint, and build the `/api/me` endpoint with automatic user provisioning (including admin seeding via `SEED_ADMIN_EMAIL`). After this issue the worker is fully runnable locally with `npm start` — visiting the URL shows the cloudflare-auth PIN login form.

## Relevant Skills

- `cloudflare-auth`
- `cloudflare`
- `workers-best-practices`
- `api-design-principles`

## Requirements Coverage

- [F2-US1](../REQUIREMENTS.md) — All protected routes require Cloudflare Access authentication and return 401/302 for unauthenticated requests.
- [F2-US2](../REQUIREMENTS.md) — First admin seeded by `SEED_ADMIN_EMAIL` environment variable.
- [F2-US6](../REQUIREMENTS.md) — User can see their profile (name, email, avatar) so they know they are logged in with the right account.

## Dependencies

- **ISSUE-03** — D1 schema, Drizzle ORM, and migrations must exist (the `users` table and Drizzle schema are required).
- **ISSUE-04** — Auth middleware, logger middleware, admin guard, response helpers, error codes, and test helpers must exist.

## Acceptance Criteria

- [ ] `src/worker/src/index.ts` creates a type-safe Hono app with `Bindings` and `AuthVariables`.
- [ ] Middleware is registered in correct order: logger → `developerAuthentication` → `cloudflareAccess`.
- [ ] Routes are mounted: `/api/version` (public), `/api/me` (protected), plus placeholder routes for `/api/catalog`, `/api/diagrams`, `/api/admin`.
- [ ] Catch-all route `app.get("*", ...)` serves static assets via `c.env.ASSETS.fetch(c.req.raw)`.
- [ ] `GET /api/version` returns `{ data: { version: "1.0.0" } }` without auth.
- [ ] `GET /api/me` auto-provisions user on first request (creates DB record).
- [ ] If the user's email matches `SEED_ADMIN_EMAIL`, the user is created with role `admin`.
- [ ] All other users are created with role `user`.
- [ ] `GET /api/me` returns `{ data: { id, email, name, avatar_url, role, created_at, updated_at } }`.
- [ ] Subsequent calls to `GET /api/me` return the existing user (no duplicates).
- [ ] User IDs are ULIDs (install and use the `ulid` package).
- [ ] `app` is the default export of `src/worker/src/index.ts`.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### Step 1: Install `ulid` in `src/worker`

```bash
cd src/worker
npm install ulid
```

The `ulid` package generates lexicographically sortable unique IDs. It should be added to `dependencies` (not `devDependencies`) since it is used in production code.

### Step 2: Create `src/worker/src/routes/version.ts`

A simple public endpoint that returns the app version:

```ts
import { Hono } from "hono";
import { success } from "../lib/response";

const version = new Hono();

/**
 * GET /api/version
 *
 * Public endpoint — no authentication required.
 * Returns the application version.
 */
version.get("/", (c) => {
  return c.json(success({ version: "1.0.0" }));
});

export { version };
```

### Step 3: Create `src/worker/src/routes/me.ts`

This is the core of this issue. The `/api/me` route:

1. Reads the authenticated user's email from Hono context (`c.get("userEmail")`).
2. Queries D1 for an existing user with that email.
3. If found, returns the user profile.
4. If not found, auto-provisions a new user:
   - Generates a ULID for the `id`.
   - Derives `name` from the email prefix (everything before `@`).
   - Sets `role` to `"admin"` if the email matches `SEED_ADMIN_EMAIL`, otherwise `"user"`.
   - Inserts the record.
   - Returns the new profile.

```ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { AuthVariables } from "../middleware/auth";
import { users } from "../db/schema";
import { success, error } from "../lib/response";
import { ErrorCode } from "../lib/errors";

type MeEnv = {
  Bindings: {
    DB: D1Database;
    SEED_ADMIN_EMAIL: string;
  };
  Variables: AuthVariables;
};

const me = new Hono<MeEnv>();

/**
 * GET /api/me
 *
 * Returns the current user's profile.
 * Auto-provisions a user record on first request for a new email.
 * If the email matches SEED_ADMIN_EMAIL, the user is created with role 'admin'.
 */
me.get("/", async (c) => {
  const email = c.get("userEmail");

  if (!email) {
    return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
  }

  const db = drizzle(c.env.DB);

  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    return c.json(
      success({
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        avatar_url: existingUser.avatar_url,
        role: existingUser.role,
        created_at: existingUser.created_at,
        updated_at: existingUser.updated_at,
      })
    );
  }

  // Auto-provision new user
  const now = Date.now();
  const seedAdminEmail = c.env.SEED_ADMIN_EMAIL;
  const role = seedAdminEmail && email.toLowerCase() === seedAdminEmail.toLowerCase()
    ? "admin"
    : "user";

  const newUser = {
    id: ulid(),
    email,
    name: email.split("@")[0],
    avatar_url: null,
    role,
    created_at: now,
    updated_at: now,
  };

  await db.insert(users).values(newUser);

  return c.json(success({
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    avatar_url: newUser.avatar_url,
    role: newUser.role,
    created_at: newUser.created_at,
    updated_at: newUser.updated_at,
  }), 201);
});

export { me };
```

**Key decisions:**

- The email comparison for `SEED_ADMIN_EMAIL` is case-insensitive (`.toLowerCase()` on both sides).
- The `name` is derived from the email prefix (`email.split("@")[0]`). Users can update their name later (post-MVP).
- `avatar_url` defaults to `null`. It can be populated from the IdP later (post-MVP).
- New users receive HTTP 201 Created; existing users receive 200 OK.
- The response shape matches the `users` table columns exactly, formatted as the API envelope `{ data: { ... } }`.

### Step 4: Create `src/worker/src/index.ts`

The main Hono app entry point. This wires together all middleware and routes:

```ts
import { Hono } from "hono";
import type { AuthVariables } from "./middleware/auth";
import { devAuthMiddleware, cfAccessMiddleware } from "./middleware/auth";
import { loggerMiddleware } from "./middleware/logger";
import { version } from "./routes/version";
import { me } from "./routes/me";

/**
 * Hono app Env type.
 *
 * Bindings come from worker-configuration.d.ts (generated by generate-types).
 * Variables include auth context from cloudflare-auth.
 */
type AppEnv = {
  Bindings: CloudflareBindings;
  Variables: AuthVariables & { requestId: string };
};

const app = new Hono<AppEnv>();

// ── Middleware (order matters!) ──────────────────────────────────────────────
// 1. Logger — wraps entire request lifecycle for timing
// 2. developerAuthentication — MUST come before cloudflareAccess
// 3. cloudflareAccess — validates JWT (dev HMAC or production JWKS)
app.use(loggerMiddleware);
app.use(devAuthMiddleware);
app.use(cfAccessMiddleware);

// ── Routes ──────────────────────────────────────────────────────────────────
app.route("/api/version", version);
app.route("/api/me", me);

// Placeholder routes for future issues
// app.route("/api/catalog", catalog);       // ISSUE-08
// app.route("/api/diagrams", diagrams);     // ISSUE-06
// app.route("/api/admin", admin);           // ISSUE-07

// ── Catch-all: serve static assets ─────────────────────────────────────────
// All requests flow through the Worker (run_worker_first: true).
// The ASSETS binding proxies to the built frontend files.
// Do NOT use serveStatic from hono/cloudflare-workers — it targets legacy KV.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
```

**Critical notes about this file:**

1. **`CloudflareBindings`** — This type comes from the generated `worker-configuration.d.ts` file (produced by `generate-types`). It includes all bindings declared in `wrangler.jsonc`: `DB`, `ASSETS`, `CLOUDFLARE_TEAM_DOMAIN`, `SEED_ADMIN_EMAIL`, etc. If the type does not exist yet, run `npm run generate:types` first.

2. **Middleware order** — Logger is first so it captures the full request duration including auth processing. `devAuthMiddleware` is second (must be before `cfAccessMiddleware`). `cfAccessMiddleware` is third.

3. **Catch-all route** — `app.get("*", ...)` is registered LAST. It proxies to the ASSETS binding which serves the built frontend. The `not_found_handling: "single-page-application"` setting in `wrangler.jsonc` ensures that non-matching paths return `index.html` for client-side routing.

4. **Default export** — The app is the default export. Wrangler expects this for the Worker entry point.

### Step 5: Verify `wrangler.jsonc.tpl` includes required vars

Ensure that `src/worker/wrangler.jsonc.tpl` (created in ISSUE-02) includes the `SEED_ADMIN_EMAIL` var. The template should already have `CLOUDFLARE_TEAM_DOMAIN` from ISSUE-02. If `SEED_ADMIN_EMAIL` is not present, add it to the `vars` section:

```jsonc
{
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "{{cloudflare_team_domain}}",
    "SEED_ADMIN_EMAIL": "{{seed_admin_email}}"
  }
}
```

Also verify that the Terraform `outputs.tf` has corresponding `seed_admin_email` output that reads from `.env` via the dotenv provider.

### Step 6: Ensure the frontend build produces output

For the catch-all route to work during `npm start`, the frontend must have been built. ISSUE-01 should have created a minimal `src/frontend` with a Vite config that outputs to `src/worker/public/` (or wherever the ASSETS binding points). If the frontend build output directory does not exist, create a minimal `src/worker/public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CF-Architect</title>
</head>
<body>
  <div id="root">
    <h1>CF-Architect v2</h1>
    <p>Frontend not yet built. Run <code>npm run build:frontend</code>.</p>
  </div>
</body>
</html>
```

This is a placeholder so `npm start` doesn't fail when no frontend build exists yet.

### Step 7: Write tests

All tests use `@cloudflare/vitest-pool-workers` which provides a real D1 instance and Worker environment. The `env` object from `cloudflare:test` includes the D1 binding.

#### `src/worker/src/routes/__tests__/version.test.ts`

```ts
import { describe, it, expect } from "vitest";
import app from "../../index";

const TEST_ENV = {
  CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com",
  SEED_ADMIN_EMAIL: "admin@test.com",
};

describe("GET /api/version", () => {
  it("returns 200 without authentication", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/version"),
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });

  it("returns version in success envelope", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/version"),
      TEST_ENV
    );
    const body = await res.json();
    expect(body).toEqual({ data: { version: "1.0.0" } });
  });
});
```

#### `src/worker/src/routes/__tests__/me.test.ts`

These tests exercise the full middleware chain through the app entry point. They use `signDevJwt` from the test helpers:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { signDevJwt, JWT_HEADER } from "../../../test/helpers";
import { users } from "../../db/schema";
import app from "../../index";

describe("GET /api/me", () => {
  beforeEach(async () => {
    // Clean users table before each test
    const db = drizzle(env.DB);
    await db.delete(users);
  });

  it("returns 302 redirect without authentication", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/me"),
      env
    );
    expect(res.status).toBe(302);
  });

  it("auto-provisions user on first request and returns 201", async () => {
    const token = await signDevJwt("alice@example.com");
    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.email).toBe("alice@example.com");
    expect(body.data.name).toBe("alice");
    expect(body.data.role).toBe("user");
    expect(body.data.avatar_url).toBeNull();
    expect(body.data.id).toBeDefined();
    expect(body.data.created_at).toBeDefined();
    expect(body.data.updated_at).toBeDefined();
  });

  it("returns existing user on second request with 200", async () => {
    const token = await signDevJwt("alice@example.com");

    // First request — provisions user
    const res1 = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    // Second request — returns existing user
    const res2 = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    // Same user, same ID
    expect(body2.data.id).toBe(body1.data.id);
    expect(body2.data.email).toBe("alice@example.com");
  });

  it("does not create duplicate users", async () => {
    const token = await signDevJwt("alice@example.com");

    // Make three requests
    for (let i = 0; i < 3; i++) {
      await app.fetch(
        new Request("http://localhost/api/me", {
          headers: { [JWT_HEADER]: token },
        }),
        env
      );
    }

    // Verify only one user exists
    const db = drizzle(env.DB);
    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(1);
  });

  it("seeds admin role when email matches SEED_ADMIN_EMAIL", async () => {
    // env.SEED_ADMIN_EMAIL is set to "admin@test.com" in the test env
    const token = await signDevJwt("admin@test.com");
    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.email).toBe("admin@test.com");
    expect(body.data.role).toBe("admin");
  });

  it("SEED_ADMIN_EMAIL comparison is case-insensitive", async () => {
    // env.SEED_ADMIN_EMAIL is "admin@test.com" but we send uppercase
    const token = await signDevJwt("Admin@Test.com");
    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );

    const body = await res.json();
    expect(body.data.role).toBe("admin");
  });

  it("non-admin email gets user role", async () => {
    const token = await signDevJwt("regular@example.com");
    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );

    const body = await res.json();
    expect(body.data.role).toBe("user");
  });

  it("user ID is a valid ULID", async () => {
    const token = await signDevJwt("alice@example.com");
    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );

    const body = await res.json();
    // ULID: 26 uppercase alphanumeric characters
    expect(body.data.id).toMatch(/^[0-9A-Z]{26}$/);
  });
});
```

### Step 8: Configure the Vitest test environment for D1

The worker's `vitest.config.ts` (from ISSUE-01) should already be configured with `@cloudflare/vitest-pool-workers`. Ensure the `miniflare` config in `vitest.config.ts` includes the D1 binding and the `SEED_ADMIN_EMAIL` var so that `env` from `cloudflare:test` has both:

```ts
// In src/worker/vitest.config.ts, the miniflare config should include:
{
  d1Databases: ["DB"],
  bindings: {
    CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com",
    SEED_ADMIN_EMAIL: "admin@test.com",
  },
}
```

Also ensure the D1 migrations are applied before tests run. The `@cloudflare/vitest-pool-workers` setup should handle this if `wrangler.jsonc` points to the migrations directory, or the test setup needs to run the SQL migrations against the test D1 instance.

### Step 9: Verify the full local development flow

Run:

```bash
npm run build         # Build all artifacts (generates types, builds frontend)
npm run check         # Biome + TypeScript checks pass
npm run test          # All tests pass (ISSUE-04 + ISSUE-05 tests)
npm run test:coverage # >90% coverage on new files
npm start             # Build frontend, generate types, start wrangler dev
```

### File inventory

| File | Purpose |
|------|---------|
| `src/worker/src/index.ts` | Hono app entry point — middleware + routes + catch-all |
| `src/worker/src/routes/version.ts` | `GET /api/version` (public) |
| `src/worker/src/routes/me.ts` | `GET /api/me` (auto-provision + admin seeding) |
| `src/worker/src/routes/__tests__/version.test.ts` | Version endpoint tests |
| `src/worker/src/routes/__tests__/me.test.ts` | Me endpoint + provisioning tests |

## Testing

### Unit / Integration Tests

1. **Version endpoint tests** (`version.test.ts`):
   - `GET /api/version` returns 200 without authentication.
   - Response body matches `{ data: { version: "1.0.0" } }` envelope.

2. **Me endpoint tests** (`me.test.ts`):
   - `GET /api/me` without auth returns 302 redirect (auth middleware redirects to login).
   - First authenticated request provisions user and returns 201 with full profile.
   - Second authenticated request returns existing user with 200 (no duplicate).
   - Three consecutive requests produce only one user in the database (no duplicates).
   - Email matching `SEED_ADMIN_EMAIL` creates user with `admin` role.
   - `SEED_ADMIN_EMAIL` comparison is case-insensitive.
   - Non-admin email creates user with `user` role.
   - Generated user ID is a valid ULID (26 uppercase alphanumeric characters).

### Manual Tests

After `npm start` completes, perform these manual verifications:

1. **PIN login form appears:**
   - Open `http://localhost:8787` in a browser.
   - You should see the `@adrianhall/cloudflare-auth` PIN login form at `/_auth/login` (you'll be redirected there automatically).
   - This confirms `developerAuthentication` is running and `run_worker_first: true` is working.

2. **Login and verify user provisioning:**
   - Enter any email (e.g., `test@example.com`) in the PIN login form.
   - Complete the PIN flow (the PIN is displayed on the terminal running `wrangler dev`).
   - After login, navigate to `http://localhost:8787/api/me` in the browser.
   - You should see a JSON response: `{ "data": { "id": "...", "email": "test@example.com", "name": "test", "role": "user", ... } }`.

3. **Admin seeding:**
   - Stop the server, set `SEED_ADMIN_EMAIL=youremail@example.com` in `.env`.
   - Run `npm start` again and log in with that exact email.
   - `GET /api/me` should return `"role": "admin"`.

4. **Public version endpoint:**
   - Open a new incognito/private browser window (no cookies).
   - Navigate to `http://localhost:8787/api/version`.
   - Should return `{ "data": { "version": "1.0.0" } }` without any login prompt.

5. **Static asset serving:**
   - After logging in, navigate to `http://localhost:8787/` (root).
   - You should see the placeholder HTML page (or the built frontend if available).
   - This confirms the `ASSETS.fetch()` catch-all is working.
