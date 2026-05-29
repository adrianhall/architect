import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "../../db/schema";
import app from "../../index";
import { JWT_HEADER, signDevJwt } from "../../test/helpers";

/**
 * Integration tests for `GET /api/me`.
 *
 * Exercises the full middleware chain (auth + provisioning logic) through the
 * main app entry point using the Miniflare in-memory D1 binding. Each test
 * starts with a clean `users` table (wiped in `beforeEach`) so tests are
 * fully isolated.
 *
 * The test env comes from `wrangler.test.jsonc`, which sets:
 * - `CLOUDFLARE_TEAM_DOMAIN = "test.cloudflareaccess.com"`
 * - `SEED_ADMIN_EMAIL = "admin@test.com"`
 */

describe("GET /api/me", () => {
	beforeEach(async () => {
		// Wipe the users table before each test to ensure isolation.
		const db = drizzle(env.DB);
		await db.delete(users);
	});

	it("returns 302 redirect without authentication", async () => {
		const res = await app.fetch(new Request("http://localhost/api/me"), env);
		expect(res.status).toBe(302);
	});

	it("auto-provisions user on first request and returns 201", async () => {
		const token = await signDevJwt("alice@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/me", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			data: {
				id: string;
				email: string;
				name: string;
				avatar_url: string | null;
				role: string;
				created_at: number;
				updated_at: number;
			};
		};
		expect(body.data.email).toBe("alice@example.com");
		expect(body.data.name).toBe("alice");
		expect(body.data.role).toBe("user");
		expect(body.data.avatar_url).toBeNull();
		expect(body.data.id).toBeDefined();
		expect(body.data.created_at).toBeDefined();
		expect(body.data.updated_at).toBeDefined();
	});

	it("returns existing user on second request with 200", async () => {
		const token = await signDevJwt("alice@example.com");

		// First request — provisions user.
		const res1 = await app.fetch(
			new Request("http://localhost/api/me", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);
		expect(res1.status).toBe(201);
		const body1 = (await res1.json()) as { data: { id: string; email: string } };

		// Second request — returns the existing user.
		const res2 = await app.fetch(
			new Request("http://localhost/api/me", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);
		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as { data: { id: string; email: string } };

		// Same user, same ID — no duplicate created.
		expect(body2.data.id).toBe(body1.data.id);
		expect(body2.data.email).toBe("alice@example.com");
	});

	it("does not create duplicate users", async () => {
		const token = await signDevJwt("alice@example.com");

		// Make three consecutive requests.
		for (let i = 0; i < 3; i++) {
			await app.fetch(
				new Request("http://localhost/api/me", {
					headers: { [JWT_HEADER]: token },
				}),
				env,
			);
		}

		// Verify only one record exists in the database.
		const db = drizzle(env.DB);
		const allUsers = await db.select().from(users);
		expect(allUsers).toHaveLength(1);
	});

	it("seeds admin role when email matches SEED_ADMIN_EMAIL", async () => {
		// env.SEED_ADMIN_EMAIL is "admin@test.com" (set in wrangler.test.jsonc).
		const token = await signDevJwt("admin@test.com");
		const res = await app.fetch(
			new Request("http://localhost/api/me", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { data: { email: string; role: string } };
		expect(body.data.email).toBe("admin@test.com");
		expect(body.data.role).toBe("admin");
	});

	it("SEED_ADMIN_EMAIL comparison is case-insensitive", async () => {
		// env.SEED_ADMIN_EMAIL is "admin@test.com" but we send mixed-case.
		const token = await signDevJwt("Admin@Test.com");
		const res = await app.fetch(
			new Request("http://localhost/api/me", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);

		const body = (await res.json()) as { data: { role: string } };
		expect(body.data.role).toBe("admin");
	});

	it("non-admin email gets user role", async () => {
		const token = await signDevJwt("regular@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/me", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);

		const body = (await res.json()) as { data: { role: string } };
		expect(body.data.role).toBe("user");
	});

	it("user ID is a valid ULID", async () => {
		const token = await signDevJwt("alice@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/me", {
				headers: { [JWT_HEADER]: token },
			}),
			env,
		);

		const body = (await res.json()) as { data: { id: string } };
		// ULID: exactly 26 uppercase alphanumeric characters (Crockford base32).
		expect(body.data.id).toMatch(/^[0-9A-Z]{26}$/);
	});
});
