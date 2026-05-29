import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the Cloudflare Worker workspace.
 *
 * Uses the `sqlite` dialect because Cloudflare D1 is SQLite-compatible.
 * Migration files are output to `src/db/migrations/` (relative to this file),
 * which matches the `migrations_dir` field in `wrangler.jsonc.tpl`.
 *
 * @example
 * ```bash
 * # Generate a new migration after schema changes:
 * npx drizzle-kit generate
 *
 * # Apply migrations to local D1:
 * npm run db:migrate:local
 * ```
 */
export default defineConfig({
	out: "src/db/migrations",
	schema: "src/db/schema.ts",
	dialect: "sqlite",
});
