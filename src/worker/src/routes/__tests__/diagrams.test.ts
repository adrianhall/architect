import { env } from "cloudflare:test";
import type { DiagramResponse } from "@architect/shared";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { diagrams, users } from "../../db/schema";
import app from "../../index";
import { createAuthenticatedRequest, createTestDiagram, createTestUser } from "../../test/helpers";

/**
 * Integration tests for the `/api/diagrams` endpoint set.
 *
 * Exercises the full middleware chain (auth + diagram CRUD logic) through the
 * main app entry point using the Miniflare in-memory D1 binding. Each test
 * starts with clean `users` and `diagrams` tables (wiped in `beforeEach`).
 *
 * Two test users are set up per suite:
 * - `userA` — the primary actor for most tests.
 * - `userB` — a second user used to verify ownership isolation.
 *
 * The test env comes from `wrangler.test.jsonc`, which sets:
 * - `CLOUDFLARE_TEAM_DOMAIN = "test.cloudflareaccess.com"`
 * - `SEED_ADMIN_EMAIL = "admin@test.com"`
 */

/** Convenience type for the API success envelope wrapping a single diagram. */
type DiagramSuccessBody = { data: DiagramResponse };

/** Convenience type for the API success envelope wrapping a list of diagrams. */
type DiagramListBody = { data: DiagramResponse[] };

/** Convenience type for an API error body. */
type ErrorBody = { error: { code: string; message: string } };

const USER_A_EMAIL = "user-a@example.com";
const USER_B_EMAIL = "user-b@example.com";

/** Builds a fully authenticated POST /api/diagrams request with a JSON body. */
async function createDiagramRequest(email: string, body: Record<string, unknown>): Promise<Request> {
	return createAuthenticatedRequest("http://localhost/api/diagrams", email, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/diagrams", () => {
	let userAId: string;

	beforeEach(async () => {
		const db = drizzle(env.DB);
		await db.delete(diagrams);
		await db.delete(users);

		const userA = createTestUser({ id: "01JUSA000000000000000000A0", email: USER_A_EMAIL });
		await db.insert(users).values(userA);
		userAId = userA.id;
	});

	it("creates a diagram and returns 201 with a ULID id", async () => {
		const req = await createDiagramRequest(USER_A_EMAIL, { title: "My Diagram" });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(201);
		const body = (await res.json()) as DiagramSuccessBody;
		expect(body.data.id).toMatch(/^[0-9A-Z]{26}$/i);
		expect(body.data.title).toBe("My Diagram");
		expect(body.data.version).toBe(1);
		expect(body.data.user_id).toBe(userAId);
	});

	it("new diagram has default empty graph data", async () => {
		const req = await createDiagramRequest(USER_A_EMAIL, { title: "Test" });
		const res = await app.fetch(req, env);
		const body = (await res.json()) as DiagramSuccessBody;

		expect(body.data.graph_data.nodes).toEqual([]);
		expect(body.data.graph_data.edges).toEqual([]);
		expect(body.data.graph_data.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
	});

	it("returns 400 when title is missing", async () => {
		const req = await createDiagramRequest(USER_A_EMAIL, {});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("VALIDATION_ERROR");
	});

	it("returns 400 when title is empty string", async () => {
		const req = await createDiagramRequest(USER_A_EMAIL, { title: "" });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
	});

	it("returns 400 when title exceeds 80 characters", async () => {
		const req = await createDiagramRequest(USER_A_EMAIL, { title: "x".repeat(81) });
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
	});

	it("returns 401 without authentication", async () => {
		const res = await app.fetch(
			new Request("http://localhost/api/diagrams", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Test" }),
			}),
			env,
		);
		// devAuthMiddleware redirects unauthenticated requests to login form.
		expect(res.status).toBe(302);
	});
});

