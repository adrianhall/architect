import { asc, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { diagrams, users } from "../../db/schema";
import { ErrorCode } from "../../lib/errors";
import { error, success } from "../../lib/response";
import type { AuthVariables } from "../../middleware/auth";

/**
 * Environment bindings required by the `/api/admin/users` route set.
 *
 * Declared as a local type (not imported from `WorkerEnv`) to keep this module
 * self-contained, following the same pattern as `routes/diagrams.ts`.
 */
type AdminUsersEnv = {
	Bindings: { DB: D1Database };
	Variables: AuthVariables;
};

/**
 * Allowed values for the `sort` query parameter on `GET /`.
 */
const VALID_SORT_COLUMNS = ["email", "name", "role", "created_at"] as const;
type SortColumn = (typeof VALID_SORT_COLUMNS)[number];

/**
 * Mapping from sort query parameter names to Drizzle column references.
 *
 * Using an explicit record keeps the route handler free of `as any` casts and
 * ensures TypeScript errors if the schema columns are ever renamed.
 */
const SORT_COLUMN_MAP = {
	email: users.email,
	name: users.name,
	role: users.role,
	created_at: users.createdAt,
} as const;

/**
 * Allowed role values for the `PATCH /:id/role` endpoint.
 */
const VALID_ROLES = ["admin", "user"] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * Shape of a user row returned by admin list queries.
 *
 * The `diagramCount` field comes from the LEFT JOIN + GROUP BY used to count
 * diagrams efficiently without N+1 queries.
 */
type AdminUserRow = {
	id: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	role: string;
	createdAt: number;
	updatedAt: number;
	diagramCount: number;
};

/**
 * Shape of a bare user row returned by the users table (no diagram count).
 *
 * Used for update/delete handlers that fetch the user before emitting an
 * audit log, before the diagram count is relevant.
 */
type BareUserRow = {
	id: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	role: string;
	createdAt: number;
	updatedAt: number;
};

/**
 * API response shape for a single user in admin endpoints.
 *
 * Converts Drizzle camelCase property names to the snake_case API convention
 * and includes the computed `diagram_count` field.
 */
type AdminUserResponse = {
	id: string;
	email: string;
	name: string | null;
	avatar_url: string | null;
	role: string;
	diagram_count: number;
	created_at: number;
	updated_at: number;
};

/**
 * Converts an {@link AdminUserRow} to the snake_case API response shape used
 * by all admin user endpoints.
 *
 * @param row - User row with `diagramCount` as returned by the LEFT JOIN query.
 * @returns An {@link AdminUserResponse} ready to be serialized as JSON.
 *
 * @example
 * ```ts
 * const response = serializeAdminUser(row);
 * // { id: "...", email: "...", diagram_count: 5, ... }
 * ```
 */
function serializeAdminUser(row: AdminUserRow): AdminUserResponse {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		avatar_url: row.avatarUrl,
		role: row.role,
		diagram_count: Number(row.diagramCount),
		created_at: row.createdAt,
		updated_at: row.updatedAt,
	};
}

/**
 * Admin Users router — all `/api/admin/users` endpoints.
 *
 * All routes in this router are protected by the `adminGuard` middleware
 * applied in `index.ts` before this router is registered. The guard has
 * already verified that the request carries a valid admin session; any
 * subsequent 401/403 responses from these handlers are defensive only.
 *
 * Endpoints:
 * - `GET /`         — Paginated, sortable, searchable user list with per-user
 *   diagram counts (computed via LEFT JOIN + GROUP BY).
 * - `PATCH /:id/role` — Promote or demote a user; self-action is blocked.
 * - `DELETE /:id`   — Delete a user and all their diagrams; self-action is
 *   blocked.
 *
 * Every mutation emits a structured JSON audit log entry to `console.log`
 * which flows into Cloudflare Logs automatically.
 *
 * @example
 * ```ts
 * // Mount in index.ts after auth middleware and adminGuard:
 * app.use("/api/admin/*", adminGuard);
 * app.route("/api/admin/users", adminUsersRouter);
 * ```
 */
const adminUsersRouter = new Hono<AdminUsersEnv>();

// ── GET / — Paginated User List ───────────────────────────────────────────────

