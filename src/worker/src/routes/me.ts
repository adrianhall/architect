import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { ulid } from "ulid";
import { users } from "../db/schema";
import { ErrorCode } from "../lib/errors";
import { error, success } from "../lib/response";
import type { AuthVariables } from "../middleware/auth";

/**
 * Environment bindings required by the `/api/me` route.
 *
 * Declared as a local type rather than importing `WorkerEnv` so this module
 * stays self-contained and avoids a circular dependency through `types.ts`.
 */
type MeEnv = {
	Bindings: {
		DB: D1Database;
		SEED_ADMIN_EMAIL: string;
	};
	Variables: AuthVariables;
};

/**
 * Me route — `GET /api/me`.
 *
 * Returns the authenticated user's profile. Auto-provisions a new user record
 * in D1 on the first request for a given email (first-login provisioning).
 *
 * If the user's email matches `SEED_ADMIN_EMAIL` (case-insensitive), the new
 * record is created with `role = "admin"`. All other new users receive
 * `role = "user"`.
 *
 * @example
 * ```ts
 * // Mount on the main app:
 * app.route("/api/me", me);
 * // GET /api/me (authenticated) → { data: { id, email, name, ... } }
 * ```
 */
const me = new Hono<MeEnv>();

/**
 * GET /
 *
 * Returns the current user's profile. Auto-provisions a DB record on first
 * request. Returns HTTP 201 for newly created users, 200 for existing users.
 *
 * @returns `{ data: UserProfile }` where `UserProfile` includes `id`, `email`,
 *   `name`, `avatar_url`, `role`, `created_at`, and `updated_at`.
 *   HTTP 201 on first provisioning, 200 on subsequent requests.
 */
me.get("/", async (c) => {
	const email = c.get("userEmail");

	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);

	// Look up existing user by email.
	const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

	if (existingUser) {
		// User already provisioned — return existing profile with 200.
		return c.json(
			success({
				id: existingUser.id,
				email: existingUser.email,
				name: existingUser.name,
				// Drizzle camelCase → snake_case API response
				avatar_url: existingUser.avatarUrl,
				role: existingUser.role,
				created_at: existingUser.createdAt,
				updated_at: existingUser.updatedAt,
			}),
		);
	}

	// Auto-provision: create a new user record on first authenticated request.
	const now = Date.now();
	const seedAdminEmail = c.env.SEED_ADMIN_EMAIL;
	const role: "user" | "admin" =
		seedAdminEmail && email.toLowerCase() === seedAdminEmail.toLowerCase() ? "admin" : "user";

	const newUser = {
		id: ulid(),
		email,
		// Derive a display name from the email prefix; users can update it later.
		name: email.split("@")[0],
		// Drizzle camelCase column names for the insert
		avatarUrl: null,
		role,
		createdAt: now,
		updatedAt: now,
	};

	await db.insert(users).values(newUser);

	// Return 201 Created for the newly provisioned user.
	return c.json(
		success({
			id: newUser.id,
			email: newUser.email,
			name: newUser.name,
			// Drizzle camelCase → snake_case API response
			avatar_url: newUser.avatarUrl,
			role: newUser.role,
			created_at: newUser.createdAt,
			updated_at: newUser.updatedAt,
		}),
		201,
	);
});

export { me };
