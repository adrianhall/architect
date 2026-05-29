import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * Smoke tests for the worker entry point.
 *
 * These tests verify that:
 * 1. The module exports a default Hono app with a `fetch` method.
 * 2. The auth middleware is correctly wired — a request to a protected route
 *    without a token is redirected to the login form.
 *
 * They do not test individual route handlers or library internals — those have
 * their own test suites in `src/middleware/__tests__/`.
 */
describe("worker entry point", () => {
	it("exports a default app with a fetch handler", async () => {
		const mod = await import("../index.js");
		expect(mod.default).toBeDefined();
		expect(typeof mod.default.fetch).toBe("function");
	});

	it("redirects unauthenticated requests to protected routes to the login form", async () => {
		const mod = await import("../index.js");
		// /api/me is a protected path (matches /api/* policy with authenticate: true).
		// Without a JWT header or cookie, developerAuthentication redirects to /_auth/login.
		const res = await mod.default.fetch(new Request("http://localhost/api/me"), env);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toMatch(/\/_auth\/login/);
	});
});
