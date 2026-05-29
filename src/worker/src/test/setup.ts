import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

/**
 * Global test setup for the worker project.
 *
 * Applies all pending D1 migrations to the Miniflare in-memory database
 * before any test file runs.  This ensures every test starts with a fully
 * migrated schema without needing to call `applyD1Migrations` in each file.
 *
 * The `TEST_MIGRATIONS` binding is injected by the vitest config via
 * `miniflare.bindings` using the array returned by `readD1Migrations`.
 * `D1MigrationEntry` (declared in `env.d.ts`) and `D1Migration` (from
 * `cloudflare:test`) are structurally identical — the cast is safe.
 */
beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS as D1Migration[]);
});
