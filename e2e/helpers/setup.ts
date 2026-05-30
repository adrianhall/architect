import { signDevJwt } from "@adrianhall/cloudflare-auth";
import type { APIRequestContext } from "@playwright/test";

/**
 * The base URL of the locally running CF-Architect worker.
 *
 * Must match the `webServer.url` in `playwright.config.ts`.
 */
const BASE_URL = "http://localhost:8787";

/**
 * The HTTP header that both `developerAuthentication` (dev) and
 * `cloudflareAccess` (production) middleware read to validate the caller's
 * identity.
 */
const JWT_HEADER = "CF-Access-Jwt-Assertion";

/**
 * A test user with their signed development JWT and database ID.
 *
 * The `id` is populated after the user has been provisioned by calling
 * `provisionUser`. It is `undefined` until then.
 */
export interface TestUser {
	/** The email address embedded in the user's JWT. */
	email: string;
	/** A signed development JWT that authenticates this user's requests. */
	token: string;
	/**
	 * The user's database row ID (ULID), populated after calling `provisionUser`.
	 *
	 * Use this with the admin API (e.g. `DELETE /api/admin/users/:id`).
	 */
	id?: string;
}

/**
 * Provisions a user in the local D1 database by hitting `GET /api/me`.
 *
 * The auth middleware auto-creates the user on the first request if they do
 * not already exist. A user whose email matches the worker's `SEED_ADMIN_EMAIL`
 * variable is automatically promoted to the `admin` role.
 *
 * @param apiContext - A Playwright `APIRequestContext` used to make the
 *   provisioning request.
 * @param email - The email address for the user to provision. Used as the
 *   JWT `email` claim and as the unique identity in the database.
 * @returns A `Promise` resolving to a {@link TestUser} containing the email,
 *   signed token, and database row ID returned by `GET /api/me`.
 *
 * @example
 * ```ts
 * const adminUser = await provisionUser(apiContext, "admin@example.com");
 * // adminUser.id is the ULID of the newly created (or existing) user
 * ```
 */
export async function provisionUser(apiContext: APIRequestContext, email: string): Promise<TestUser> {
	const token = await signDevJwt(email);
	const response = await apiContext.get(`${BASE_URL}/api/me`, {
		headers: { [JWT_HEADER]: token },
	});
	const body = (await response.json()) as { data?: { id?: string } };
	return { email, token, id: body.data?.id };
}

/**
 * Creates a diagram in the local D1 database on behalf of the given user.
 *
 * The diagram is created via `POST /api/diagrams` authenticated with the
 * user's development JWT. The diagram has an empty canvas (no nodes or edges).
 *
 * @param apiContext - A Playwright `APIRequestContext` used to make the
 *   create-diagram request.
 * @param user - The user on whose behalf the diagram is created. Must have a
 *   valid `token` (obtained via {@link provisionUser}).
 * @param title - Optional title for the new diagram. Defaults to
 *   `"Diagram by <user.email>"`.
 * @returns A `Promise` resolving to the ULID of the newly created diagram, or
 *   `undefined` if the response body did not include an ID.
 *
 * @example
 * ```ts
 * const diagramId = await createDiagramForUser(apiContext, testUser, "My Arch");
 * ```
 */
export async function createDiagramForUser(
	apiContext: APIRequestContext,
	user: TestUser,
	title?: string,
): Promise<string | undefined> {
	const response = await apiContext.post(`${BASE_URL}/api/diagrams`, {
		headers: {
			[JWT_HEADER]: user.token,
			"Content-Type": "application/json",
		},
		data: { title: title ?? `Diagram by ${user.email}` },
	});
	const body = (await response.json()) as { data?: { id?: string } };
	return body.data?.id;
}

/**
 * Promotes a user to the `admin` role via the admin API.
 *
 * Calls `PATCH /api/admin/users/:userId/role` with `{ role: "admin" }`.
 * The request is authenticated with `adminToken`, which must belong to an
 * existing admin user.
 *
 * @param apiContext - A Playwright `APIRequestContext` used to make the
 *   patch request.
 * @param adminToken - The signed JWT of an admin user authorised to call the
 *   admin API.
 * @param userId - The ULID of the user to promote.
 * @returns A `Promise` that resolves when the promote request completes.
 *
 * @example
 * ```ts
 * await promoteToAdmin(apiContext, adminUser.token, regularUser.id!);
 * ```
 */
export async function promoteToAdmin(apiContext: APIRequestContext, adminToken: string, userId: string): Promise<void> {
	await apiContext.patch(`${BASE_URL}/api/admin/users/${userId}/role`, {
		headers: {
			[JWT_HEADER]: adminToken,
			"Content-Type": "application/json",
		},
		data: { role: "admin" },
	});
}
