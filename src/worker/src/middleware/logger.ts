import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "./auth";

/**
 * Shape of a single structured log entry emitted per request.
 *
 * All fields are serialized to JSON and written to `console.log`, which flows
 * through Cloudflare Logs for production observability.
 */
interface LogEntry {
	/** ISO-8601 timestamp at the time the log entry is written (after the response). */
	timestamp: string;
	/** UUID v4 uniquely identifying this request, set on Hono context as `requestId`. */
	request_id: string;
	/** HTTP method (GET, POST, PUT, etc.). */
	method: string;
	/** Request pathname (e.g., `/api/diagrams/01J…`). */
	path: string;
	/** HTTP response status code. */
	status: number;
	/** Wall-clock duration in milliseconds from request receipt to response sent. */
	duration_ms: number;
	/** Authenticated user's email address — only present on protected routes. */
	user_email?: string;
}

/**
 * Structured JSON logging middleware for every HTTP request.
 *
 * Emits one JSON line per request containing: `timestamp`, `request_id`,
 * `method`, `path`, `status`, `duration_ms`, and `user_email` (when the
 * auth middleware has set it on context).
 *
 * Uses `console.log(JSON.stringify(...))` for Cloudflare Logs compatibility —
 * Cloudflare's log pipeline captures `console.log` calls and makes them
 * queryable via Logpush or the Workers dashboard.
 *
 * Also sets `requestId` on the Hono context so downstream handlers can include
 * it in error responses for request correlation.
 *
 * **Registration order:** This middleware should be registered before the auth
 * middleware so it wraps the full request lifecycle. The `user_email` field is
 * populated after `next()` returns (i.e., after auth middleware has run), so
 * it is available in the log entry even when logger is registered first.
 *
 * @example
 * ```ts
 * app.use(loggerMiddleware);   // registers first — wraps full lifecycle
 * app.use(devAuthMiddleware);
 * app.use(cfAccessMiddleware);
 * ```
 */
export const loggerMiddleware = createMiddleware<{
	Variables: AuthVariables & { requestId: string };
}>(async (c, next) => {
	const requestId = crypto.randomUUID();
	c.set("requestId", requestId);

	const start = Date.now();

	await next();

	const entry: LogEntry = {
		timestamp: new Date().toISOString(),
		request_id: requestId,
		method: c.req.method,
		path: c.req.path,
		status: c.res.status,
		duration_ms: Date.now() - start,
	};

	// userEmail is only set on authenticated routes after auth middleware runs.
	// On public routes or before auth runs, c.get("userEmail") returns undefined.
	try {
		const email = c.get("userEmail");
		if (email) {
			entry.user_email = email;
		}
	} catch {
		// userEmail not set — unauthenticated or public route
	}

	console.log(JSON.stringify(entry));
});
