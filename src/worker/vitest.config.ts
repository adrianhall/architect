import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the worker workspace.
 *
 * Uses `@cloudflare/vitest-pool-workers` so every test file runs inside the
 * Workers runtime (via Miniflare), giving tests access to:
 *
 * - `env.DB` — an in-memory D1 binding seeded by Miniflare.
 * - `cloudflare:workers` / `cloudflare:test` runtime APIs.
 *
 * D1 migrations are loaded at config time (Node.js) using
 * `readD1Migrations`, injected as a plain binding (`TEST_MIGRATIONS`), and
 * applied inside the Workers runtime by the setup file
 * (`src/test/setup.ts`) before any test runs.
 */
export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrationsPath = path.join(path.dirname(new URL(import.meta.url).pathname), "src/db/migrations");
			const migrations = await readD1Migrations(migrationsPath);
			return {
				wrangler: { configPath: "./wrangler.test.jsonc" },
				miniflare: {
					// Pass migrations as a plain binding so setup.ts can call
					// applyD1Migrations(env.DB, env.TEST_MIGRATIONS) in beforeAll.
					bindings: { TEST_MIGRATIONS: migrations },
				},
			};
		}),
	],
	test: {
		name: "worker",
		include: ["src/**/*.test.ts"],
		setupFiles: ["src/test/setup.ts"],
		coverage: {
			include: ["src/**"],
			exclude: ["src/**/*.test.ts", "src/test/**"],
		},
	},
});
