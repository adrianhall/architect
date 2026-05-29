import { defineConfig } from "vitest/config";

/**
 * Root Vitest configuration that aggregates tests from all workspace packages.
 *
 * Uses the Vitest "projects" pattern so each workspace runs with its own
 * environment (e.g. jsdom for frontend, node for worker) while sharing a
 * single top-level run command.
 */
export default defineConfig({
	test: {
		projects: ["src/worker", "src/frontend"],
		coverage: {
			provider: "v8",
			include: ["src/worker/src/**", "src/frontend/src/**"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		},
	},
});
