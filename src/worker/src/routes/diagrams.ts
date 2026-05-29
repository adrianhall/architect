import type { DiagramResponse, GraphData } from "@architect/shared";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { ulid } from "ulid";
import { diagrams, users } from "../db/schema";
import { ErrorCode } from "../lib/errors";
import { error, success } from "../lib/response";
import type { AuthVariables } from "../middleware/auth";

/**
 * Default empty graph data used when creating a new blank diagram.
 *
 * Provides an empty canvas with origin viewport (no pan, no zoom offset).
 */
const DEFAULT_GRAPH_DATA: GraphData = {
	nodes: [],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
};

/**
 * Maximum allowed length for a diagram title, in characters.
 *
 * Mirrors the DB column constraint documented in `MVP_PLAN.md` section 8.
 */
const MAX_TITLE_LENGTH = 80;

/**
 * Environment bindings required by the `/api/diagrams` route set.
 *
 * Declared as a local type (not imported from `WorkerEnv`) to keep this module
 * self-contained, following the same pattern as `routes/me.ts`.
 */
type DiagramsEnv = {
	Bindings: {
		DB: D1Database;
	};
	Variables: AuthVariables;
};

/**
 * A raw diagram row as returned by Drizzle queries.
 *
 * The `graphData` field is the raw JSON string stored in D1. Use
 * {@link serializeDiagram} to convert it to the API response shape with a
 * parsed `graph_data` object.
 */
type DiagramRow = {
	id: string;
	userId: string;
	title: string;
	graphData: string;
	version: number;
	createdAt: number;
	updatedAt: number;
};

/**
 * Converts a Drizzle diagram row to the API response shape.
 *
 * Parses the raw `graphData` JSON string into a `GraphData` object and maps
 * Drizzle camelCase property names to the snake_case API field names.
 *
 * @param row - Raw database row returned by a Drizzle diagram query.
 * @returns A {@link DiagramResponse} with parsed `graph_data`.
 */
function serializeDiagram(row: DiagramRow): DiagramResponse {
	return {
		id: row.id,
		user_id: row.userId,
		title: row.title,
		graph_data: JSON.parse(row.graphData) as GraphData,
		version: row.version,
		created_at: row.createdAt,
		updated_at: row.updatedAt,
	};
}

/**
 * Validates a diagram title.
 *
 * A valid title is a non-empty string of at most {@link MAX_TITLE_LENGTH}
 * characters. Whitespace-only strings are considered empty.
 *
 * @param title - The candidate title value to validate (may be any type).
 * @returns An error message string when the value is invalid, or `null` when
 *   the value is a valid title.
 *
 * @example
 * ```ts
 * validateTitle("My Diagram"); // null — valid
 * validateTitle("");           // "Title must be a string between 1 and 80 characters"
 * validateTitle(123);          // "Title must be a string between 1 and 80 characters"
 * ```
 */
function validateTitle(title: unknown): string | null {
	if (typeof title !== "string" || title.length === 0 || title.length > MAX_TITLE_LENGTH) {
		return `Title must be a string between 1 and ${MAX_TITLE_LENGTH} characters`;
	}
	return null;
}

/**
 * Validates graph data structure.
 *
 * Valid graph data must be a non-null object with `nodes` and `edges` arrays.
 * The `viewport` property is optional.
 *
 * @param data - The candidate graph data value to validate (may be any type).
 * @returns An error message string when the value is invalid, or `null` when
 *   the value is valid graph data.
 *
 * @example
 * ```ts
 * validateGraphData({ nodes: [], edges: [] }); // null — valid
 * validateGraphData({ nodes: [] });             // "graph_data.edges must be an array"
 * validateGraphData(null);                      // "graph_data must be an object"
 * ```
 */
function validateGraphData(data: unknown): string | null {
	if (typeof data !== "object" || data === null) return "graph_data must be an object";
	if (!Array.isArray((data as Record<string, unknown>).nodes)) return "graph_data.nodes must be an array";
	if (!Array.isArray((data as Record<string, unknown>).edges)) return "graph_data.edges must be an array";
	return null;
}

/**
 * Diagrams router — all `/api/diagrams` endpoints.
 *
 * All routes in this router are protected by the auth middleware mounted in
 * `index.ts` before this router is registered. The authenticated user's email
 * is available via `c.get("userEmail")`.
 *
 * Endpoints:
 * - `POST /`          — Create a new blank diagram.
 * - `GET /`           — List all diagrams owned by the authenticated user.
 * - `GET /:id`        — Retrieve a single diagram by ID.
 * - `PUT /:id`        — Full update with optimistic concurrency check.
 * - `PATCH /:id`      — Rename only (updates `title`, not `version`).
 * - `DELETE /:id`     — Delete a diagram.
 * - `POST /:id/duplicate` — Clone a diagram with a "(Copy)" suffix.
 *
 * @example
 * ```ts
 * // Mount in index.ts after auth middleware:
 * app.route("/api/diagrams", diagrams);
 * ```
 */
