import type { ErrorCode } from "./errors";

/**
 * Wraps a successful result in the standard API success envelope.
 *
 * The caller (route handler) passes the result of this function directly to
 * `c.json()`. HTTP status codes are set by the handler, not by this helper.
 *
 * @param data - The payload to include in the response body.
 * @returns An object shaped as `{ data: T }`, ready to be serialized to JSON.
 *
 * @example
 * ```ts
 * app.get("/api/me", (c) => c.json(success({ email: "alice@example.com" })));
 * // → { "data": { "email": "alice@example.com" } }
 * ```
 */
export function success<T>(data: T): { data: T } {
	return { data };
}

/**
 * Builds a standard API error response body.
 *
 * The caller is responsible for setting the HTTP status code:
 * `c.json(error(...), 404)`. This keeps the helper simple and
 * framework-agnostic, and avoids coupling it to a specific HTTP verb.
 *
 * @param code - One of the {@link ErrorCode} string constants.
 * @param message - A human-readable description of the error.
 * @param details - Optional structured details (e.g., validation field errors).
 *   Omitted from the response body when `undefined`; never serialized as `null`.
 * @returns An object shaped as `{ error: { code, message, details? } }`.
 *
 * @example
 * ```ts
 * // Without details:
 * c.json(error(ErrorCode.NOT_FOUND, "Diagram not found"), 404);
 * // → { "error": { "code": "NOT_FOUND", "message": "Diagram not found" } }
 *
 * // With details:
 * c.json(error(ErrorCode.VALIDATION_ERROR, "Invalid input", { field: "title" }), 400);
 * // → { "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": { "field": "title" } } }
 * ```
 */
export function error(
	code: ErrorCode,
	message: string,
	details?: unknown,
): { error: { code: ErrorCode; message: string; details?: unknown } } {
	return {
		error: {
			code,
			message,
			...(details !== undefined && { details }),
		},
	};
}
