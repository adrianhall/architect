# Auth middleware + structured logging + test helpers

## Summary

Install the auth library and Hono, then build the middleware layer (auth policies, structured JSON logging, admin guard), API response helpers, error taxonomy, and test utilities. After this issue, every subsequent route can be written with authentication, logging, consistent error responses, and easy-to-write tests.

## Relevant Skills

- `cloudflare-auth`
- `cloudflare`
- `workers-best-practices`
- `api-design-principles`
- `typescript-advanced-types`

## Requirements Coverage

- [F1-US1](../REQUIREMENTS.md) — Structured JSON logs with request metadata on every request.
- [F2-US1](../REQUIREMENTS.md) — All protected routes require Cloudflare Access authentication; unauthenticated requests are rejected.

## Dependencies

- **ISSUE-02** — Terraform infrastructure and wrangler.jsonc.tpl must exist so the worker package can install dependencies and `generate-types` can produce `worker-configuration.d.ts`.

## Acceptance Criteria

- [ ] `@adrianhall/cloudflare-auth` (from `github:adrianhall/cloudflare-auth#1.0.1`) and `hono` are installed in `src/worker`.
- [ ] `src/worker/src/middleware/auth.ts` defines a `PathPolicy[]` and registers `developerAuthentication` then `cloudflareAccess` in the correct order.
- [ ] `/api/version` is public (no auth required); `/api/*` is protected.
- [ ] `/_auth/*` is NOT in the policies array.
- [ ] `src/worker/src/middleware/logger.ts` logs structured JSON with method, path, status, duration_ms, user_email, and request_id.
- [ ] `src/worker/src/middleware/admin.ts` checks the user's role from D1 and returns 403 if not admin.
- [ ] `src/worker/test/helpers.ts` re-exports `signDevJwt` and `JWT_HEADER`, and provides `createAuthenticatedRequest` and test data factory functions.
- [ ] `src/worker/src/lib/response.ts` provides `success()` and `error()` envelope helpers.
- [ ] `src/worker/src/lib/errors.ts` defines error code constants.
- [ ] Auth policy tests pass: public route → 200, protected route without token → 302, valid token → 200 with user context.
- [ ] Logger output format test passes.
- [ ] Admin guard test passes: regular user → 403, admin → passes through.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.

## Technical Approach

### Step 1: Install dependencies in `src/worker`

```bash
cd src/worker
npm install github:adrianhall/cloudflare-auth#1.0.1 hono
npm install -D ulid
```

Verify `package.json` has both `@adrianhall/cloudflare-auth` and `hono` in `dependencies`. The `ulid` package is a dev dependency needed by later issues but install it now since test factories will use it.

### Step 2: Create `src/worker/src/lib/errors.ts`

Define error code constants as a const object. These are string codes used in API error responses:

```ts
export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

### Step 3: Create `src/worker/src/lib/response.ts`

Create typed response envelope helpers that return plain objects (the Hono handler will call `c.json()`):

```ts
import type { ErrorCode } from "./errors";

/**
 * Wrap a successful result in the standard API envelope.
 */
export function success<T>(data: T) {
  return { data };
}

/**
 * Build a standard API error body.
 */
export function error(
  code: ErrorCode,
  message: string,
  details?: unknown
) {
  return {
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
}
```

The caller (route handler) is responsible for setting the HTTP status code via `c.json(error(...), 404)`. This keeps the helpers simple and framework-agnostic.

### Step 4: Create `src/worker/src/middleware/auth.ts`

This file defines the auth policies and exports two pre-configured middleware instances. **Critical rules from the cloudflare-auth skill:**

1. `developerAuthentication` MUST be registered BEFORE `cloudflareAccess`.
2. Both MUST share the SAME `PathPolicy[]` reference.
3. `/_auth/*` MUST NOT appear in the policies array.
4. Middleware MUST be registered directly — no arrow function wrappers.

```ts
import {
  developerAuthentication,
  cloudflareAccess,
  type PathPolicy,
  type AuthVariables,
} from "@adrianhall/cloudflare-auth";

/**
 * Path-based auth policies for the application.
 *
 * Rules:
 * - /api/version is public (health check / version endpoint)
 * - /api/* is protected (requires valid Cloudflare Access JWT)
 * - /_auth/* is NOT listed here — developerAuthentication owns those paths internally
 *
 * Policies are evaluated first-match-wins.
 */
export const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true },
];