const diagramsRouter = new Hono<DiagramsEnv>();

// ── POST / — Create ───────────────────────────────────────────────────────────

/**
 * POST /
 *
 * Creates a new blank diagram for the authenticated user.
 *
 * Validates the `title` field (1–80 chars), assigns a ULID, and inserts a row
 * with default empty graph data and `version = 1`.
 *
 * @returns 201 with `{ data: DiagramResponse }`, or 400 with validation error.
 */
diagramsRouter.post("/", async (c) => {
	const email = c.get("userEmail");
	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);

	// Look up the authenticated user to get their DB id.
	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (!user) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "User not found"), 401);
	}

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		return c.json(error(ErrorCode.VALIDATION_ERROR, "Request body must be valid JSON"), 400);
	}

	const titleError = validateTitle(body.title);
	if (titleError) {
		return c.json(error(ErrorCode.VALIDATION_ERROR, titleError), 400);
	}

	const now = Date.now();
	const newDiagram: DiagramRow = {
		id: ulid(),
		userId: user.id,
		title: body.title as string,
		graphData: JSON.stringify(DEFAULT_GRAPH_DATA),
		version: 1,
		createdAt: now,
		updatedAt: now,
	};

	await db.insert(diagrams).values(newDiagram);

	return c.json(success(serializeDiagram(newDiagram)), 201);
});

// ── GET / — List ──────────────────────────────────────────────────────────────

/**
 * GET /
 *
 * Returns all diagrams owned by the authenticated user, sorted by `updated_at`
 * descending (most recently modified first).
 *
 * @returns 200 with `{ data: DiagramResponse[] }`.
 */
diagramsRouter.get("/", async (c) => {
	const email = c.get("userEmail");
	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);

	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (!user) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "User not found"), 401);
	}

	const rows = await db.select().from(diagrams).where(eq(diagrams.userId, user.id)).orderBy(desc(diagrams.updatedAt));

	return c.json(success(rows.map(serializeDiagram)));
});

// ── GET /:id — Get Single ─────────────────────────────────────────────────────

/**
 * GET /:id
 *
 * Returns a single diagram by ID. Returns 404 if the diagram does not exist
 * or is owned by a different user (ownership enforced in the query).
 *
 * @returns 200 with `{ data: DiagramResponse }`, or 404.
 */
diagramsRouter.get("/:id", async (c) => {
	const email = c.get("userEmail");
	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);
	const id = c.req.param("id");

	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (!user) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "User not found"), 401);
	}

	const [row] = await db
		.select()
		.from(diagrams)
		.where(and(eq(diagrams.id, id), eq(diagrams.userId, user.id)))
		.limit(1);

	if (!row) {
		return c.json(error(ErrorCode.NOT_FOUND, "Diagram not found"), 404);
	}

	return c.json(success(serializeDiagram(row)));
});

// ── PUT /:id — Full Update with Optimistic Concurrency ────────────────────────

/**
 * PUT /:id
 *
 * Replaces the `title` and `graph_data` of an existing diagram, incrementing
 * `version` by 1. Performs an optimistic concurrency check: if the `version`
 * in the request body does not match the current DB version, a 409 Conflict
 * is returned.
 *
 * The concurrency check is made atomic by issuing a single
 * `UPDATE … WHERE id = ? AND user_id = ? AND version = ?`. If zero rows are
 * affected, a subsequent read determines whether it was a 404 (not found /
 * not owned) or a 409 (version mismatch).
 *
 * @returns 200 with `{ data: DiagramResponse }` on success,
 *   400 on validation error, 404 if not found/not owned, 409 on conflict.
 */
diagramsRouter.put("/:id", async (c) => {
	const email = c.get("userEmail");
	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);
	const id = c.req.param("id");

	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (!user) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "User not found"), 401);
	}

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		return c.json(error(ErrorCode.VALIDATION_ERROR, "Request body must be valid JSON"), 400);
	}

	const titleError = validateTitle(body.title);
	if (titleError) {
		return c.json(error(ErrorCode.VALIDATION_ERROR, titleError), 400);
	}

	const graphDataError = validateGraphData(body.graph_data);
	if (graphDataError) {
		return c.json(error(ErrorCode.VALIDATION_ERROR, graphDataError), 400);
	}

	if (typeof body.version !== "number" || !Number.isInteger(body.version)) {
		return c.json(error(ErrorCode.VALIDATION_ERROR, "version must be an integer"), 400);
	}

	const requestVersion = body.version as number;
	const now = Date.now();

	// Atomic update: only succeeds if both ownership AND version match.
	const result = await db
		.update(diagrams)
		.set({
			title: body.title as string,
			graphData: JSON.stringify(body.graph_data),
			version: requestVersion + 1,
			updatedAt: now,
		})
		.where(and(eq(diagrams.id, id), eq(diagrams.userId, user.id), eq(diagrams.version, requestVersion)));

	if (result.meta.changes === 0) {
		// Zero rows affected — determine whether 404 or 409.
		const [existing] = await db
			.select()
			.from(diagrams)
			.where(and(eq(diagrams.id, id), eq(diagrams.userId, user.id)))
			.limit(1);

		if (!existing) {
			return c.json(error(ErrorCode.NOT_FOUND, "Diagram not found"), 404);
		}

		// Diagram exists but version didn't match → concurrency conflict.
		return c.json(error(ErrorCode.CONFLICT, "Diagram has been modified by another session. Please reload."), 409);
	}

	// Re-fetch to return the updated state.
	const [updated] = await db
		.select()
		.from(diagrams)
		.where(and(eq(diagrams.id, id), eq(diagrams.userId, user.id)))
		.limit(1);

	if (!updated) {
		return c.json(error(ErrorCode.INTERNAL_ERROR, "Failed to retrieve updated diagram"), 500);
	}

	return c.json(success(serializeDiagram(updated)));
});

