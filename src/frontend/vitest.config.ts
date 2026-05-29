import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the frontend workspace.
 *
 * Uses the jsdom environment so React component tests have access to browser
 * globals (document, window, etc.) without requiring a real browser.
 *
 * The `@/` resolve alias mirrors the Vite and TypeScript path aliases so that
 * component imports like `@/lib/utils` resolve correctly in tests.
 *
 * `setupFiles` registers jest-dom matchers globally before each test suite,
 * enabling assertions like `toBeInTheDocument()` and `toHaveTextContent()`.
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	test: {
		name: "frontend",
		environment: "jsdom",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		setupFiles: ["./src/test/setup.ts"],
		coverage: {
			include: ["src/**"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		},
	},
});
