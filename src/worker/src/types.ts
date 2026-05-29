import type { AuthVariables } from "./middleware/auth";

/**
 * Worker environment bindings — all D1, KV, R2, and var bindings available
 * on `c.env` inside Hono handlers.
 *
 * Declared here rather than relying on the generated `worker-configuration.d.ts`,
 * which lives outside the TypeScript `include` path (`src/`) and is absent on
 * a clean checkout. Must stay in sync with `wrangler.jsonc.tpl` and
 * `src/test/env.d.ts`.
 */
export type WorkerBindings = {
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
 * Hono environment generic for the CF-Architect worker.
 *
 * Wire this into every `new Hono<WorkerEnv>()` call so that `c.env` and
 * `c.get()`/`c.set()` are fully typed throughout the application.
 *
 * @example
 * ```ts
 * import type { WorkerEnv } from "./types";
 * const router = new Hono<WorkerEnv>();
 * ```
 */
export type WorkerEnv = {
	Bindings: WorkerBindings;
	Variables: AuthVariables & { requestId: string };
};
