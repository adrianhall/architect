import { Hono } from "hono";
import { success } from "../lib/response";

/**
 * Version route — `GET /api/version`.
 *
 * A simple public endpoint that returns the current application version.
 * No authentication is required; it is explicitly excluded from auth
 * policies in {@link authPolicies} so the middleware chain bypasses JWT
 * validation for this path.
 *
 * @example
 * ```ts
 * // Mount on the main app:
 * app.route("/api/version", version);
 * // GET /api/version → { data: { version: "1.0.0" } }
 * ```
 */
const version = new Hono();

/**
 * GET /
 *
 * Returns the application version in the standard success envelope.
 * No authentication required.
 *
 * @returns `{ data: { version: string } }` with HTTP 200.
 */
version.get("/", (c) => {
	return c.json(success({ version: "1.0.0" }));
});

export { version };