describe("GET /api/diagrams", () => {
	beforeEach(async () => {
		const db = drizzle(env.DB);
		await db.delete(diagrams);
		await db.delete(users);

		const userA = createTestUser({ id: "01JUSA000000000000000000A0", email: USER_A_EMAIL });
		const userB = createTestUser({ id: "01JUSB000000000000000000B0", email: USER_B_EMAIL });
		await db.insert(users).values(userA);
		await db.insert(users).values(userB);
	});

	it("returns only diagrams owned by the authenticated user", async () => {
		const db = drizzle(env.DB);

		// 2 diagrams for user A, 1 for user B.
		await db
			.insert(diagrams)
			.values(
				createTestDiagram({ id: "01JDIA00000000000000000A1", userId: "01JUSA000000000000000000A0", title: "A1" }),
			);
		await db
			.insert(diagrams)
			.values(
				createTestDiagram({ id: "01JDIA00000000000000000A2", userId: "01JUSA000000000000000000A0", title: "A2" }),
			);
		await db
			.insert(diagrams)
			.values(
				createTestDiagram({ id: "01JDIA00000000000000000B1", userId: "01JUSB000000000000000000B0", title: "B1" }),
			);

		const reqA = await createAuthenticatedRequest("http://localhost/api/diagrams", USER_A_EMAIL);
		const resA = await app.fetch(reqA, env);
		expect(resA.status).toBe(200);
		const bodyA = (await resA.json()) as DiagramListBody;
		expect(bodyA.data).toHaveLength(2);

		const reqB = await createAuthenticatedRequest("http://localhost/api/diagrams", USER_B_EMAIL);
		const resB = await app.fetch(reqB, env);
		const bodyB = (await resB.json()) as DiagramListBody;
		expect(bodyB.data).toHaveLength(1);
	});

	it("returns diagrams sorted by updated_at descending", async () => {
		const db = drizzle(env.DB);
		const now = Date.now();

		await db.insert(diagrams).values(
			createTestDiagram({
				id: "01JDIA00000000000000000A1",
				userId: "01JUSA000000000000000000A0",
				title: "Older",
				updatedAt: now - 2000,
			}),
		);
		await db.insert(diagrams).values(
			createTestDiagram({
				id: "01JDIA00000000000000000A2",
				userId: "01JUSA000000000000000000A0",
				title: "Newer",
				updatedAt: now - 1000,
			}),
		);

		const req = await createAuthenticatedRequest("http://localhost/api/diagrams", USER_A_EMAIL);
		const res = await app.fetch(req, env);
		const body = (await res.json()) as DiagramListBody;

		expect(body.data[0].title).toBe("Newer");
		expect(body.data[1].title).toBe("Older");
	});

	it("returns data envelope with empty array when user has no diagrams", async () => {
		const req = await createAuthenticatedRequest("http://localhost/api/diagrams", USER_A_EMAIL);
		const res = await app.fetch(req, env);
		expect(res.status).toBe(200);
		const body = (await res.json()) as DiagramListBody;
		expect(body.data).toEqual([]);
	});

	it("returns 401 without authentication", async () => {
		const res = await app.fetch(new Request("http://localhost/api/diagrams"), env);
		expect(res.status).toBe(302);
	});
});

describe("GET /api/diagrams/:id", () => {
	beforeEach(async () => {
		const db = drizzle(env.DB);
		await db.delete(diagrams);
		await db.delete(users);

		const userA = createTestUser({ id: "01JUSA000000000000000000A0", email: USER_A_EMAIL });
		const userB = createTestUser({ id: "01JUSB000000000000000000B0", email: USER_B_EMAIL });
		await db.insert(users).values(userA);
		await db.insert(users).values(userB);
	});

	it("returns a diagram by id", async () => {
		const db = drizzle(env.DB);
		const diagram = createTestDiagram({
			id: "01JDIA00000000000000000A1",
			userId: "01JUSA000000000000000000A0",
			title: "Architecture v1",
		});
		await db.insert(diagrams).values(diagram);

		const req = await createAuthenticatedRequest(
			"http://localhost/api/diagrams/01JDIA00000000000000000A1",
			USER_A_EMAIL,
		);
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as DiagramSuccessBody;
		expect(body.data.id).toBe("01JDIA00000000000000000A1");
		expect(body.data.title).toBe("Architecture v1");
	});

	it("returns 404 when diagram belongs to a different user", async () => {
		const db = drizzle(env.DB);
		await db
			.insert(diagrams)
			.values(createTestDiagram({ id: "01JDIA00000000000000000A1", userId: "01JUSA000000000000000000A0" }));

		// User B tries to access user A's diagram.
		const req = await createAuthenticatedRequest(
			"http://localhost/api/diagrams/01JDIA00000000000000000A1",
			USER_B_EMAIL,
		);
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
	});

	it("returns 404 for a nonexistent diagram id", async () => {
		const req = await createAuthenticatedRequest(
			"http://localhost/api/diagrams/DOESNOTEXIST00000000000000",
			USER_A_EMAIL,
		);
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("NOT_FOUND");
	});

	it("returns 401 without authentication", async () => {
		const res = await app.fetch(new Request("http://localhost/api/diagrams/SOMEID"), env);
		expect(res.status).toBe(302);
	});
});

