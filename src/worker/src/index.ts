import { Hono } from "hono";
import { cfAccessMiddleware, devAuthMiddleware } from "./middleware/auth";
import { loggerMiddleware } from "./middleware/logger";
import type { WorkerEnv } from "./types";

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
const app = new Hono<WorkerEnv>();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(loggerMiddleware);
app.use(devAuthMiddleware);
app.use(cfAccessMiddleware);

// ── Routes ────────────────────────────────────────────────────────────────────
// API routes are added in ISSUE-05 and later.

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
