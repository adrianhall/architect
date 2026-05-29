/**
 * Cloudflare Worker entry point for the CF-Architect API.
 *
 * This is a placeholder implementation that returns a static response.
 * The full Hono application — with routes, middleware, and D1 database access —
 * will be wired up in subsequent issues (ISSUE-02 through ISSUE-05).
 *
 * @example
 * // wrangler.jsonc (generated in ISSUE-02):
 * // { "name": "cf-architect", "main": "src/index.ts" }
 */
export default {
	/**
	 * Handles all incoming HTTP requests to the Worker.
	 *
	 * @param _request - The incoming HTTP request (unused in this placeholder).
	 * @param _env - Worker environment bindings (unused in this placeholder).
	 * @param _ctx - Execution context for `waitUntil` and `passThroughOnException` (unused).
	 * @returns A plain-text 200 response indicating the Worker is not yet implemented.
	 */
	async fetch(_request: Request, _env: unknown, _ctx: ExecutionContext): Promise<Response> {
		return new Response("CF-Architect API — not yet implemented", { status: 200 });
	},
};
