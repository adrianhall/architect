import {
	type AuthVariables,
	cloudflareAccess,
	developerAuthentication,
	type PathPolicy,
} from "@adrianhall/cloudflare-auth";

/**
 * Path-based authentication policies for the CF-Architect API.
 *
 * Policies are evaluated in first-match-wins order by both
 * `developerAuthentication` and `cloudflareAccess` middleware.
 *
 * Rules:
 * - `/api/version` is public (health check / version endpoint, no auth required).
 * - `/api/*` is protected (requires a valid Cloudflare Access JWT).
 * - `/_auth/*` is intentionally absent — `developerAuthentication` owns those
 *   paths internally. Adding `/_auth/*` here would cause the login form handler
 *   to never be reached (returns 404).
 */
export const authPolicies: PathPolicy[] = [
	{ pattern: /^\/api\/version$/, authenticate: false },
	{ pattern: /^\/api\//, authenticate: true },
];

/**
 * Developer authentication middleware.
 *
 * In production this middleware is a no-op — Cloudflare Access has already
 * injected the signed JWT header and `CF_Authorization` cookie before the
 * request reaches the Worker.
 *
 * In local development (where no Cloudflare Access is in the loop), this
 * middleware drives a one-time PIN–style login form at `/_auth/login`,
 * signs a dev JWT via HMAC, and sets the `CF_Authorization` cookie so that
 * subsequent requests are treated as authenticated.
 *
 * **Must be registered BEFORE {@link cfAccessMiddleware}.**
 * If the order is reversed, `cfAccessMiddleware` will reject dev requests
 * before `devAuthMiddleware` has had a chance to inject the headers.
 *
 * @example
 * ```ts
 * app.use(devAuthMiddleware);   // FIRST
 * app.use(cfAccessMiddleware);  // SECOND
 * ```
 */
export const devAuthMiddleware = developerAuthentication({
	policies: authPolicies,
});

/**
 * Cloudflare Access JWT validation middleware.
 *
 * Validates the `cf-access-jwt-assertion` header (or `CF_Authorization` cookie)
 * using one of two methods:
 * 1. HMAC verification against the built-in dev secret (for dev tokens issued
 *    by {@link devAuthMiddleware}).
 * 2. RS256 verification against the Cloudflare Access JWKS endpoint
 *    (`https://<CLOUDFLARE_TEAM_DOMAIN>/cdn-cgi/access/certs`) for production
 *    tokens.
 *
 * On success, sets `userEmail` and `userSub` on the Hono context so that route
 * handlers can access them via `c.get("userEmail")`.
 *
 * Reads `CLOUDFLARE_TEAM_DOMAIN` from `c.env` to locate the JWKS endpoint.
 * If this variable is missing, production Access JWTs will fail verification.
 *
 * **Must be registered AFTER {@link devAuthMiddleware}.**
 *
 * @example
 * ```ts
 * app.use(devAuthMiddleware);   // FIRST
 * app.use(cfAccessMiddleware);  // SECOND
 * ```
 */
export const cfAccessMiddleware = cloudflareAccess({
	policies: authPolicies,
});

export type { AuthVariables };
