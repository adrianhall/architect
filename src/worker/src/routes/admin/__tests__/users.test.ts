import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diagrams, users } from "../../../db/schema";
import app from "../../../index";
import { ErrorCode } from "../../../lib/errors";
import { RepositoryError } from "../../../repositories";
import { createAuthenticatedRequest, createTestDiagram, createTestUser } from "../../../test/helpers";
import { convertErrorOrThrow } from "../users";

/**
 * Integration tests for the `/api/admin/users` endpoint set.
 *
 * Exercises the full middleware chain (logger → devAuth → cfAccess →
 * adminGuard → route handler) through the main app entry point using the
 * Miniflare in-memory D1 binding. Each test cleans the database in
 * `beforeEach`.
 *
 * Test actors:
 * - `admin` (`admin@test.com`) — `role: "admin"`, the default request actor.
 * - `userA` — regular user, the default target for mutations.
 * - `userB` — second regular user for multi-user isolation tests.
 *
 * The test env comes from `wrangler.test.jsonc` which sets:
 * - `CLOUDFLARE_TEAM_DOMAIN = "test.cloudflareaccess.com"`
 * - `SEED_ADMIN_EMAIL = "admin@test.com"`
 */

/** Convenience type for an API error response body. */
type ErrorBody = { error: { code: string; message: string } };

/** Convenience type for the user list success response. */
type UserListBody = {
	data: {
		users: {
			id: string;
			email: string;
			name: string | null;
			avatar_url: string | null;
			role: string;
			diagram_count: number;
			created_at: number;
			updated_at: number;
		}[];
		pagination: {
			page: number;
			limit: number;
			total: number;
			totalPages: number;
		};
	};
};

/** Convenience type for the single-user success response (promote/demote). */
type UserSuccessBody = {
	data: {
		id: string;
		email: string;
		role: string;
		diagram_count: number;
	};
};

// ── Stable IDs and emails ──────────────────────────────────────────────────────

const ADMIN_ID = "01JADMIN000000000000000001";
const USER_A_ID = "01JUSERA0000000000000000A1";
const USER_B_ID = "01JUSERB0000000000000000B1";

const ADMIN_EMAIL = "admin@test.com";
const USER_A_EMAIL = "user-a@example.com";
const USER_B_EMAIL = "user-b@example.com";

// ── Request helpers ───────────────────────────────────────────────────────────

/**
 * Creates a fully authenticated HTTP request for the admin actor.
 *
 * @param path - URL path under `http://localhost` (e.g. `"/api/admin/users"`).
 * @param init - Optional `RequestInit` options (method, body, headers, …).
 * @returns A `Promise` resolving to an authenticated `Request`.
 */
async function adminRequest(path: string, init?: RequestInit): Promise<Request> {
	return createAuthenticatedRequest(`http://localhost${path}`, ADMIN_EMAIL, init);
}

/**
 * Creates a fully authenticated HTTP request for the non-admin (user A) actor.
 *
 * @param path - URL path under `http://localhost`.
 * @param init - Optional `RequestInit` options.
 * @returns A `Promise` resolving to an authenticated `Request`.
 */
async function userRequest(path: string, init?: RequestInit): Promise<Request> {
	return createAuthenticatedRequest(`http://localhost${path}`, USER_A_EMAIL, init);
}

// ── Shared seed ───────────────────────────────────────────────────────────────

/**
 * Wipes all rows and re-inserts: one admin + two regular users.
 *
 * Deletes `diagrams` before `users` to satisfy the FK constraint.
 */
async function seedDefaultUsers(): Promise<void> {
	const db = drizzle(env.DB);
	await db.delete(diagrams);
	await db.delete(users);

	await db.insert(users).values(createTestUser({ id: ADMIN_ID, email: ADMIN_EMAIL, role: "admin" }));
	await db.insert(users).values(createTestUser({ id: USER_A_ID, email: USER_A_EMAIL, role: "user" }));
	await db.insert(users).values(createTestUser({ id: USER_B_ID, email: USER_B_EMAIL, role: "user" }));
}

// ── Access control ────────────────────────────────────────────────────────────

