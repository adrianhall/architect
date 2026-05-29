import { describe, expect, it } from "vitest";
import app from "../../index";

/**
 * Integration tests for `GET /api/version`.
 *
 * These tests exercise the full middleware chain (including auth policy
 * bypass) through the main app entry point. A separate test env object with
 * only the required vars is used to verify that no auth is needed.
 */

/** Minimal env with the bindings required by the auth middleware. */
const TEST_ENV = {
	CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com",
	SEED_ADMIN_EMAIL: "admin@test.com",
};

describe("GET /api/version", () => {
	it("returns 200 without authentication", async () => {
		const res = await app.fetch(new Request("http://localhost/api/version"), TEST_ENV);
		expect(res.status).toBe(200);
	});

	it("returns version in success envelope", async () => {
		const res = await app.fetch(new Request("http://localhost/api/version"), TEST_ENV);
		const body = await res.json();
		expect(body).toEqual({ data: { version: "1.0.0" } });
	});
});
