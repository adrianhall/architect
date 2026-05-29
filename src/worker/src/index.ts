import { Hono } from "hono";
import { cfAccessMiddleware, devAuthMiddleware } from "./middleware/auth";
import { loggerMiddleware } from "./middleware/logger";
import { me } from "./routes/me";
import { version } from "./routes/version";
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
 * Route mounting:
 * - `GET /api/version` — public; returns the application version.
 * - `GET /api/me`      — protected; returns the current user's profile,
 *   auto-provisioning a DB record on first request.
 * - `GET *`            — catch-all; proxies to the Workers Assets binding
 *   so the built React SPA is served for all non-API paths.
 *
 * Placeholder routes for future issues:
 * - `/api/catalog`  (ISSUE-08)
 * - `/api/diagrams` (ISSUE-06)
 * - `/api/admin`    (ISSUE-07)
 */
const app = new Hono<WorkerEnv>();

// ── Middleware (order matters!) ───────────────────────────────────────────────
// 1. Logger wraps entire request lifecycle for accurate timing.
// 2. developerAuthentication MUST come before cloudflareAccess.
// 3. cloudflareAccess validates JWT and sets userEmail / userSub on context.

app.use(loggerMiddleware);
app.use(devAuthMiddleware);
app.use(cfAccessMiddleware);

// ── Routes ────────────────────────────────────────────────────────────────────

app.route("/api/version", version);
app.route("/api/me", me);

// Placeholder routes for future issues:
// app.route("/api/catalog", catalog);   // ISSUE-08
// app.route("/api/diagrams", diagrams); // ISSUE-06
// app.route("/api/admin", admin);       // ISSUE-07

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
