import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { error } from "./response";

/**
 * API error code constants for the CF-Architect application.
 *
 * These string codes are included in every error response body under the
 * `error.code` field, allowing API clients to handle specific error types
 * programmatically without parsing human-readable messages.
 *
 * @example
 * ```ts
 * import { ErrorCode } from "./errors";
 *
 * // In a route handler:
 * return c.json(error(ErrorCode.NOT_FOUND, "Diagram not found"), 404);
 * ```
 */
export const ErrorCode = {
	/** The request lacks valid authentication credentials. */
	UNAUTHORIZED: "UNAUTHORIZED",
	/** The authenticated user does not have permission to perform the action. */
	FORBIDDEN: "FORBIDDEN",
	/** The requested resource does not exist. */
	NOT_FOUND: "NOT_FOUND",
	/** The operation conflicts with existing state (e.g., stale version number). */
	CONFLICT: "CONFLICT",
	/** The request body or query parameters failed validation. */
	VALIDATION_ERROR: "VALIDATION_ERROR",
	/** An unexpected server-side error occurred. */
	INTERNAL_ERROR: "INTERNAL_ERROR",
	/** An admin attempted to perform an action on their own account (e.g., change own role, delete own account). */
	SELF_ACTION_FORBIDDEN: "SELF_ACTION_FORBIDDEN",
} as const;

/**
 * Union type of all valid API error code strings.
 *
 * Derived from the keys of the {@link ErrorCode} constant object, so this type
 * is always in sync with the available codes without duplication.
 *
 * @example
 * ```ts
 * function handleError(code: ErrorCode) { ... }
 * handleError(ErrorCode.NOT_FOUND); // OK
 * handleError("BOGUS");             // TypeScript error
 * ```
 */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Error thrown by repository functions to signal a domain-level failure.
 *
 * Each instance carries an {@link ErrorCode} and a suggested HTTP status code
 * (`statusHint`). Route handlers catch this class via {@link convertErrorOrThrow},
 * which maps it directly to an API error response and re-throws anything else:
 *
 * ```ts
 * try {
 *   const result = await updateUserRole(db, actor, targetId, role);
 *   return c.json(success(serializeAdminUser(result)));
 * } catch (err) {
 *   return convertErrorOrThrow(c, err);
 * }
 * ```
 *
 * Non-repository errors (unexpected DB failures, etc.) are re-thrown by
 * `convertErrorOrThrow` and handled by the global Hono error handler.
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

/**
 * Converts a {@link RepositoryError} to a JSON API error response, or
 * re-throws any other error unchanged.
 *
 * Use this as the single catch handler in every route handler that calls
 * repository functions. It eliminates per-error `if` blocks: known domain
 * errors are mapped to their HTTP equivalents; unexpected errors (DB failures,
 * programmer mistakes) propagate to Hono's global error handler which returns
 * 500 Internal Server Error.
 *
 * @param c - The Hono `Context` for the current request.
 * @param err - The caught value (typed as `unknown` because `catch` bindings
 *   may be anything at runtime).
 * @returns A JSON response body when `err` is a `RepositoryError`.
 * @throws The original `err` when it is not a `RepositoryError`.
 *
 * @example
 * ```ts
 * try {
 *   const actor = await resolveActor(db, actorEmail);
 *   const updated = await updateUserRole(db, actor, targetId, role);
 *   return c.json(success(serializeAdminUser(updated)));
 * } catch (err) {
 *   return convertErrorOrThrow(c, err);
 * }
 * ```
 */
export function convertErrorOrThrow(c: Context, err: unknown) {
	if (err instanceof RepositoryError) {
		return c.json(error(err.code, err.message), err.statusHint as ContentfulStatusCode);
	}
	throw err;
}