/**
 * GET /
 *
 * Returns a paginated, sortable, searchable list of all users. Each user
 * entry includes a `diagram_count` computed via a LEFT JOIN + GROUP BY so
 * all counts are fetched in a single round-trip.
 *
 * Query parameters:
 * - `page`   (integer ≥ 1, default 1)
 * - `limit`  (integer 1–100, default 20)
 * - `sort`   (`email` | `name` | `role` | `created_at`, default `created_at`)
 * - `order`  (`asc` | `desc`, default `desc`)
 * - `search` (string, optional — case-insensitive LIKE on email and name)
 *
 * @returns 200 with `{ data: { users: AdminUserResponse[], pagination: {...} } }`.
 */
adminUsersRouter.get("/", async (c) => {
	const db = drizzle(c.env.DB);

	// ── Parse + validate query parameters ──────────────────────────────────────
	const rawPage = Number.parseInt(c.req.query("page") ?? "1", 10);
	const rawLimit = Number.parseInt(c.req.query("limit") ?? "20", 10);
	const rawSort = c.req.query("sort") ?? "created_at";
	const rawOrder = c.req.query("order") ?? "desc";
	const search = c.req.query("search");

	const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
	const limit = Math.min(100, Math.max(1, Number.isNaN(rawLimit) ? 20 : rawLimit));
	const offset = (page - 1) * limit;

	const sortColumn: SortColumn = (VALID_SORT_COLUMNS as readonly string[]).includes(rawSort)
		? (rawSort as SortColumn)
		: "created_at";

	const isAsc = rawOrder === "asc";

	// ── Build optional search WHERE clause ─────────────────────────────────────
	const whereClause = search ? or(like(users.email, `%${search}%`), like(users.name, `%${search}%`)) : undefined;

	// ── Count total matching users for pagination metadata ─────────────────────
	// Uses the users table directly (no JOIN) — accurate for pagination.
	const [countRow] = await db.select({ total: sql<number>`count(*)` }).from(users).where(whereClause);
	const total = Number(countRow?.total ?? 0);
	const totalPages = Math.ceil(total / limit);

	// ── Fetch the requested page with per-user diagram counts ──────────────────
	// LEFT JOIN + GROUP BY gives O(1) round-trips for any page size.
	// COUNT(diagrams.id) returns 0 for users with no diagrams because LEFT JOIN
	// produces a NULL diagrams.id for those rows.
	const col = SORT_COLUMN_MAP[sortColumn];
	const orderByExpr = isAsc ? asc(col) : desc(col);

	const userRows = await db
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			avatarUrl: users.avatarUrl,
			role: users.role,
			createdAt: users.createdAt,
			updatedAt: users.updatedAt,
			diagramCount: sql<number>`count(${diagrams.id})`,
		})
		.from(users)
		.leftJoin(diagrams, eq(diagrams.userId, users.id))
		.where(whereClause)
		.groupBy(users.id, users.email, users.name, users.avatarUrl, users.role, users.createdAt, users.updatedAt)
		.orderBy(orderByExpr)
		.limit(limit)
		.offset(offset);

	return c.json(
		success({
			users: userRows.map(serializeAdminUser),
			pagination: { page, limit, total, totalPages },
		}),
	);
});

// ── PATCH /:id/role — Promote or Demote ───────────────────────────────────────

/**
 * PATCH /:id/role
 *
 * Changes the target user's role to `"admin"` or `"user"`. The authenticated
 * admin cannot change their own role (returns 400 with code
 * `SELF_ACTION_FORBIDDEN`).
 *
 * On success, emits a structured JSON audit log to `console.log` with action
 * `"promote"` (→ admin) or `"demote"` (→ user).
 *
 * @returns 200 with `{ data: AdminUserResponse }`, or 400/404 on error.
 */