/**
 * Developer authentication middleware.
 * In production: no-op (CF Access JWT header already present).
 * In local dev: drives PIN-based login form, sets CF_Authorization cookie.
 *
 * MUST be registered BEFORE cloudflareAccessMiddleware.
 */
export const devAuthMiddleware = developerAuthentication({
  policies: authPolicies,
});

/**
 * Cloudflare Access JWT validation middleware.
 * Validates JWTs via HMAC (dev tokens) or JWKS (production CF Access tokens).
 *
 * MUST be registered AFTER devAuthMiddleware.
 */
export const cfAccessMiddleware = cloudflareAccess({
  policies: authPolicies,
});

export type { AuthVariables };
```

### Step 5: Create `src/worker/src/middleware/logger.ts`

Structured JSON logging middleware. Each request gets a unique `request_id` and timing. Uses `console.log` with `JSON.stringify` for Cloudflare Logs compatibility:

```ts
import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "./auth";

interface LogEntry {
  timestamp: string;
  request_id: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  user_email?: string;
}

/**
 * Structured JSON logging middleware.
 *
 * Logs one JSON line per request with method, path, status, duration,
 * authenticated user email (if present), and a unique request_id.
 *
 * Uses console.log + JSON.stringify for Cloudflare Logs compatibility.
 * Must be registered BEFORE auth middleware so it wraps the full request lifecycle,
 * but user_email will only be available if auth middleware has run.
 */
export const loggerMiddleware = createMiddleware<{
  Variables: AuthVariables & { requestId: string };
}>(async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);

  const start = Date.now();

  await next();

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    request_id: requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: Date.now() - start,
  };

  // user_email is only available on authenticated routes after auth middleware runs
  try {
    const email = c.get("userEmail");
    if (email) {
      entry.user_email = email;
    }
  } catch {
    // userEmail not set — unauthenticated or public route
  }

  console.log(JSON.stringify(entry));
});
```

**Important:** The logger uses `createMiddleware` from `hono/factory` to properly type the context variables. The `requestId` variable is set on context so downstream handlers can include it in error responses if needed.

### Step 6: Create `src/worker/src/middleware/admin.ts`

Admin role guard middleware. This MUST run after auth middleware so that `userEmail` is available on context. It queries the users table in D1 to check the role:

```ts
import { createMiddleware } from "hono/factory";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { AuthVariables } from "./auth";
import { error } from "../lib/response";
import { ErrorCode } from "../lib/errors";

/**
 * Admin role guard middleware.
 *
 * Checks the authenticated user's role in the database.
 * Returns 403 Forbidden if the user is not an admin.
 *
 * MUST be registered AFTER auth middleware (requires userEmail on context).
 */
export const adminGuard = createMiddleware<{
  Bindings: { DB: D1Database };
  Variables: AuthVariables;
}>(async (c, next) => {
  const email = c.get("userEmail");

  if (!email) {
    return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
  }

  const db = drizzle(c.env.DB);
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || user.role !== "admin") {
    return c.json(error(ErrorCode.FORBIDDEN, "Admin access required"), 403);
  }

  await next();
});
```

**Note:** This middleware imports the `users` table from `../db/schema` which was created in ISSUE-03. The Drizzle schema must be available.

### Step 7: Create `src/worker/test/helpers.ts`

Test utilities that wrap `@adrianhall/cloudflare-auth` exports and provide factories:

```ts
import {
  signDevJwt,
  JWT_HEADER,
} from "@adrianhall/cloudflare-auth";

