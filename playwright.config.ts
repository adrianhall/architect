import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for CF-Architect E2E tests.
 *
 * Targets Chromium only to minimise install size and test time. The web server
 * command starts the full stack (builds frontend, runs wrangler dev) before
 * tests run; the `url` property polls `/api/version` to know when the server
 * is ready.
 *
 * In local development, `reuseExistingServer: true` reuses a running `npm
 * start` instance for faster iteration. In CI (`CI=1`), a fresh server is
 * always started.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["html", { open: "never" }]],
	use: {
		baseURL: "http://localhost:8787",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
	webServer: {
		command: "npm start",
		url: "http://localhost:8787/api/version",
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
