import { defineConfig } from "vitest/config";

/**
 * Root Vitest configuration that aggregates tests from all workspace packages.
 *
 * Three projects, each with its own environment:
 *
 * - `src/worker` — Workers runtime via `@cloudflare/vitest-pool-workers`
 *   (Miniflare). Runs DB and integration tests with real D1 bindings.
 * - `src/frontend` — jsdom environment for React component tests.
 * - `src/shared` — standard Node environment for pure TypeScript type tests.
 *
 * Coverage is collected only for the non-Workers-runtime projects (frontend
 * and, once populated, shared).  `@vitest/coverage-v8` cannot instrument code
 * running inside Miniflare because `node:inspector/promises` is not available
 * in the Workers runtime — this is a documented Cloudflare limitation:
 * https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/
 *
 * Worker code correctness is verified through integration tests against a real
 * Miniflare D1 instance (see `src/worker/vitest.config.ts`).
 */
export default defineConfig({
	test: {
		projects: ["src/worker", "src/frontend", "src/shared"],
		coverage: {
			provider: "v8",
			// Exclude worker source — v8 cannot instrument code in the Workers runtime.
			include: ["src/frontend/src/**"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/test/**", "**/*.sql", "**/*.json"],
		},
	},
});
