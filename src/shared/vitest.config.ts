import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the shared workspace.
 *
 * The `@architect/shared` package contains only TypeScript interfaces, type
 * aliases, and barrel re-exports — no Workers runtime APIs or D1 bindings are
 * used. Tests run in the standard Node environment which is faster and avoids
 * the Workers runtime overhead needed only by the worker project.
 *
 * Coverage is intentionally omitted here: pure type declaration files produce
 * no JavaScript statements for v8 to count, so coverage for this package is
 * tracked at the root level with those files excluded from the report.
 */
export default defineConfig({
	test: {
		name: "shared",
		include: ["src/**/*.test.ts"],
	},
});
