import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { diagrams, users } from "../../../db/schema";
import { ErrorCode } from "../../../lib/errors";
import { createTestDiagram, createTestUser } from "../../../test/helpers";
import {
	auditActionForRole,
	deleteUser,
	getUserWithDiagramCount,
	listUsers,
	RepositoryError,
	resolveActor,
	serializeAdminUser,
	updateUserRole,
} from "../users.repository";

/**
 * Unit tests for `users.repository.ts`.
 *
 * Each test calls repository functions directly against the Miniflare in-memory
 * D1 binding. This isolates the DB/business-logic layer from the HTTP layer,
 * making individual branches (especially the sort-column fallback and error
 * paths) easy to target without constructing full HTTP requests.
 *
 * Test fixtures:
 * - `ADMIN_ID` / `ADMIN_EMAIL`   — admin actor used as `resolveActor` subject
 * - `USER_A_ID` / `USER_A_EMAIL` — primary non-admin target
 * - `USER_B_ID` / `USER_B_EMAIL` — secondary user for list tests
 */

// ── Stable IDs and emails ──────────────────────────────────────────────────────

const ADMIN_ID = "01JADMIN000000000000000001";
const USER_A_ID = "01JUSERA0000000000000000A1";
const USER_B_ID = "01JUSERB0000000000000000B1";

const ADMIN_EMAIL = "admin@test.com";
const USER_A_EMAIL = "user-a@example.com";
const USER_B_EMAIL = "user-b@example.com";

// ── Seed helper ────────────────────────────────────────────────────────────────