// Re-export for convenience in test files
export { signDevJwt, JWT_HEADER };

/**
 * Create an authenticated Request object with a valid dev JWT.
 *
 * @param url - Full URL string (e.g., "http://localhost/api/me")
 * @param email - Email address for the authenticated user
 * @param init - Additional RequestInit options (method, body, headers, etc.)
 * @returns A Request with the JWT_HEADER set
 */
export async function createAuthenticatedRequest(
  url: string,
  email: string,
  init?: RequestInit
): Promise<Request> {
  const token = await signDevJwt(email);
  const headers = new Headers(init?.headers);
  headers.set(JWT_HEADER, token);

  return new Request(url, {
    ...init,
    headers,
  });
}

/**
 * Create a mock Cloudflare env object for tests.
 *
 * @param overrides - Partial env to merge (e.g., custom DB mock)
 */
export function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com",
    SEED_ADMIN_EMAIL: "admin@test.com",
    ...overrides,
  };
}

/**
 * Factory: generate a user record for testing.
 */
export function createTestUser(overrides: Partial<{
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  created_at: number;
  updated_at: number;
}> = {}) {
  const now = Date.now();
  return {
    id: overrides.id ?? "01JTEST000000000000000000",
    email: overrides.email ?? "test@example.com",
    name: overrides.name ?? "test",
    avatar_url: overrides.avatar_url ?? null,
    role: overrides.role ?? "user",
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
  };
}

/**
 * Factory: generate a diagram record for testing.
 */
