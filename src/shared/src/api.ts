/**
 * Standard error codes used across all API endpoints.
 *
 * Maps broadly to HTTP status codes:
 * - `"BAD_REQUEST"` → 400
 * - `"UNAUTHORIZED"` → 401
 * - `"FORBIDDEN"` → 403
 * - `"NOT_FOUND"` → 404
 * - `"CONFLICT"` → 409 (optimistic concurrency collision)
 * - `"INTERNAL_ERROR"` → 500
 */
export type ApiErrorCode = "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";

/**
 * Error detail envelope included in every non-2xx API response.
 *
 * `details` is intentionally typed as `unknown` so that any serialisable
 * value can be attached (e.g. a Zod validation error object, field-level
 * constraint violations, or a concurrency diff). Consumers must narrow the
 * type before use.
 *
 * @example
 * ```ts
 * const err: ApiError = {
 *   code: "NOT_FOUND",
 *   message: "Diagram 01HQ7... does not exist",
 * };
 * ```
 */
export interface ApiError {
	/** Machine-readable error code; use for programmatic error handling. */
	code: ApiErrorCode;
	/** Human-readable description of what went wrong. */
	message: string;
	/**
	 * Optional structured details (e.g. validation errors, conflicting version).
	 * Consumers must narrow this type before use.
	 */
	details?: unknown;
}

/**
 * Envelope for a successful API response.
 *
 * All 2xx responses from the API wrap their payload in this structure so that
 * the client can discriminate success from error by checking for `"data"`.
 *
 * @typeParam T - The type of the response payload.
 *
 * @example
 * ```ts
 * const response: ApiSuccessResponse<User> = {
 *   data: { id: "01HQ...", email: "sasha@example.com", ... },
 * };
 * ```
 */
export interface ApiSuccessResponse<T> {
	/** The response payload. */
	data: T;
}

/**
 * Envelope for a failed API response.
 *
 * All non-2xx responses from the API wrap their error in this structure so
 * that the client can discriminate success from error by checking for
 * `"error"`.
 *
 * @example
 * ```ts
 * const response: ApiErrorResponse = {
 *   error: { code: "NOT_FOUND", message: "Diagram not found" },
 * };
 * ```
 */
export interface ApiErrorResponse {
	/** The error detail. */
	error: ApiError;
}

/**
 * Discriminated union of all possible API responses.
 *
 * Use the presence of `"data"` or `"error"` to narrow to the correct branch:
 *
 * @typeParam T - The success payload type.
 *
 * @example
 * ```ts
 * const response: ApiResponse<User> = await fetchUser(id);
 * if ("data" in response) {
 *   console.log(response.data.email);
 * } else {
 *   console.error(response.error.code);
 * }
 * ```
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
