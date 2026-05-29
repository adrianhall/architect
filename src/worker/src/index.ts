import { Hono } from "hono";
import { type AuthVariables, cfAccessMiddleware, devAuthMiddleware } from "./middleware/auth";
import { loggerMiddleware } from "./middleware/logger";

/**
 * Worker environment bindings.
 *
 * Declared inline here rather than relying on the generated
 * `worker-configuration.d.ts` (which lives outside the TypeScript `include`
 * path and is absent on a clean checkout). Must stay in sync with
 * `wrangler.jsonc.tpl` and `src/test/env.d.ts`.
 */
type WorkerBindings = {
	/** D1 database binding. */
	DB: D1Database;
	/** Workers Assets binding — serves the built React SPA. */
	ASSETS: Fetcher;
	/** Cloudflare Access team domain (e.g. `myteam.cloudflareaccess.com`). */
	CLOUDFLARE_TEAM_DOMAIN: string;
	/** Email address seeded as the initial admin on first deploy. */
	SEED_ADMIN_EMAIL: string;
};

/**
 * CF-Architect Hono application.
 *
 * Middleware stack (order is critical — see cloudflare-auth skill):
 * 1. `loggerMiddleware` — wraps the full request lifecycle so timing and the
 *    final status code are captured after all downstream middleware runs.
 * 2. `devAuthMiddleware` — in local dev, drives the PIN login form and issues
 *    the `CF_Authorization` cookie; in production, is a no-op.
 * 3. `cfAccessMiddleware` — validates the CF Access JWT (HMAC in dev, RS256 in
 *    production) and sets `userEmail` / `userSub` on the Hono context.
 *
 * Route handlers are added in subsequent issues (ISSUE-05 onwards). The
 * catch-all at the bottom serves the built React SPA via the Workers Assets
 * binding for all paths not matched by an API route.
 */
const app = new Hono<{
	Bindings: WorkerBindings;
	Variables: AuthVariables & { requestId: string };
}>();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(loggerMiddleware);
app.use(devAuthMiddleware);
app.use(cfAccessMiddleware);

// ── Routes ────────────────────────────────────────────────────────────────────
// API routes are added in ISSUE-05 and later. Placeholder kept here so the
// file compiles cleanly before routes exist.

// ── Asset catch-all ───────────────────────────────────────────────────────────

/**
 * Catch-all route — forwards every unmatched request to the Workers Assets
 * binding so the built React SPA is served for all non-API paths.
 *
 * Must use `c.env.ASSETS.fetch(c.req.raw)` — do NOT use `serveStatic` from
 * `hono/cloudflare-workers` (that helper targets the legacy Workers Sites KV
 * namespace and will return 404 with the `assets.binding` wrangler config).
 */
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