describe("PUT /api/diagrams/:id", () => {
	const DIAGRAM_ID = "01JDIA00000000000000000A1";

	beforeEach(async () => {
		const db = drizzle(env.DB);
		await db.delete(diagrams);
		await db.delete(users);

		const userA = createTestUser({ id: "01JUSA000000000000000000A0", email: USER_A_EMAIL });
		const userB = createTestUser({ id: "01JUSB000000000000000000B0", email: USER_B_EMAIL });
		await db.insert(users).values(userA);
		await db.insert(users).values(userB);
		await db
			.insert(diagrams)
			.values(createTestDiagram({ id: DIAGRAM_ID, userId: "01JUSA000000000000000000A0", version: 1 }));
	});

	it("updates diagram and increments version on correct version", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_A_EMAIL, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Updated Title",
				graph_data: {
					nodes: [{ id: "n1", type: "workers", position: { x: 0, y: 0 }, data: { label: "Worker" } }],
					edges: [],
				},
				version: 1,
			}),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as DiagramSuccessBody;
		expect(body.data.version).toBe(2);
		expect(body.data.title).toBe("Updated Title");
		expect(body.data.graph_data.nodes).toHaveLength(1);
	});

	it("returns 409 CONFLICT with stale version", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_A_EMAIL, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Stale",
				graph_data: { nodes: [], edges: [] },
				version: 0, // stale — DB has version 1
			}),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(409);
		const body = (await res.json()) as ErrorBody;
		expect(body.error.code).toBe("CONFLICT");
	});

	it("returns 400 for invalid graph_data (missing nodes)", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_A_EMAIL, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Test",
				graph_data: { invalid: true },
				version: 1,
			}),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
	});

	it("returns 404 when diagram is not owned by the user", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_B_EMAIL, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Stolen",
				graph_data: { nodes: [], edges: [] },
				version: 1,
			}),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
	});

	it("returns 401 without authentication", async () => {
		const res = await app.fetch(
			new Request(`http://localhost/api/diagrams/${DIAGRAM_ID}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "x", graph_data: { nodes: [], edges: [] }, version: 1 }),
			}),
			env,
		);
		expect(res.status).toBe(302);
	});
});

describe("PATCH /api/diagrams/:id", () => {
	const DIAGRAM_ID = "01JDIA00000000000000000A1";

	beforeEach(async () => {
		const db = drizzle(env.DB);
		await db.delete(diagrams);
		await db.delete(users);

		const userA = createTestUser({ id: "01JUSA000000000000000000A0", email: USER_A_EMAIL });
		const userB = createTestUser({ id: "01JUSB000000000000000000B0", email: USER_B_EMAIL });
		await db.insert(users).values(userA);
		await db.insert(users).values(userB);
		await db
			.insert(diagrams)
			.values(
				createTestDiagram({ id: DIAGRAM_ID, userId: "01JUSA000000000000000000A0", title: "Original", version: 3 }),
			);
	});

	it("updates only the title and does not change version", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_A_EMAIL, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Renamed" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as DiagramSuccessBody;
		expect(body.data.title).toBe("Renamed");
		// Version should be unchanged (still 3).
		expect(body.data.version).toBe(3);
	});

	it("returns 400 for invalid title", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_A_EMAIL, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(400);
	});

	it("returns 404 when diagram is not owned by the user", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_B_EMAIL, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Stolen" }),
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
	});

	it("returns 401 without authentication", async () => {
		const res = await app.fetch(
			new Request(`http://localhost/api/diagrams/${DIAGRAM_ID}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "x" }),
			}),
			env,
		);
		expect(res.status).toBe(302);
	});
});