/**
 * Wipes all rows and re-inserts one admin + two regular users.
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

// ── resolveActor ───────────────────────────────────────────────────────────────

describe("resolveActor", () => {
	beforeEach(seedDefaultUsers);

	it("returns the user row when the email exists", async () => {
		const db = drizzle(env.DB);
		const actor = await resolveActor(db, ADMIN_EMAIL);
		expect(actor.id).toBe(ADMIN_ID);
		expect(actor.email).toBe(ADMIN_EMAIL);
		expect(actor.role).toBe("admin");
	});

	it("throws RepositoryError(UNAUTHORIZED) when email is not in the database", async () => {
		const db = drizzle(env.DB);
		await expect(resolveActor(db, "nobody@example.com")).rejects.toThrow(RepositoryError);
		await expect(resolveActor(db, "nobody@example.com")).rejects.toMatchObject({
			code: ErrorCode.UNAUTHORIZED,
			statusHint: 401,
		});
	});
});

// ── listUsers ──────────────────────────────────────────────────────────────────

describe("listUsers", () => {
	beforeEach(seedDefaultUsers);

	it("returns all users with total when no search or pagination is applied", async () => {
		const db = drizzle(env.DB);
		const { rows, total } = await listUsers(db, { page: 1, limit: 20, sort: "created_at", order: "desc" });
		expect(total).toBe(3);
		expect(rows).toHaveLength(3);
	});

	it("paginates correctly with page and limit", async () => {
		const db = drizzle(env.DB);
		const { rows, total } = await listUsers(db, { page: 1, limit: 2, sort: "created_at", order: "desc" });
		expect(total).toBe(3);
		expect(rows).toHaveLength(2);
	});

	it("includes the correct diagram count via LEFT JOIN", async () => {
		const db = drizzle(env.DB);
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA0000000000000001A1", userId: USER_A_ID }));
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA0000000000000001A2", userId: USER_A_ID }));

		const { rows } = await listUsers(db, { page: 1, limit: 20, sort: "created_at", order: "desc" });
		const userA = rows.find((r) => r.id === USER_A_ID);
		expect(Number(userA?.diagramCount)).toBe(2);

		const userB = rows.find((r) => r.id === USER_B_ID);
		expect(Number(userB?.diagramCount)).toBe(0);
	});

	it("filters by search substring matching email", async () => {
		const db = drizzle(env.DB);
		const { rows, total } = await listUsers(db, {
			page: 1,
			limit: 20,
			sort: "created_at",
			order: "desc",
			search: "user-a",
		});
		expect(total).toBe(1);
		expect(rows[0].email).toBe(USER_A_EMAIL);
	});

	it("sorts ascending when order=asc", async () => {
		const db = drizzle(env.DB);
		const { rows } = await listUsers(db, { page: 1, limit: 20, sort: "email", order: "asc" });
		const emails = rows.map((r) => r.email);
		for (let i = 1; i < emails.length; i++) {
			expect(emails[i] >= emails[i - 1]).toBe(true);
		}
	});

	it("falls back to created_at when an unknown sort column is given", async () => {
		const db = drizzle(env.DB);
		// Should not throw; unknown column silently falls back to created_at.
		const { rows, total } = await listUsers(db, {
			page: 1,
			limit: 20,
			sort: "bogus_column",
			order: "desc",
		});
		// The result is still a valid list of all users, just ordered by created_at.
		expect(total).toBe(3);
		expect(rows).toHaveLength(3);
	});

	it("returns empty rows when page is beyond the last page", async () => {
		const db = drizzle(env.DB);
		const { rows, total } = await listUsers(db, { page: 999, limit: 20, sort: "created_at", order: "desc" });
		expect(total).toBe(3);
		expect(rows).toHaveLength(0);
	});
});

// ── getUserWithDiagramCount ────────────────────────────────────────────────────

describe("getUserWithDiagramCount", () => {
	beforeEach(seedDefaultUsers);

	it("returns user row with diagram count of 0 when user has no diagrams", async () => {
		const db = drizzle(env.DB);
		const row = await getUserWithDiagramCount(db, USER_A_ID);
		expect(row.id).toBe(USER_A_ID);
		expect(Number(row.diagramCount)).toBe(0);
	});

	it("returns user row with correct diagram count when user has diagrams", async () => {
		const db = drizzle(env.DB);
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA0000000000000002A1", userId: USER_A_ID }));
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA0000000000000002A2", userId: USER_A_ID }));

		const row = await getUserWithDiagramCount(db, USER_A_ID);
		expect(Number(row.diagramCount)).toBe(2);
	});

	it("throws RepositoryError(NOT_FOUND) when user does not exist", async () => {
		const db = drizzle(env.DB);
		await expect(getUserWithDiagramCount(db, "DOESNOTEXIST000000000000")).rejects.toThrow(RepositoryError);
		await expect(getUserWithDiagramCount(db, "DOESNOTEXIST000000000000")).rejects.toMatchObject({
			code: ErrorCode.NOT_FOUND,
			statusHint: 404,
		});
	});
});

// ── updateUserRole ─────────────────────────────────────────────────────────────

describe("updateUserRole", () => {
	beforeEach(seedDefaultUsers);

	it("updates role in the database and returns the updated row", async () => {
		const db = drizzle(env.DB);
		const actor = await resolveActor(db, ADMIN_EMAIL);
		const updated = await updateUserRole(db, actor, USER_A_ID, "admin");

		expect(updated.id).toBe(USER_A_ID);
		expect(updated.role).toBe("admin");

		// Verify the change is persisted in the database.
		const [persisted] = await db.select().from(users).where(eq(users.id, USER_A_ID)).limit(1);
		expect(persisted?.role).toBe("admin");
	});

	it("returns the row with diagram count after the update", async () => {
		const db = drizzle(env.DB);
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA0000000000000003A1", userId: USER_A_ID }));
		const actor = await resolveActor(db, ADMIN_EMAIL);
		const updated = await updateUserRole(db, actor, USER_A_ID, "admin");

		expect(Number(updated.diagramCount)).toBe(1);
	});

	it("throws RepositoryError(SELF_ACTION_FORBIDDEN) when actor targets themselves", async () => {
		const db = drizzle(env.DB);
		const actor = await resolveActor(db, ADMIN_EMAIL);
		await expect(updateUserRole(db, actor, ADMIN_ID, "user")).rejects.toThrow(RepositoryError);
		await expect(updateUserRole(db, actor, ADMIN_ID, "user")).rejects.toMatchObject({
			code: ErrorCode.SELF_ACTION_FORBIDDEN,
			statusHint: 400,
		});
	});

	it("throws RepositoryError(NOT_FOUND) when target user does not exist", async () => {
		const db = drizzle(env.DB);
		const actor = await resolveActor(db, ADMIN_EMAIL);
		await expect(updateUserRole(db, actor, "DOESNOTEXIST000000000000", "admin")).rejects.toThrow(RepositoryError);
		await expect(updateUserRole(db, actor, "DOESNOTEXIST000000000000", "admin")).rejects.toMatchObject({
			code: ErrorCode.NOT_FOUND,
			statusHint: 404,
		});
	});
});

// ── deleteUser ─────────────────────────────────────────────────────────────────

describe("deleteUser", () => {
	beforeEach(seedDefaultUsers);

	it("removes the user record from the database", async () => {
		const db = drizzle(env.DB);
		const actor = await resolveActor(db, ADMIN_EMAIL);
		await deleteUser(db, actor, USER_A_ID);

		const [remaining] = await db.select().from(users).where(eq(users.id, USER_A_ID)).limit(1);
		expect(remaining).toBeUndefined();
	});

	it("returns the deleted user's bare row (email available for audit log)", async () => {
		const db = drizzle(env.DB);
		const actor = await resolveActor(db, ADMIN_EMAIL);
		const deleted = await deleteUser(db, actor, USER_A_ID);

		expect(deleted.id).toBe(USER_A_ID);
		expect(deleted.email).toBe(USER_A_EMAIL);
	});

	it("cascades and removes all diagrams belonging to the deleted user", async () => {
		const db = drizzle(env.DB);
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA0000000000000004A1", userId: USER_A_ID }));
		await db.insert(diagrams).values(createTestDiagram({ id: "01JDIA0000000000000004A2", userId: USER_A_ID }));

		const actor = await resolveActor(db, ADMIN_EMAIL);
		await deleteUser(db, actor, USER_A_ID);

		const remainingDiagrams = await db.select().from(diagrams).where(eq(diagrams.userId, USER_A_ID));
		expect(remainingDiagrams).toHaveLength(0);
	});

	it("throws RepositoryError(SELF_ACTION_FORBIDDEN) when actor targets themselves", async () => {
		const db = drizzle(env.DB);
		const actor = await resolveActor(db, ADMIN_EMAIL);
		await expect(deleteUser(db, actor, ADMIN_ID)).rejects.toThrow(RepositoryError);
		await expect(deleteUser(db, actor, ADMIN_ID)).rejects.toMatchObject({
			code: ErrorCode.SELF_ACTION_FORBIDDEN,
			statusHint: 400,
		});
	});

	it("throws RepositoryError(NOT_FOUND) when target user does not exist", async () => {
		const db = drizzle(env.DB);
		const actor = await resolveActor(db, ADMIN_EMAIL);
		await expect(deleteUser(db, actor, "DOESNOTEXIST000000000000")).rejects.toThrow(RepositoryError);
		await expect(deleteUser(db, actor, "DOESNOTEXIST000000000000")).rejects.toMatchObject({
			code: ErrorCode.NOT_FOUND,
			statusHint: 404,
		});
	});
});

// ── serializeAdminUser ─────────────────────────────────────────────────────────

describe("serializeAdminUser", () => {
	it("converts camelCase AdminUserRow to snake_case AdminUserResponse", () => {
		const row = {
			id: "01JTEST000000000000000001",
			email: "test@example.com",
			name: "Test User",
			avatarUrl: "https://example.com/avatar.png",
			role: "admin",
			createdAt: 1000,
			updatedAt: 2000,
			diagramCount: 3,
		};
		const result = serializeAdminUser(row);
		expect(result).toEqual({
			id: "01JTEST000000000000000001",
			email: "test@example.com",
			name: "Test User",
			avatar_url: "https://example.com/avatar.png",
			role: "admin",
			diagram_count: 3,
			created_at: 1000,
			updated_at: 2000,
		});
	});

	it("passes null through for optional fields", () => {
		const row = {
			id: "01JTEST000000000000000002",
			email: "noname@example.com",
			name: null,
			avatarUrl: null,
			role: "user",
			createdAt: 0,
			updatedAt: 0,
			diagramCount: 0,
		};
		const result = serializeAdminUser(row);
		expect(result.name).toBeNull();
		expect(result.avatar_url).toBeNull();
		expect(result.diagram_count).toBe(0);
	});
});

// ── auditActionForRole ─────────────────────────────────────────────────────────

describe("auditActionForRole", () => {
	it("returns 'promote' for role='admin'", () => {
		expect(auditActionForRole("admin")).toBe("promote");
	});

	it("returns 'demote' for role='user'", () => {
		expect(auditActionForRole("user")).toBe("demote");
	});
});

// ── RepositoryError ────────────────────────────────────────────────────────────

describe("RepositoryError", () => {
	it("has name='RepositoryError', the given code, statusHint, and message", () => {
		const err = new RepositoryError(ErrorCode.NOT_FOUND, 404, "User not found");
		expect(err.name).toBe("RepositoryError");
		expect(err.code).toBe("NOT_FOUND");
		expect(err.statusHint).toBe(404);
		expect(err.message).toBe("User not found");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(RepositoryError);
	});
});
