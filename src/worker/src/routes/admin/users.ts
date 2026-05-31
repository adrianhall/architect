import { parseIntOrDefault } from "@architect/shared";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { convertErrorOrThrow, ErrorCode } from "../../lib/errors";
import { error, success } from "../../lib/response";
import type { AuthVariables } from "../../middleware/auth";
import {
	auditActionForRole,
	deleteUser,
	type ListParams,
	listUsers,
	resolveActor,
	serializeAdminUser,
	updateUserRole,
	VALID_ROLES,
} from "../../repositories";

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
 * Admin Users router — all `/api/admin/users` endpoints.
 *
 * All routes in this router are protected by the `adminGuard` middleware
 * applied in `index.ts` before this router is registered. The guard has
 * already verified that the request carries a valid admin session; any
 * subsequent 401/403 responses from these handlers are defensive only.
 *
 * Endpoints:
 * - `GET /`           — Paginated, sortable, searchable user list with per-user
 *   diagram counts (computed via LEFT JOIN + GROUP BY in the repository).
 * - `PATCH /:id/role` — Promote or demote a user; self-action is blocked.
 * - `DELETE /:id`     — Delete a user and all their diagrams; self-action is
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

	// ── Parse + clamp query parameters ─────────────────────────────────────────
	const rawPage = Number.parseInt(c.req.query("page") ?? "1", 10);
	const rawLimit = Number.parseInt(c.req.query("limit") ?? "20", 10);
	const rawSort = c.req.query("sort") ?? "created_at";
	const rawOrder = c.req.query("order") ?? "desc";
	const search = c.req.query("search");

	const page = Math.max(1, parseIntOrDefault(rawPage, 1));
	const limit = Math.min(100, Math.max(1, parseIntOrDefault(rawLimit, 20)));

	const params: ListParams = { page, limit, sort: rawSort, order: rawOrder, search };

	const { rows, total } = await listUsers(db, params);
	const totalPages = Math.ceil(total / limit);

	return c.json(
		success({
			users: rows.map(serializeAdminUser),
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
 * @returns 200 with `{ data: AdminUserResponse }`, or 400/401/404 on error.
 */
adminUsersRouter.patch("/:id/role", async (c) => {
	const db = drizzle(c.env.DB);
	const actorEmail = c.get("userEmail");
	const targetId = c.req.param("id");

	// Parse and validate request body before any DB work.
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

	try {
		const actor = await resolveActor(db, actorEmail);
		const updated = await updateUserRole(db, actor, targetId, role as (typeof VALID_ROLES)[number]);

		const action = auditActionForRole(role as (typeof VALID_ROLES)[number]);
		console.log(
			JSON.stringify({
				event: "admin_action",
				action,
				actor_id: actor.id,
				actor_email: actor.email,
				target_id: targetId,
				target_email: updated.email,
				timestamp: new Date().toISOString(),
			}),
		);

		return c.json(success(serializeAdminUser(updated)));
	} catch (err) {
		return convertErrorOrThrow(c, err);
	}
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
 * @returns 204 No Content on success, or 400/401/404 on error.
 */
adminUsersRouter.delete("/:id", async (c) => {
	const db = drizzle(c.env.DB);
	const actorEmail = c.get("userEmail");
	const targetId = c.req.param("id");

	try {
		const actor = await resolveActor(db, actorEmail);
		const deleted = await deleteUser(db, actor, targetId);

		console.log(
			JSON.stringify({
				event: "admin_action",
				action: "delete_user",
				actor_id: actor.id,
				actor_email: actor.email,
				target_id: deleted.id,
				target_email: deleted.email,
				timestamp: new Date().toISOString(),
			}),
		);

		return new Response(null, { status: 204 });
	} catch (err) {
		return convertErrorOrThrow(c, err);
	}
});

export default adminUsersRouter;
