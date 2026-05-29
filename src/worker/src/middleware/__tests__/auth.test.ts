import { JWT_HEADER, signDevJwt } from "@adrianhall/cloudflare-auth";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthVariables } from "../auth";
import { cfAccessMiddleware, devAuthMiddleware } from "../auth";

const MOCK_ENV = { CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com" };

/**
 * Creates a minimal Hono application with auth middleware pre-configured in the
 * correct order (devAuth → cfAccess) and two test routes.
 */
function createTestApp() {
	const app = new Hono<{ Bindings: typeof MOCK_ENV; Variables: AuthVariables }>();
	// devAuth MUST be registered before cfAccess
	app.use(devAuthMiddleware);
	app.use(cfAccessMiddleware);
	app.get("/api/version", (c) => c.json({ data: { version: "1.0.0" } }));
	app.get("/api/me", (c) => c.json({ data: { email: c.get("userEmail") } }));
	return app;
}

describe("Auth middleware", () => {
	it("returns 200 on public route without token", async () => {
		const app = createTestApp();
		const res = await app.fetch(new Request("http://localhost/api/version"), MOCK_ENV);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { version: string } };
		expect(body.data.version).toBe("1.0.0");
	});

	it("returns 302 redirect on protected route without token", async () => {
		const app = createTestApp();
		const res = await app.fetch(new Request("http://localhost/api/me"), MOCK_ENV);
		expect(res.status).toBe(302);
	});

	it("returns 200 with user context on protected route with valid token", async () => {
		const app = createTestApp();
		const token = await signDevJwt("alice@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/me", {
				headers: { [JWT_HEADER]: token },
			}),
			MOCK_ENV,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { email: string } };
		expect(body.data.email).toBe("alice@example.com");
	});
});
