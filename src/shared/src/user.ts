/**
 * The set of roles a user can hold within the system.
 *
 * - `"user"` — standard authenticated user; can manage their own diagrams.
 * - `"admin"` — elevated privileges; can manage all users via the admin API.
 *
 * This mirrors the `role` column constraint in the `users` D1 table.
 */
export type UserRole = "user" | "admin";

/**
 * User profile as returned by the `/api/me` and `/api/admin/users` endpoints.
 *
 * All timestamps are Unix timestamps in milliseconds (matching the `INTEGER`
 * columns in D1). `name` and `avatarUrl` are nullable because they are sourced
 * from the IdP and may not be provided by all identity providers.
 *
 * @example
 * ```ts
 * const user: User = {
 *   id: "01HQ7ABC...",
 *   email: "sasha@example.com",
 *   name: "Sasha",
 *   avatarUrl: null,
 *   role: "user",
 *   createdAt: 1716000000000,
 *   updatedAt: 1716000000000,
 * };
 * ```
 */
export interface User {
	/** ULID primary key. */
	id: string;
	/** Email address from the Cloudflare Access JWT `email` claim. */
	email: string;
	/** Display name sourced from the IdP; `null` when not provided. */
	name: string | null;
	/** Avatar URL sourced from the IdP; `null` when not provided. */
	avatarUrl: string | null;
	/** The user's current role in the system. */
	role: UserRole;
	/** Unix timestamp (ms) when the user record was created. */
	createdAt: number;
	/** Unix timestamp (ms) when the user record was last updated. */
	updatedAt: number;
}
