import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.js";

/**
 * Fully-typed Drizzle database instance backed by a D1 binding.
 *
 * Parameterised with `typeof schema` so all relational query helpers
 * (`db.query.users.findMany(...)`, etc.) are available with correct return
 * types.
 */
export type Database = DrizzleD1Database<typeof schema>;

/**
 * Create a typed Drizzle DB instance from the D1 binding.
 *
 * Call this once per request handler — Drizzle is lightweight and stateless;
 * it does not pool connections or hold onto the D1 binding between requests.
 * Passing the binding per-request keeps the function pure and testable.
 *
 * @param d1 - The D1Database binding from the Worker environment (typically
 *   `env.DB`). The type comes from `@cloudflare/workers-types` or the
 *   generated `worker-configuration.d.ts`.
 * @returns A fully typed Drizzle instance with the schema attached, ready
 *   for queries, inserts, updates, and deletes.
 *
 * @example
 * ```ts
 * // In a Hono route handler:
 * app.get("/api/users/:id", async (c) => {
 *   const db = getDb(c.env.DB);
 *   const user = await db.query.users.findFirst({
 *     where: (u, { eq }) => eq(u.id, c.req.param("id")),
 *   });
 *   return c.json({ data: user });
 * });
 * ```
 */
export function getDb(d1: D1Database): Database {
	return drizzle(d1, { schema });
}

export { schema };