export function createTestDiagram(overrides: Partial<{
  id: string;
  user_id: string;
  title: string;
  graph_data: string;
  version: number;
  created_at: number;
  updated_at: number;
}> = {}) {
  const now = Date.now();
  return {
    id: overrides.id ?? "01JTEST000000000000000001",
    user_id: overrides.user_id ?? "01JTEST000000000000000000",
    title: overrides.title ?? "Test Diagram",
    graph_data: overrides.graph_data ?? JSON.stringify({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
    version: overrides.version ?? 1,
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
  };
}
```

### Step 8: Write tests

Tests go in `src/worker/src/middleware/__tests__/` (or can be colocated as `.test.ts` files). Use `@cloudflare/vitest-pool-workers` for the test environment as configured in ISSUE-01's vitest setup.

#### `src/worker/src/middleware/__tests__/auth.test.ts`

Test the auth policy behavior using a minimal Hono app:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth";
import type { AuthVariables } from "../auth";
import { devAuthMiddleware, cfAccessMiddleware } from "../auth";

const MOCK_ENV = { CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com" };

function createTestApp() {
  const app = new Hono<{ Bindings: typeof MOCK_ENV; Variables: AuthVariables }>();
  // Register in correct order: devAuth FIRST, then cfAccess
  app.use(devAuthMiddleware);
  app.use(cfAccessMiddleware);
  app.get("/api/version", (c) => c.json({ data: { version: "1.0.0" } }));
  app.get("/api/me", (c) => c.json({ data: { email: c.get("userEmail") } }));
  return app;
}

describe("Auth middleware", () => {
  it("returns 200 on public route without token", async () => {
    const app = createTestApp();
    const res = await app.fetch(
      new Request("http://localhost/api/version"),
      MOCK_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.version).toBe("1.0.0");
  });

  it("returns 302 redirect on protected route without token", async () => {
    const app = createTestApp();
    const res = await app.fetch(
      new Request("http://localhost/api/me"),
      MOCK_ENV
    );
    expect(res.status).toBe(302);
  });

  it("returns 200 with user context on protected route with valid token", async () => {
    const app = createTestApp();
    const token = await signDevJwt("alice@example.com");
    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      MOCK_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.email).toBe("alice@example.com");
  });

  it("returns 302 for expired token on protected route", async () => {
    const app = createTestApp();
    const token = await signDevJwt("alice@example.com", { lifetime: 0 });
    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token },
      }),
      MOCK_ENV
    );
    expect(res.status).toBe(302);
  });
});
```

#### `src/worker/src/middleware/__tests__/logger.test.ts`

Test that the logger emits valid JSON with the required fields:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { loggerMiddleware } from "../logger";

describe("Logger middleware", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs structured JSON with required fields", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const app = new Hono();
    app.use(loggerMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));

    await app.fetch(new Request("http://localhost/test"));

    expect(consoleSpy).toHaveBeenCalledOnce();

    const logLine = consoleSpy.mock.calls[0][0];
    const entry = JSON.parse(logLine);

    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("request_id");
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/test");
    expect(entry.status).toBe(200);
    expect(typeof entry.duration_ms).toBe("number");
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("includes user_email when authenticated user is on context", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const app = new Hono<{ Variables: { userEmail: string } }>();
    app.use(loggerMiddleware);
    // Simulate auth middleware setting userEmail
    app.use(async (c, next) => {
      c.set("userEmail", "bob@example.com");
      await next();
    });
    app.get("/test", (c) => c.json({ ok: true }));

    await app.fetch(new Request("http://localhost/test"));

    const entry = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(entry.user_email).toBe("bob@example.com");
  });

  it("sets requestId on context", async () => {
    let capturedId: string | undefined;

    const app = new Hono<{ Variables: { requestId: string } }>();
    app.use(loggerMiddleware);
    app.get("/test", (c) => {
      capturedId = c.get("requestId");
      return c.json({ ok: true });
    });

    await app.fetch(new Request("http://localhost/test"));

    expect(capturedId).toBeDefined();
    // UUID v4 format
    expect(capturedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
```

#### `src/worker/src/middleware/__tests__/admin.test.ts`

Test the admin guard. This test needs a D1 database with the users table, so it uses `@cloudflare/vitest-pool-workers` env bindings:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth";
import type { AuthVariables } from "../auth";
import { devAuthMiddleware, cfAccessMiddleware } from "../auth";
import { adminGuard } from "../admin";
import { users } from "../../db/schema";

function createAdminTestApp() {
  const app = new Hono<{
    Bindings: { DB: D1Database; CLOUDFLARE_TEAM_DOMAIN: string };
    Variables: AuthVariables;
  }>();
  app.use(devAuthMiddleware);
  app.use(cfAccessMiddleware);
  app.get("/api/admin/test", adminGuard, (c) =>
    c.json({ data: { ok: true } })
  );
  return app;
}

describe("Admin guard middleware", () => {
  beforeEach(async () => {
    // Clean users table before each test
    const db = drizzle(env.DB);
    await db.delete(users);
  });

  it("returns 403 for a regular user", async () => {
    const db = drizzle(env.DB);
    const now = Date.now();
    await db.insert(users).values({
      id: "01JTEST000000000000000000",
      email: "user@example.com",
      name: "user",
      avatar_url: null,
      role: "user",
      created_at: now,
      updated_at: now,
    });

    const app = createAdminTestApp();
    const token = await signDevJwt("user@example.com");
    const res = await app.fetch(
      new Request("http://localhost/api/admin/test", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("passes through for an admin user", async () => {
    const db = drizzle(env.DB);
    const now = Date.now();
    await db.insert(users).values({
      id: "01JTEST000000000000000001",
      email: "admin@example.com",
      name: "admin",
      avatar_url: null,
      role: "admin",
      created_at: now,
      updated_at: now,
    });

    const app = createAdminTestApp();
    const token = await signDevJwt("admin@example.com");
    const res = await app.fetch(
      new Request("http://localhost/api/admin/test", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
  });

  it("returns 403 when user is not in the database", async () => {
    const app = createAdminTestApp();
    const token = await signDevJwt("unknown@example.com");
    const res = await app.fetch(
      new Request("http://localhost/api/admin/test", {
        headers: { [JWT_HEADER]: token },
      }),
      env
    );

    expect(res.status).toBe(403);
  });
});
```

#### `src/worker/src/lib/__tests__/response.test.ts`

Test the response envelope helpers:

```ts
import { describe, it, expect } from "vitest";
import { success, error } from "../response";
import { ErrorCode } from "../errors";

describe("Response helpers", () => {
  it("success() wraps data in { data } envelope", () => {
    const result = success({ id: "123", name: "test" });
    expect(result).toEqual({ data: { id: "123", name: "test" } });
  });

  it("error() builds standard error body without details", () => {
    const result = error(ErrorCode.NOT_FOUND, "Diagram not found");
    expect(result).toEqual({
      error: { code: "NOT_FOUND", message: "Diagram not found" },
    });
  });

  it("error() includes details when provided", () => {
    const result = error(ErrorCode.VALIDATION_ERROR, "Invalid input", {
      field: "title",
    });
    expect(result).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { field: "title" },
      },
    });
  });

  it("error() excludes details key when undefined", () => {
    const result = error(ErrorCode.INTERNAL_ERROR, "Something broke");
    expect(Object.keys(result.error)).toEqual(["code", "message"]);
  });
});
```

### Step 9: Verify builds and checks

Run:

```bash
npm run build        # Should build all artifacts
npm run check        # Biome + TypeScript checks pass
npm run test         # All new tests pass
npm run test:coverage # >90% coverage on new files
```

### File inventory

| File | Purpose |
|------|---------|
| `src/worker/src/lib/errors.ts` | Error code constants |
| `src/worker/src/lib/response.ts` | API envelope helpers (success/error) |
| `src/worker/src/middleware/auth.ts` | Auth policies + middleware exports |
| `src/worker/src/middleware/logger.ts` | Structured JSON logging |
| `src/worker/src/middleware/admin.ts` | Admin role guard |
| `src/worker/test/helpers.ts` | Test utilities + factories |
| `src/worker/src/middleware/__tests__/auth.test.ts` | Auth policy tests |
| `src/worker/src/middleware/__tests__/logger.test.ts` | Logger output tests |
| `src/worker/src/middleware/__tests__/admin.test.ts` | Admin guard tests |
| `src/worker/src/lib/__tests__/response.test.ts` | Response helper tests |

## Testing

### Unit Tests

1. **Auth policy tests** (`auth.test.ts`):
   - Public route (`/api/version`) returns 200 without any token.
   - Protected route (`/api/me`) returns 302 redirect without a token.
   - Protected route with a valid dev JWT returns 200 and user context variables.
   - Expired token on protected route returns 302 redirect.

2. **Logger tests** (`logger.test.ts`):
   - Emits exactly one `console.log` call per request containing valid JSON.
   - JSON includes all required fields: `timestamp`, `request_id`, `method`, `path`, `status`, `duration_ms`.
   - Includes `user_email` when auth context is present.
   - Sets `requestId` on Hono context for downstream use.

3. **Admin guard tests** (`admin.test.ts`):
   - Regular user (`role: "user"`) receives 403 with `FORBIDDEN` error code.
   - Admin user (`role: "admin"`) passes through to the handler.
   - Unknown user (not in DB) receives 403.

4. **Response helper tests** (`response.test.ts`):
   - `success()` wraps data in `{ data }` envelope.
   - `error()` builds error body with code and message.
   - `error()` includes details when provided.
   - `error()` excludes details key when undefined.

### Manual Tests

1. **No manual tests for this issue** — all middleware is exercised via automated Vitest tests using `@cloudflare/vitest-pool-workers`. Manual testing of the full auth flow (PIN login form) is deferred to ISSUE-05 when the Hono app entry point exists.
