import { env } from "cloudflare:test";
import { JWT_HEADER, signDevJwt } from "@adrianhall/cloudflare-auth";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "../../db/schema";
import { adminGuard } from "../admin";
import type { AuthVariables } from "../auth";
import { cfAccessMiddleware, devAuthMiddleware } from "../auth";

/**
 * Creates a test Hono application with full auth middleware stack and a
 * single admin-protected route for testing the `adminGuard` middleware.
 */
function createAdminTestApp() {
	const app = new Hono<{
		Bindings: { DB: D1Database; CLOUDFLARE_TEAM_DOMAIN: string };
		Variables: AuthVariables;
	}>();
	app.use(devAuthMiddleware);
	app.use(cfAccessMiddleware);
	app.get("/api/admin/test", adminGuard, (c) => c.json({ data: { ok: true } }));
	return app;
}

describe("Admin guard middleware", () => {
	beforeEach(async () => {
		// Clean users table before each test to ensure isolation.
		const db = drizzle(env.DB);
		await db.delete(users);
	});

	it("returns 403 for a regular user", async () => {
		const db = drizzle(env.DB);
		const now = Date.now();
		await db.insert(users).values({
			id: "01JTEST000000000000000000",
			email: "user@example.com",
			name: "user",
			avatarUrl: null,
			role: "user",
			createdAt: now,
			updatedAt: now,
		});

		const app = createAdminTestApp();
		const token = await signDevJwt("user@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/admin/test", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);

		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("FORBIDDEN");
	});

	it("passes through for an admin user", async () => {
		const db = drizzle(env.DB);
		const now = Date.now();
		await db.insert(users).values({
			id: "01JTEST000000000000000001",
			email: "admin@example.com",
			name: "admin",
			avatarUrl: null,
			role: "admin",
			createdAt: now,
			updatedAt: now,
		});

		const app = createAdminTestApp();
		const token = await signDevJwt("admin@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/admin/test", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { ok: boolean } };
		expect(body.data.ok).toBe(true);
	});

	it("returns 403 when user is not in the database", async () => {
		const app = createAdminTestApp();
		const token = await signDevJwt("unknown@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/admin/test", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);

		expect(res.status).toBe(403);
	});
});
