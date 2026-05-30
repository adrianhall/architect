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
 * Coverage uses `@vitest/coverage-istanbul` (instrumentation-based) rather
 * than `@vitest/coverage-v8` (native V8 profiler). The Cloudflare Workers
 * runtime does not expose V8's coverage profiler API, so Istanbul is required
 * for worker coverage. Istanbul instruments source files with counters before
 * execution, which works in any JS runtime including Miniflare.
 *
 * Reporters:
 * - `text`         — per-file table printed to stdout.
 * - `text-summary` — one-line totals printed to stdout.
 * - `json`         — machine-readable data written to coverage/coverage.json.
 * - `lcov`         — standard lcov.info for CI and editor integrations.
 *
 * HTML output is intentionally omitted.
 */
export default defineConfig({
	test: {
		projects: ["src/worker", "src/frontend", "src/shared"],
		coverage: {
			provider: "istanbul",
			reporter: ["text", "text-summary", "json", "lcov"],
			include: ["src/worker/src/**", "src/frontend/src/**", "src/shared/src/**"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.test.tsx",
				"src/**/test/**",
				"**/*.sql",
				"**/*.json",
				// shadcn/ui components are generated third-party patterns.
				// Unused sub-components (CardTitle, DropdownMenuCheckboxItem, etc.)
				// would unfairly lower coverage metrics for our own code.
				"src/frontend/src/components/ui/**",
			],
		},
	},
});
