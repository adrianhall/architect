import { asc, desc, eq, like, or, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { diagrams, users } from "../../db/schema";
import { ErrorCode } from "../../lib/errors";

/**
 * Concrete Drizzle database type used throughout this repository module.
 *
 * Matches the type returned by `drizzle(d1)` when called without a schema
 * argument, which is the pattern used by all route handlers in this project.
 */
type Db = DrizzleD1Database<Record<string, never>>;

// ── Exported Types ─────────────────────────────────────────────────────────────

/**
 * Shape of a user row returned by admin list queries.
 *
 * The `diagramCount` field is computed via the LEFT JOIN + GROUP BY used to
 * count diagrams without N+1 queries.
 */
export type AdminUserRow = {
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
 * Shape of a bare user row returned directly from the `users` table.
 *
 * Used for operations (update role, delete) that need the user record
 * but do not require the diagram count.
 */
export type BareUserRow = {
	id: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	role: string;
	createdAt: number;
	updatedAt: number;
};

/**
 * API response shape for a single user as returned by admin endpoints.
 *
 * Uses snake_case property names matching the rest of the API wire format.
 * Includes the computed `diagram_count` field.
 */
export type AdminUserResponse = {
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
 * Valid role strings accepted by the role update endpoint.
 */
export type Role = "admin" | "user";

/**
 * Parameters accepted by {@link listUsers}.
 *
 * All numeric fields are expected to be already-clamped to their valid ranges
 * by the caller (the route handler). The `sort` field may be any string; the
 * repository validates it and falls back to `"created_at"` when unknown.
 */
export type ListParams = {
	/** Current page (≥ 1). */
	page: number;
	/** Items per page (1–100). */
	limit: number;
	/** Sort column name; falls back to `"created_at"` when unknown. */
	sort: string;
	/** `"asc"` for ascending; anything else is treated as descending. */
	order: string;
	/** Optional case-insensitive substring to match against `email` and `name`. */
	search?: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Column names accepted as a `sort` query parameter in the user list.
 */
export const VALID_SORT_COLUMNS = ["email", "name", "role", "created_at"] as const;

/** Union type of the valid sort column names. */
type SortColumn = (typeof VALID_SORT_COLUMNS)[number];

/**
 * Maps valid sort column names to their corresponding Drizzle column
 * references. Using an explicit mapping avoids `as any` casts and ensures
 * TypeScript errors if the schema columns are ever renamed.
 */
const SORT_COLUMN_MAP = {
	email: users.email,
	name: users.name,
	role: users.role,
	created_at: users.createdAt,
} as const;

/**
 * Valid role values accepted by the role update endpoint.
 *
 * Exported so that the route handler can use the same list for validation
 * without duplicating the array.
 */
export const VALID_ROLES = ["admin", "user"] as const;

// ── RepositoryError ────────────────────────────────────────────────────────────

/**
 * Error thrown by repository functions to signal a domain-level failure.
 *
 * Each instance carries an {@link ErrorCode} and a suggested HTTP status code
 * (`statusHint`). Route handlers catch this class in a single top-level
 * try/catch and map it directly to an API error response:
 *
 * ```ts
 * try {
 *   const result = await updateUserRole(db, actor, targetId, role);
 *   return c.json(success(serializeAdminUser(result)));
 * } catch (err) {
 *   if (err instanceof RepositoryError) {
 *     return c.json(error(err.code, err.message), err.statusHint as StatusCode);
 *   }
 *   throw err;
 * }
 * ```
 *
 * Non-repository errors (unexpected DB failures, etc.) are re-thrown and
 * handled by the global error handler.
 *
 * @example
 * ```ts
 * throw new RepositoryError(ErrorCode.NOT_FOUND, 404, "User not found");
 * ```
 */
export class RepositoryError extends Error {
	/**
	 * @param code - One of the {@link ErrorCode} constants to include in the
	 *   API error response body.
	 * @param statusHint - Suggested HTTP status code (e.g., 400, 404, 401).
	 * @param message - Human-readable description of the error.
	 */
	constructor(
		public readonly code: ErrorCode,
		public readonly statusHint: number,
		message: string,
	) {
		super(message);
		this.name = "RepositoryError";
	}
}

// ── Serialization Helper ───────────────────────────────────────────────────────

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
export function serializeAdminUser(row: AdminUserRow): AdminUserResponse {
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

// ── Repository Functions ───────────────────────────────────────────────────────

/**
 * Resolves the actor user record by email address.
 *
 * Used at the start of every mutating admin handler to obtain the actor's
 * database ID (required for the self-action guard and audit log). The actor
 * should always exist because the auth middleware ensures the session is valid,
 * but a defensive check is included.
 *
 * @param db - Drizzle D1 database instance.
 * @param email - The actor's email from the authenticated session (JWT claim).
 * @returns The actor's full user row.
 * @throws {@link RepositoryError} with `UNAUTHORIZED` / 401 when no user with
 *   the given email exists in the database.
 *
 * @example
 * ```ts
 * const actor = await resolveActor(db, actorEmail);
 * // actor.id is now available for the self-action check
 * ```
 */
export async function resolveActor(db: Db, email: string): Promise<BareUserRow> {
	const [actor] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	if (!actor) {
		throw new RepositoryError(ErrorCode.UNAUTHORIZED, 401, "Actor user not found");
	}
	return actor;
}

/**
 * Returns a paginated, sortable, searchable list of all users with per-user
 * diagram counts.
 *
 * Diagram counts are computed via a single LEFT JOIN + GROUP BY to avoid N+1
 * queries. `COUNT(diagrams.id)` returns 0 for users with no diagrams because
 * the LEFT JOIN produces NULL `diagrams.id` rows for those users.
 *
 * An unknown `sort` value silently falls back to `"created_at"` so that
 * clients sending an outdated or invalid sort column receive a valid response
 * rather than an error.
 *
 * @param db - Drizzle D1 database instance.
 * @param params - Pagination, sort, and search parameters.
 * @returns An object with `rows` (the current page) and `total` (count of all
 *   matching users, used to compute pagination metadata).
 *
 * @example
 * ```ts
 * const { rows, total } = await listUsers(db, { page: 1, limit: 20, sort: "email", order: "asc" });
 * ```
 */
export async function listUsers(db: Db, params: ListParams): Promise<{ rows: AdminUserRow[]; total: number }> {
	const { page, limit, sort, order, search } = params;
	const offset = (page - 1) * limit;

	// Validate sort column; fall back to created_at for unknown values.
	const sortColumn: SortColumn = (VALID_SORT_COLUMNS as readonly string[]).includes(sort)
		? (sort as SortColumn)
		: "created_at";

	const isAsc = order === "asc";

	const whereClause = search ? or(like(users.email, `%${search}%`), like(users.name, `%${search}%`)) : undefined;

	// Count total matching users (no JOIN) for accurate pagination metadata.
	const [countRow] = await db.select({ total: sql<number>`count(*)` }).from(users).where(whereClause);
	const total = Number(countRow?.total ?? 0);

	const col = SORT_COLUMN_MAP[sortColumn];
	const orderByExpr = isAsc ? asc(col) : desc(col);

	const rows = await db
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

	return { rows, total };
}

/**
 * Fetches a single user row with their diagram count using a LEFT JOIN.
 *
 * Primarily used to return a fully-populated user response after a role update.
 *
 * @param db - Drizzle D1 database instance.
 * @param id - The target user's ULID.
 * @returns The user row with computed `diagramCount`.
 * @throws {@link RepositoryError} with `NOT_FOUND` / 404 when no user with
 *   the given ID exists.
 *
 * @example
 * ```ts
 * const row = await getUserWithDiagramCount(db, "01JUSER...");
 * ```
 */
export async function getUserWithDiagramCount(db: Db, id: string): Promise<AdminUserRow> {
	const [row] = await db
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
		.where(eq(users.id, id))
		.groupBy(users.id, users.email, users.name, users.avatarUrl, users.role, users.createdAt, users.updatedAt)
		.limit(1);

	if (!row) {
		throw new RepositoryError(ErrorCode.NOT_FOUND, 404, "User not found");
	}

	return row;
}

/**
 * Updates the target user's role and returns the updated user row with diagram
 * count.
 *
 * Enforces the self-action guard (admin cannot change their own role) and
 * verifies the target user exists before applying the update.
 *
 * After the update a re-fetch is performed to return the current row including
 * the diagram count. The re-fetch failing is a defensive guard — the row was
 * just updated, so this branch is unreachable in practice.
 *
 * @param db - Drizzle D1 database instance.
 * @param actor - The resolved actor row (from {@link resolveActor}).
 * @param targetId - ULID of the user whose role should change.
 * @param role - The new role to assign (`"admin"` or `"user"`).
 * @returns The updated user row with current diagram count.
 * @throws {@link RepositoryError} with `SELF_ACTION_FORBIDDEN` / 400 when the
 *   actor and target are the same user.
 * @throws {@link RepositoryError} with `NOT_FOUND` / 404 when the target user
 *   does not exist.
 * @throws {@link RepositoryError} with `INTERNAL_ERROR` / 500 if the updated
 *   row cannot be re-fetched (defensive; should be impossible).
 *
 * @example
 * ```ts
 * const actor = await resolveActor(db, actorEmail);
 * const updated = await updateUserRole(db, actor, targetId, "admin");
 * ```
 */
export async function updateUserRole(db: Db, actor: BareUserRow, targetId: string, role: Role): Promise<AdminUserRow> {
	if (actor.id === targetId) {
		throw new RepositoryError(ErrorCode.SELF_ACTION_FORBIDDEN, 400, "Cannot change your own role");
	}

	const [targetUser] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
	if (!targetUser) {
		throw new RepositoryError(ErrorCode.NOT_FOUND, 404, "User not found");
	}

	const now = Date.now();
	await db.update(users).set({ role, updatedAt: now }).where(eq(users.id, targetId));

	// Re-fetch with diagram count. Defensive — the row was just updated.
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

	/* istanbul ignore next */
	if (!updatedRow) {
		throw new RepositoryError(ErrorCode.INTERNAL_ERROR, 500, "Failed to retrieve updated user");
	}

	return updatedRow;
}

/**
 * Returns the audit log fields needed after a role change.
 *
 * Extracted from {@link updateUserRole} to keep the function focused on DB
 * mutations. The route handler uses this to build the structured log entry.
 *
 * @param role - The new role that was applied.
 * @returns `"promote"` when the new role is `"admin"`, `"demote"` otherwise.
 *
 * @example
 * ```ts
 * const action = auditActionForRole("admin"); // "promote"
 * const action = auditActionForRole("user");  // "demote"
 * ```
 */
export function auditActionForRole(role: Role): "promote" | "demote" {
	return role === "admin" ? "promote" : "demote";
}

/**
 * Deletes the target user and all their diagrams (cascade).
 *
 * Enforces the self-action guard (admin cannot delete their own account) and
 * verifies the target user exists before deletion. Diagrams are deleted first
 * to satisfy the foreign-key constraint on `diagrams.user_id`.
 *
 * @param db - Drizzle D1 database instance.
 * @param actor - The resolved actor row (from {@link resolveActor}).
 * @param targetId - ULID of the user to delete.
 * @returns The deleted user's bare row (useful for audit log emission after
 *   deletion, when the row no longer exists in the database).
 * @throws {@link RepositoryError} with `SELF_ACTION_FORBIDDEN` / 400 when the
 *   actor and target are the same user.
 * @throws {@link RepositoryError} with `NOT_FOUND` / 404 when the target user
 *   does not exist.
 *
 * @example
 * ```ts
 * const actor = await resolveActor(db, actorEmail);
 * const deleted = await deleteUser(db, actor, targetId);
 * // deleted.email is still available for the audit log
 * ```
 */
export async function deleteUser(db: Db, actor: BareUserRow, targetId: string): Promise<BareUserRow> {
	if (actor.id === targetId) {
		throw new RepositoryError(ErrorCode.SELF_ACTION_FORBIDDEN, 400, "Cannot delete your own account");
	}

	const [targetUser] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
	if (!targetUser) {
		throw new RepositoryError(ErrorCode.NOT_FOUND, 404, "User not found");
	}

	// Cascade: delete diagrams first, then the user record.
	await db.delete(diagrams).where(eq(diagrams.userId, targetId));
	await db.delete(users).where(eq(users.id, targetId));

	return targetUser;
}