describe("DELETE /api/diagrams/:id", () => {
	const DIAGRAM_ID = "01JDIA00000000000000000A1";

	beforeEach(async () => {
		const db = drizzle(env.DB);
		await db.delete(diagrams);
		await db.delete(users);

		const userA = createTestUser({ id: "01JUSA000000000000000000A0", email: USER_A_EMAIL });
		const userB = createTestUser({ id: "01JUSB000000000000000000B0", email: USER_B_EMAIL });
		await db.insert(users).values(userA);
		await db.insert(users).values(userB);
		await db.insert(diagrams).values(createTestDiagram({ id: DIAGRAM_ID, userId: "01JUSA000000000000000000A0" }));
	});

	it("deletes diagram and returns 204", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_A_EMAIL, {
			method: "DELETE",
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(204);
	});

	it("diagram is gone after deletion", async () => {
		const delReq = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_A_EMAIL, {
			method: "DELETE",
		});
		await app.fetch(delReq, env);

		const getReq = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_A_EMAIL);
		const getRes = await app.fetch(getReq, env);

		expect(getRes.status).toBe(404);
	});

	it("returns 404 when diagram is not owned by the user", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${DIAGRAM_ID}`, USER_B_EMAIL, {
			method: "DELETE",
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
	});

	it("returns 401 without authentication", async () => {
		const res = await app.fetch(new Request(`http://localhost/api/diagrams/${DIAGRAM_ID}`, { method: "DELETE" }), env);
		expect(res.status).toBe(302);
	});
});

describe("POST /api/diagrams/:id/duplicate", () => {
	const SOURCE_ID = "01JDIA00000000000000000A1";

	beforeEach(async () => {
		const db = drizzle(env.DB);
		await db.delete(diagrams);
		await db.delete(users);

		const userA = createTestUser({ id: "01JUSA000000000000000000A0", email: USER_A_EMAIL });
		const userB = createTestUser({ id: "01JUSB000000000000000000B0", email: USER_B_EMAIL });
		await db.insert(users).values(userA);
		await db.insert(users).values(userB);
		await db.insert(diagrams).values(
			createTestDiagram({
				id: SOURCE_ID,
				userId: "01JUSA000000000000000000A0",
				title: "Original",
				graphData: JSON.stringify({
					nodes: [{ id: "n1", type: "workers", position: { x: 10, y: 20 }, data: { label: "Worker" } }],
					edges: [],
					viewport: { x: 0, y: 0, zoom: 1 },
				}),
				version: 5,
			}),
		);
	});

	it("creates a copy with '(Copy)' suffix and version 1", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${SOURCE_ID}/duplicate`, USER_A_EMAIL, {
			method: "POST",
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(201);
		const body = (await res.json()) as DiagramSuccessBody;
		expect(body.data.title).toBe("Original (Copy)");
		expect(body.data.version).toBe(1);
		expect(body.data.id).not.toBe(SOURCE_ID);
		expect(body.data.id).toMatch(/^[0-9A-Z]{26}$/i);
	});

	it("copy has the same graph_data as the source", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${SOURCE_ID}/duplicate`, USER_A_EMAIL, {
			method: "POST",
		});
		const res = await app.fetch(req, env);
		const body = (await res.json()) as DiagramSuccessBody;

		expect(body.data.graph_data.nodes).toHaveLength(1);
		expect(body.data.graph_data.nodes[0].data.label).toBe("Worker");
		expect(body.data.graph_data.edges).toEqual([]);
	});

	it("returns 404 when source diagram is not owned by the user", async () => {
		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${SOURCE_ID}/duplicate`, USER_B_EMAIL, {
			method: "POST",
		});
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
	});

	it("returns 404 for nonexistent source diagram", async () => {
		const req = await createAuthenticatedRequest(
			"http://localhost/api/diagrams/DOESNOTEXIST00000000000000/duplicate",
			USER_A_EMAIL,
			{
				method: "POST",
			},
		);
		const res = await app.fetch(req, env);

		expect(res.status).toBe(404);
	});

	it("returns 401 without authentication", async () => {
		const res = await app.fetch(
			new Request(`http://localhost/api/diagrams/${SOURCE_ID}/duplicate`, { method: "POST" }),
			env,
		);
		expect(res.status).toBe(302);
	});

	it("truncates copy title to 80 characters if source title is near the limit", async () => {
		const db = drizzle(env.DB);
		const longTitle = "A".repeat(78); // "A...A (Copy)" = 85 chars → truncated to 80
		const longId = "01JDIA00000000000000000A2";
		await db
			.insert(diagrams)
			.values(createTestDiagram({ id: longId, userId: "01JUSA000000000000000000A0", title: longTitle }));

		const req = await createAuthenticatedRequest(`http://localhost/api/diagrams/${longId}/duplicate`, USER_A_EMAIL, {
			method: "POST",
		});
		const res = await app.fetch(req, env);
		const body = (await res.json()) as DiagramSuccessBody;

		expect(body.data.title.length).toBeLessThanOrEqual(80);
	});
});