adminUsersRouter.patch("/:id/role", async (c) => {
	const db = drizzle(c.env.DB);
	const actorEmail = c.get("userEmail");
	const targetId = c.req.param("id");

	// Resolve the actor's full record (id required for self-action check + audit log).
	const [actor] = await db.select().from(users).where(eq(users.email, actorEmail)).limit(1);
	if (!actor) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Actor user not found"), 401);
	}

	// Self-action guard.
	if (actor.id === targetId) {
		return c.json(error(ErrorCode.SELF_ACTION_FORBIDDEN, "Cannot change your own role"), 400);
	}

	// Parse and validate request body.
	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		return c.json(error(ErrorCode.VALIDATION_ERROR, "Request body must be valid JSON"), 400);
	}

	const { role } = body;
	if (!(VALID_ROLES as readonly unknown[]).includes(role)) {
		return c.json(error(ErrorCode.VALIDATION_ERROR, "Role must be 'admin' or 'user'"), 400);
	}

	// Fetch target user (needed for the audit log and 404 check).
	const [targetUser] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
	if (!targetUser) {
		return c.json(error(ErrorCode.NOT_FOUND, "User not found"), 404);
	}

	const newRole = role as Role;
	const action = newRole === "admin" ? "promote" : "demote";
	const now = Date.now();

	// Apply the role change.
	await db.update(users).set({ role: newRole, updatedAt: now }).where(eq(users.id, targetId));

	// Re-fetch the updated user row + diagram count (single user, LEFT JOIN).
	const [updatedRow] = await db
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			avatarUrl: users.avatarUrl,
			role: users.role,
			createdAt: users.createdAt,
			updatedAt: users.updatedAt,
			diagramCount: sql<number>`count(${diagrams.id})`,
		})
		.from(users)
		.leftJoin(diagrams, eq(diagrams.userId, users.id))
		.where(eq(users.id, targetId))
		.groupBy(users.id, users.email, users.name, users.avatarUrl, users.role, users.createdAt, users.updatedAt)
		.limit(1);

	if (!updatedRow) {
		return c.json(error(ErrorCode.INTERNAL_ERROR, "Failed to retrieve updated user"), 500);
	}

	// Emit structured audit log (flows to Cloudflare Logs via console.log).
	console.log(
		JSON.stringify({
			event: "admin_action",
			action,
			actor_id: actor.id,
			actor_email: actor.email,
			target_id: targetUser.id,
			target_email: targetUser.email,
			timestamp: new Date().toISOString(),
		}),
	);

	return c.json(success(serializeAdminUser(updatedRow)));
});

// ── DELETE /:id — Delete User + Cascade Diagrams ──────────────────────────────

/**
 * DELETE /:id
 *
 * Permanently deletes the target user and all their diagrams. The diagrams are
 * deleted first to avoid foreign-key constraint violations. The authenticated
 * admin cannot delete their own account (returns 400 with code
 * `SELF_ACTION_FORBIDDEN`).
 *
 * On success, emits a structured JSON audit log to `console.log` with action
 * `"delete_user"`.
 *
 * @returns 204 No Content on success, or 400/404 on error.
 */
adminUsersRouter.delete("/:id", async (c) => {
	const db = drizzle(c.env.DB);
	const actorEmail = c.get("userEmail");
	const targetId = c.req.param("id");

	// Resolve the actor's full record (id required for self-action check + audit log).
	const [actor] = await db.select().from(users).where(eq(users.email, actorEmail)).limit(1);
	if (!actor) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Actor user not found"), 401);
	}

	// Self-action guard.
	if (actor.id === targetId) {
		return c.json(error(ErrorCode.SELF_ACTION_FORBIDDEN, "Cannot delete your own account"), 400);
	}

	// Fetch target user so we have email for the audit log before deletion.
	const [targetUser] = (await db.select().from(users).where(eq(users.id, targetId)).limit(1)) as BareUserRow[];
	if (!targetUser) {
		return c.json(error(ErrorCode.NOT_FOUND, "User not found"), 404);
	}

	// Cascade: delete diagrams first, then the user record.
	await db.delete(diagrams).where(eq(diagrams.userId, targetId));
	await db.delete(users).where(eq(users.id, targetId));

	// Emit structured audit log (flows to Cloudflare Logs via console.log).
	console.log(
		JSON.stringify({
			event: "admin_action",
			action: "delete_user",
			actor_id: actor.id,
			actor_email: actor.email,
			target_id: targetUser.id,
			target_email: targetUser.email,
			timestamp: new Date().toISOString(),
		}),
	);

	return new Response(null, { status: 204 });
});

export default adminUsersRouter;
