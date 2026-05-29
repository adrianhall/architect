import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { users } from "../db/schema";
import { ErrorCode } from "../lib/errors";
import { error } from "../lib/response";
import type { AuthVariables } from "./auth";

/**
 * Admin role guard middleware.
 *
 * Queries the `users` table in D1 to verify the authenticated user has the
 * `"admin"` role before allowing the request to proceed. Returns:
 *
 * - **401** if `userEmail` is absent from context (auth middleware did not run
 *   or the route is not protected).
 * - **403** if the user is not found in the database or their `role` is not
 *   `"admin"`.
 *
 * **Registration requirement:** Must be registered *after* both
 * `devAuthMiddleware` and `cfAccessMiddleware` so that `userEmail` is
 * guaranteed to be set on the context for authenticated paths.
 *
 * @example
 * ```ts
 * // Protect a single route:
 * app.get("/api/admin/users", adminGuard, usersHandler);
 *
 * // Or protect a group of routes by registering on a sub-app:
 * const adminRouter = new Hono();
 * adminRouter.use(adminGuard);
 * adminRouter.get("/users", usersHandler);
 * app.route("/api/admin", adminRouter);
 * ```
 */
export const adminGuard = createMiddleware<{
	Bindings: { DB: D1Database };
	Variables: AuthVariables;
}>(async (c, next) => {
	const email = c.get("userEmail");

	if (!email) {
		return c.json(error(ErrorCode.UNAUTHORIZED, "Authentication required"), 401);
	}

	const db = drizzle(c.env.DB);
	const [user] = await db.select({ role: users.role }).from(users).where(eq(users.email, email)).limit(1);

	if (user?.role !== "admin") {
		return c.json(error(ErrorCode.FORBIDDEN, "Admin access required"), 403);
	}

	await next();
});
