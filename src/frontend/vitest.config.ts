import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the frontend workspace.
 *
 * Uses the jsdom environment so React component tests have access to browser
 * globals (document, window, etc.) without requiring a real browser.
 */
export default defineConfig({
	test: {
		name: "frontend",
		environment: "jsdom",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		coverage: {
			include: ["src/**"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		},
	},
});
