import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { ErrorCode } from "../lib/errors";

/**
 * Concrete Drizzle database type shared by all repository modules.
 *
 * Matches the type returned by `drizzle(d1)` when called without a schema
 * argument, which is the pattern used by all route handlers in this project.
 * Centralised here so every repository imports from a single source rather
 * than repeating the type alias.
 */
export type Db = DrizzleD1Database<Record<string, never>>;

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
 *     return c.json(error(err.code, err.message), err.statusHint as ContentfulStatusCode);
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
	 * @param statusHint - Suggested HTTP status code (e.g., 400, 401, 404, 500).
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