// ── PATCH /:id — Rename ───────────────────────────────────────────────────────

/**
 * PATCH /:id
 *
 * Updates only the `title` of a diagram. Does not change `version` — this is
 * intentional; a rename is not a structural edit that would conflict with
 * a canvas save.
 *
 * @returns 200 with `{ data: DiagramResponse }` on success,
 *   400 on validation error, 404 if not found/not owned.
 */
diagramsRouter.patch("/:id", async (c) => {
	const email = c.get("userEmail");
	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);
	const id = c.req.param("id");

	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (!user) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "User not found"), 401);
	}

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		return c.json(error(ErrorCode.VALIDATION_ERROR, "Request body must be valid JSON"), 400);
	}

	const titleError = validateTitle(body.title);
	if (titleError) {
		return c.json(error(ErrorCode.VALIDATION_ERROR, titleError), 400);
	}

	const now = Date.now();
	const result = await db
		.update(diagrams)
		.set({ title: body.title as string, updatedAt: now })
		.where(and(eq(diagrams.id, id), eq(diagrams.userId, user.id)));

	if (result.meta.changes === 0) {
		return c.json(error(ErrorCode.NOT_FOUND, "Diagram not found"), 404);
	}

	const [updated] = await db
		.select()
		.from(diagrams)
		.where(and(eq(diagrams.id, id), eq(diagrams.userId, user.id)))
		.limit(1);

	if (!updated) {
		return c.json(error(ErrorCode.INTERNAL_ERROR, "Failed to retrieve updated diagram"), 500);
	}

	return c.json(success(serializeDiagram(updated)));
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────

/**
 * DELETE /:id
 *
 * Permanently deletes a diagram. Returns 204 No Content on success, or 404 if
 * the diagram does not exist or is owned by a different user.
 *
 * @returns 204 on success, 404 if not found/not owned.
 */
diagramsRouter.delete("/:id", async (c) => {
	const email = c.get("userEmail");
	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);
	const id = c.req.param("id");

	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (!user) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "User not found"), 401);
	}

	const result = await db.delete(diagrams).where(and(eq(diagrams.id, id), eq(diagrams.userId, user.id)));

	if (result.meta.changes === 0) {
		return c.json(error(ErrorCode.NOT_FOUND, "Diagram not found"), 404);
	}

	return new Response(null, { status: 204 });
});

// ── POST /:id/duplicate ───────────────────────────────────────────────────────

/**
 * POST /:id/duplicate
 *
 * Clones an existing diagram for the authenticated user. The copy gets a new
 * ULID, title `<original> (Copy)` (truncated to 80 chars if needed),
 * `version = 1`, and the same `graph_data` as the source.
 *
 * @returns 201 with `{ data: DiagramResponse }` for the new diagram,
 *   or 404 if the source diagram is not found or not owned.
 */
diagramsRouter.post("/:id/duplicate", async (c) => {
	const email = c.get("userEmail");
	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);
	const id = c.req.param("id");

	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (!user) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "User not found"), 401);
	}

	const [source] = await db
		.select()
		.from(diagrams)
		.where(and(eq(diagrams.id, id), eq(diagrams.userId, user.id)))
		.limit(1);

	if (!source) {
		return c.json(error(ErrorCode.NOT_FOUND, "Diagram not found"), 404);
	}

	const copyTitle = `${source.title} (Copy)`.slice(0, MAX_TITLE_LENGTH);
	const now = Date.now();

	const newDiagram: DiagramRow = {
		id: ulid(),
		userId: user.id,
		title: copyTitle,
		graphData: source.graphData,
		version: 1,
		createdAt: now,
		updatedAt: now,
	};

	await db.insert(diagrams).values(newDiagram);

	return c.json(success(serializeDiagram(newDiagram)), 201);
});

export { diagramsRouter as diagrams };
