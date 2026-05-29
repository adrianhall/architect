import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the worker workspace.
 *
 * Uses the standard Node test environment for now. When `wrangler.jsonc` is
 * available after ISSUE-02, this will be migrated to
 * `@cloudflare/vitest-pool-workers` to run tests inside the Workers runtime.
 */
export default defineConfig({
	test: {
		name: "worker",
		include: ["src/**/*.test.ts"],
		coverage: {
			include: ["src/**"],
			exclude: ["src/**/*.test.ts"],
		},
	},
});
