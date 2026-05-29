import type { ApiErrorCode, ApiErrorResponse, ApiSuccessResponse } from "@architect/shared";

/**
 * Error thrown by `apiClient` when the server returns a non-2xx response.
 *
 * Consumers can narrow the error type by checking `instanceof ApiError` and
 * then read the structured `code`, `status`, and optional `details` from the
 * error object instead of parsing raw response bodies.
 *
 * @example
 * ```ts
 * try {
 *   const diagram = await apiClient<Diagram>("diagrams/123");
 * } catch (err) {
 *   if (err instanceof ApiError && err.status === 404) {
 *     // diagram not found
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
	/** Machine-readable error code from the API envelope. */
	readonly code: ApiErrorCode;
	/** HTTP status code of the failed response. */
	readonly status: number;
	/** Optional structured details attached by the server (e.g. validation errors). */
	readonly details?: unknown;

	/**
	 * @param code - Machine-readable error code from the API error envelope.
	 * @param message - Human-readable description of the error.
	 * @param status - HTTP status code of the failed response.
	 * @param details - Optional structured error details from the server.
	 */
	constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
		super(message);
		this.name = "ApiError";
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

/**
 * Typed fetch wrapper used by all TanStack Query hooks.
 *
 * Automatically:
 * - Prepends `/api/` to the path (strips leading slash to avoid double slash)
 * - Sets `Content-Type: application/json` for POST, PUT, and PATCH requests
 *   that include a body (unless the caller already set one)
 * - Unwraps the `data` field from the API success envelope, returning `T`
 *   directly so hook consumers never see the wrapper
 * - Returns `undefined` (cast to `T`) for 204 No Content responses
 * - Throws `ApiError` for any non-2xx response, populated from the
 *   `error` field of the API error envelope
 *
 * @typeParam T - The expected shape of the `data` field in the success envelope.
 * @param path - API path **without** the `/api/` prefix.
 *   Leading slashes are stripped: `"me"` and `"/me"` are both valid.
 * @param options - Standard `RequestInit` options forwarded to `fetch`.
 * @returns The `data` field from the API success envelope, typed as `T`.
 *   Returns `undefined as T` for 204 No Content responses (e.g. DELETE).
 * @throws {ApiError} When the server returns a non-2xx HTTP status.
 *
 * @example
 * ```ts
 * // Simple GET
 * const user = await apiClient<ApiUser>("me");
 *
 * // POST with JSON body (Content-Type set automatically)
 * const diagram = await apiClient<Diagram>("diagrams", {
 *   method: "POST",
 *   body: JSON.stringify({ title: "My Diagram" }),
 * });
 *
 * // DELETE (returns undefined for 204)
 * await apiClient<void>("diagrams/01ABC", { method: "DELETE" });
 * ```
 */
export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
	const url = `/api/${path.replace(/^\//, "")}`;

	const method = options?.method?.toUpperCase() ?? "GET";
	const headers = new Headers(options?.headers);

	// Automatically set Content-Type for mutating methods that include a body.
	if (["POST", "PUT", "PATCH"].includes(method) && options?.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const res = await fetch(url, { ...options, headers });

	// 204 No Content — DELETE and some PATCH responses return no body.
	if (res.status === 204) {
		return undefined as T;
	}

	const body = await res.json();

	if (!res.ok) {
		const errorBody = body as ApiErrorResponse;
		throw new ApiError(
			errorBody.error?.code ?? "INTERNAL_ERROR",
			errorBody.error?.message ?? `Request failed with status ${res.status}`,
			res.status,
			errorBody.error?.details,
		);
	}

	return (body as ApiSuccessResponse<T>).data;
}