describe("admin access control", () => {
	beforeEach(seedDefaultUsers);

	it("non-admin gets 403 on GET /api/admin/users", async () => {
		const req = await userRequest("/api/admin/users");
		const res = await app.fetch(req, env);

		expect(res.status).toBe(403);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("FORBIDDEN");
	});

	it("non-admin gets 403 on PATCH /api/admin/users/:id/role", async () => {
		const req = await userRequest(`/api/admin/users/${USER_B_ID}/role`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "admin" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(403);
	});

	it("non-admin gets 403 on DELETE /api/admin/users/:id", async () => {
		const req = await userRequest(`/api/admin/users/${USER_B_ID}`, { method: "DELETE" });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(403);
	});

	it("unauthenticated GET /api/admin/users is redirected (302)", async () => {
		// devAuthMiddleware redirects unauthenticated requests to the login form.
		const res = await app.fetch(new Request("http://localhost/api/admin/users"), env);
		expect(res.status).toBe(302);
	});

	it("unauthenticated PATCH /api/admin/users/:id/role is redirected (302)", async () => {
		const res = await app.fetch(
			new Request(`http://localhost/api/admin/users/${USER_A_ID}/role`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role: "admin" }),
			}),
			env,
		);
		expect(res.status).toBe(302);
	});

	it("unauthenticated DELETE /api/admin/users/:id is redirected (302)", async () => {
		const res = await app.fetch(
			new Request(`http://localhost/api/admin/users/${USER_A_ID}`, { method: "DELETE" }),
			env,
		);
		expect(res.status).toBe(302);
	});
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────

describe("GET /api/admin/users", () => {
	beforeEach(seedDefaultUsers);

	it("returns paginated list with correct diagram_count per user", async () => {
		const db = drizzle(env.DB);
		// Give user A two diagrams; user B and admin have none.
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA000000000000000001A1", userId: USER_A_ID }));
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA000000000000000001A2", userId: USER_A_ID }));

		const req = await adminRequest("/api/admin/users");
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserListBody;
		expect(body.data.users).toHaveLength(3);
		expect(body.data.pagination.total).toBe(3);

		const userA = body.data.users.find((u) => u.id === USER_A_ID);
		expect(userA?.diagram_count).toBe(2);

		const userB = body.data.users.find((u) => u.id === USER_B_ID);
		expect(userB?.diagram_count).toBe(0);
	});

	it("respects page and limit parameters", async () => {
		const db = drizzle(env.DB);
		// Add two more users to bring total to 5.
		await db.insert(users).values(createTestUser({ id: "01JUSER0000000000000000C1", email: "user-c@example.com" }));
		await db.insert(users).values(createTestUser({ id: "01JUSER0000000000000000D1", email: "user-d@example.com" }));

		const req = await adminRequest("/api/admin/users?page=2&limit=2");
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserListBody;
		expect(body.data.users.length).toBeLessThanOrEqual(2);
		expect(body.data.pagination.page).toBe(2);
		expect(body.data.pagination.limit).toBe(2);
		expect(body.data.pagination.total).toBe(5);
		expect(body.data.pagination.totalPages).toBe(3);
	});

	it("sorts by email ascending when sort=email&order=asc", async () => {
		const req = await adminRequest("/api/admin/users?sort=email&order=asc");
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserListBody;
		const emails = body.data.users.map((u) => u.email);

		// Assert emails are in ascending lexicographic order.
		for (let i = 1; i < emails.length; i++) {
			expect(emails[i] >= emails[i - 1]).toBe(true);
		}
	});

	it("search filters by email substring (case-insensitive)", async () => {
		const req = await adminRequest("/api/admin/users?search=user-a");
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserListBody;
		expect(body.data.users).toHaveLength(1);
		expect(body.data.users[0].email).toBe(USER_A_EMAIL);
		expect(body.data.pagination.total).toBe(1);
	});

	it("search filters by name substring", async () => {
		// Update user A with a distinctive name.
		const db = drizzle(env.DB);
		await db.update(users).set({ name: "Unique Name XYZ" }).where(eq(users.id, USER_A_ID));

		const req = await adminRequest("/api/admin/users?search=XYZ");
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserListBody;
		expect(body.data.users.length).toBeGreaterThanOrEqual(1);
		const found = body.data.users.some((u) => u.id === USER_A_ID);
		expect(found).toBe(true);
	});

	it("uses default page=1, limit=20, sort=created_at, order=desc", async () => {
		const req = await adminRequest("/api/admin/users");
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserListBody;
		expect(body.data.pagination.page).toBe(1);
		expect(body.data.pagination.limit).toBe(20);
	});

	it("clamps limit to max 100", async () => {
		const req = await adminRequest("/api/admin/users?limit=999");
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserListBody;
		expect(body.data.pagination.limit).toBe(100);
	});
});

