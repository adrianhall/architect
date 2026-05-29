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
