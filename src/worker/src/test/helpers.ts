import { JWT_HEADER, signDevJwt } from "@adrianhall/cloudflare-auth";

// Re-export for convenience in test files so they don't need to import
// directly from @adrianhall/cloudflare-auth.
export { JWT_HEADER, signDevJwt };

/**
 * Creates an authenticated `Request` object pre-loaded with a valid dev JWT.
 *
 * Signs a JWT for the given email using `signDevJwt` and sets it as the
 * `cf-access-jwt-assertion` header (`JWT_HEADER`). The request is accepted by
 * `cloudflareAccess` middleware without any redirect to the login form.
 *
 * @param url - Full URL string (e.g., `"http://localhost/api/me"`).
 * @param email - Email address to embed in the JWT `email` claim.
 * @param init - Optional `RequestInit` options (method, body, extra headers, …).
 *   Any headers provided in `init.headers` are merged with the JWT header;
 *   the JWT header takes precedence.
 * @returns A `Promise` resolving to a `Request` with the JWT header set.
 *
 * @example
 * ```ts
 * const req = await createAuthenticatedRequest("http://localhost/api/me", "alice@example.com");
 * const res = await app.fetch(req, env);
 * expect(res.status).toBe(200);
 * ```
 */
export async function createAuthenticatedRequest(url: string, email: string, init?: RequestInit): Promise<Request> {
	const token = await signDevJwt(email);
	const headers = new Headers(init?.headers);
	headers.set(JWT_HEADER, token);

	return new Request(url, {
		...init,
		headers,
	});
}

/**
 * Creates a minimal mock Cloudflare `env` object for use in Vitest tests
 * that do not have access to the full Miniflare `env` binding.
 *
 * Provides the required `CLOUDFLARE_TEAM_DOMAIN` and `SEED_ADMIN_EMAIL` vars
 * with safe placeholder values. Pass `overrides` to replace individual fields
 * or inject mock bindings (e.g., a custom `DB` mock).
 *
 * @param overrides - Partial env object merged on top of the defaults.
 * @returns A plain object shaped like the worker's `Env` type with test values.
 *
 * @example
 * ```ts
 * const env = createMockEnv({ DB: mockDb });
 * const res = await app.fetch(req, env);
 * ```
 */
export function createMockEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com",
		SEED_ADMIN_EMAIL: "admin@test.com",
		...overrides,
	};
}

/**
 * Factory for generating test user records with Drizzle-compatible property names.
 *
 * Returns a plain object that can be passed directly to
 * `db.insert(users).values(...)`. All fields default to safe test values;
 * pass `overrides` to customise individual fields.
 *
 * Property names match the Drizzle schema definitions (camelCase), not the
 * underlying SQL column names (snake_case).
 *
 * @param overrides - Partial user fields to override the defaults.
 * @returns A complete user record ready for database insertion or assertion.
 *
 * @example
 * ```ts
 * const admin = createTestUser({ email: "admin@example.com", role: "admin" });
 * await db.insert(users).values(admin);
 * ```
 */
export function createTestUser(
	overrides: Partial<{
		id: string;
		email: string;
		name: string | null;
		avatarUrl: string | null;
		role: "user" | "admin";
		createdAt: number;
		updatedAt: number;
	}> = {},
): {
	id: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	role: "user" | "admin";
	createdAt: number;
	updatedAt: number;
} {
	const now = Date.now();
	return {
		id: overrides.id ?? "01JTEST000000000000000000",
		email: overrides.email ?? "test@example.com",
		name: overrides.name ?? "test",
		avatarUrl: overrides.avatarUrl ?? null,
		role: overrides.role ?? "user",
		createdAt: overrides.createdAt ?? now,
		updatedAt: overrides.updatedAt ?? now,
	};
}

/**
 * Factory for generating test diagram records with Drizzle-compatible property names.
 *
 * Returns a plain object that can be passed directly to
 * `db.insert(diagrams).values(...)`. All fields default to safe test values;
 * pass `overrides` to customise individual fields.
 *
 * Property names match the Drizzle schema definitions (camelCase), not the
 * underlying SQL column names (snake_case).
 *
 * @param overrides - Partial diagram fields to override the defaults.
 * @returns A complete diagram record ready for database insertion or assertion.
 *
 * @example
 * ```ts
 * const diagram = createTestDiagram({ title: "My Architecture", userId: user.id });
 * await db.insert(diagrams).values(diagram);
 * ```
 */
export function createTestDiagram(
	overrides: Partial<{
		id: string;
		userId: string;
		title: string;
		graphData: string;
		version: number;
		createdAt: number;
		updatedAt: number;
	}> = {},
): {
	id: string;
	userId: string;
	title: string;
	graphData: string;
	version: number;
	createdAt: number;
	updatedAt: number;
} {
	const now = Date.now();
	return {
		id: overrides.id ?? "01JTEST000000000000000001",
		userId: overrides.userId ?? "01JTEST000000000000000000",
		title: overrides.title ?? "Test Diagram",
		graphData: overrides.graphData ?? JSON.stringify({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
		version: overrides.version ?? 1,
		createdAt: overrides.createdAt ?? now,
		updatedAt: overrides.updatedAt ?? now,
	};
}