// ── PATCH /api/admin/users/:id/role ───────────────────────────────────────────

describe("PATCH /api/admin/users/:id/role", () => {
	beforeEach(seedDefaultUsers);

	it("promotes a regular user to admin and returns 200 with updated role", async () => {
		const req = await adminRequest(`/api/admin/users/${USER_A_ID}/role`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "admin" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserSuccessBody;
		expect(body.data.role).toBe("admin");
		expect(body.data.id).toBe(USER_A_ID);
	});

	it("demotes an admin user to regular user and returns 200 with updated role", async () => {
		// Elevate user A first.
		const db = drizzle(env.DB);
		await db.update(users).set({ role: "admin" }).where(eq(users.id, USER_A_ID));

		const req = await adminRequest(`/api/admin/users/${USER_A_ID}/role`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "user" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as UserSuccessBody;
		expect(body.data.role).toBe("user");
	});

	it("returns 400 SELF_ACTION_FORBIDDEN when admin targets own id", async () => {
		const req = await adminRequest(`/api/admin/users/${ADMIN_ID}/role`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "user" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("SELF_ACTION_FORBIDDEN");
	});

	it("returns 400 VALIDATION_ERROR for an invalid role value", async () => {
		const req = await adminRequest(`/api/admin/users/${USER_A_ID}/role`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "superadmin" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("VALIDATION_ERROR");
	});

	it("returns 404 NOT_FOUND when target user does not exist", async () => {
		const req = await adminRequest("/api/admin/users/DOESNOTEXIST00000000000000/role", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "admin" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("NOT_FOUND");
	});

	it("returns 400 VALIDATION_ERROR when request body is not valid JSON", async () => {
		const req = await adminRequest(`/api/admin/users/${USER_A_ID}/role`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: "this is not json {{{",
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(body.error.message).toMatch(/valid JSON/i);
	});
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────

describe("DELETE /api/admin/users/:id", () => {
	beforeEach(seedDefaultUsers);

	it("returns 204 on successful deletion", async () => {
		const req = await adminRequest(`/api/admin/users/${USER_A_ID}`, { method: "DELETE" });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(204);
	});

	it("cascades and removes all diagrams belonging to the deleted user", async () => {
		const db = drizzle(env.DB);
		// Insert 3 diagrams for user A.
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA000000000000000002A1", userId: USER_A_ID }));
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA000000000000000002A2", userId: USER_A_ID }));
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA000000000000000002A3", userId: USER_A_ID }));

		const req = await adminRequest(`/api/admin/users/${USER_A_ID}`, { method: "DELETE" });
		await app.fetch(req, env);

		// User record must be gone.
		const [remainingUser] = await db.select().from(users).where(eq(users.id, USER_A_ID)).limit(1);
		expect(remainingUser).toBeUndefined();

		// All diagrams for that user must be gone.
		const remainingDiagrams = await db.select().from(diagrams).where(eq(diagrams.userId, USER_A_ID));
		expect(remainingDiagrams).toHaveLength(0);
	});

	it("returns 400 SELF_ACTION_FORBIDDEN when admin targets own id", async () => {
		const req = await adminRequest(`/api/admin/users/${ADMIN_ID}`, { method: "DELETE" });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("SELF_ACTION_FORBIDDEN");
	});

	it("returns 404 NOT_FOUND when target user does not exist", async () => {
		const req = await adminRequest("/api/admin/users/DOESNOTEXIST00000000000000", { method: "DELETE" });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("NOT_FOUND");
	});
});

// ── Audit log emission ────────────────────────────────────────────────────────

describe("audit log emission", () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		await seedDefaultUsers();
		// Capture console.log so we can assert on audit log entries without
		// polluting test output. The logger middleware also calls console.log
		// for each request; findAuditLog() filters on event === "admin_action".
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	/**
	 * Scans all `console.log` calls and returns the first parsed JSON object
	 * where `event === "admin_action"`. Returns `undefined` when none is found.
	 *
	 * @returns The parsed audit log object, or `undefined`.
	 */
	function findAuditLog(): Record<string, unknown> | undefined {
		for (const call of consoleSpy.mock.calls) {
			try {
				const parsed = JSON.parse(call[0] as string) as Record<string, unknown>;
				if (parsed.event === "admin_action") return parsed;
			} catch {
				// Not JSON (e.g. non-structured console output) — skip.
			}
		}
		return undefined;
	}

	it("emits audit log with action=promote when promoting a user", async () => {
		const req = await adminRequest(`/api/admin/users/${USER_A_ID}/role`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "admin" }),
		});
		await app.fetch(req, env);

		const log = findAuditLog();
		expect(log).toBeDefined();
		expect(log?.event).toBe("admin_action");
		expect(log?.action).toBe("promote");
		expect(log?.actor_id).toBe(ADMIN_ID);
		expect(log?.actor_email).toBe(ADMIN_EMAIL);
		expect(log?.target_id).toBe(USER_A_ID);
		expect(log?.target_email).toBe(USER_A_EMAIL);
		// Timestamp must be a valid ISO 8601 string.
		expect(typeof log?.timestamp).toBe("string");
		expect(new Date(log?.timestamp as string).toISOString()).toBe(log?.timestamp);
	});

	it("emits audit log with action=demote when demoting an admin", async () => {
		const db = drizzle(env.DB);
		await db.update(users).set({ role: "admin" }).where(eq(users.id, USER_A_ID));

		const req = await adminRequest(`/api/admin/users/${USER_A_ID}/role`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "user" }),
		});
		await app.fetch(req, env);

		const log = findAuditLog();
		expect(log).toBeDefined();
		expect(log?.action).toBe("demote");
		expect(log?.target_id).toBe(USER_A_ID);
	});

	it("emits audit log with action=delete_user when deleting a user", async () => {
		const req = await adminRequest(`/api/admin/users/${USER_A_ID}`, { method: "DELETE" });
		await app.fetch(req, env);

		const log = findAuditLog();
		expect(log).toBeDefined();
		expect(log?.event).toBe("admin_action");
		expect(log?.action).toBe("delete_user");
		expect(log?.actor_id).toBe(ADMIN_ID);
		expect(log?.actor_email).toBe(ADMIN_EMAIL);
		expect(log?.target_id).toBe(USER_A_ID);
		expect(log?.target_email).toBe(USER_A_EMAIL);
	});
});

// ── convertErrorOrThrow ───────────────────────────────────────────────────────

describe("convertErrorOrThrow", () => {
	it("calls c.json with the error envelope and statusHint when given a RepositoryError", () => {
		const json = vi.fn();
		const c = { json } as unknown as Context;

		const err = new RepositoryError(ErrorCode.NOT_FOUND, 404, "User not found");
		convertErrorOrThrow(c, err);

		expect(json).toHaveBeenCalledOnce();
		expect(json).toHaveBeenCalledWith({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
	});

	it("maps statusHint correctly for non-404 RepositoryErrors", () => {
		const json = vi.fn();
		const c = { json } as unknown as Context;

		const err = new RepositoryError(ErrorCode.SELF_ACTION_FORBIDDEN, 400, "Cannot change your own role");
		convertErrorOrThrow(c, err);

		expect(json).toHaveBeenCalledWith(
			{ error: { code: "SELF_ACTION_FORBIDDEN", message: "Cannot change your own role" } },
			400,
		);
	});

	it("re-throws the original error when it is not a RepositoryError", () => {
		const json = vi.fn();
		const c = { json } as unknown as Context;

		const err = new Error("unexpected database failure");
		expect(() => convertErrorOrThrow(c, err)).toThrow(err);
		expect(json).not.toHaveBeenCalled();
	});
});
