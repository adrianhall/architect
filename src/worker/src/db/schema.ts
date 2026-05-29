import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Users table — accounts provisioned on first Cloudflare Access login.
 *
 * The primary key is a ULID (text, lexicographically sortable) rather than an
 * auto-increment integer, which allows IDs to be generated application-side
 * before insertion and makes cross-shard distribution trivial if D1 is ever
 * sharded.
 *
 * `created_at` and `updated_at` are stored as Unix timestamps in milliseconds
 * using `integer` with `mode: "number"` so they are directly usable as JS
 * `Date.now()` values without conversion.
 */
export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	name: text("name"),
	avatarUrl: text("avatar_url"),
	role: text("role", { enum: ["user", "admin"] })
		.notNull()
		.default("user"),
	createdAt: integer("created_at", { mode: "number" }).notNull(),
	updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

/**
 * Diagrams table — architecture diagrams owned by users.
 *
 * `graph_data` stores the full JSON representation of the diagram
 * (`{ nodes, edges, viewport }`) as a text column. Parsing and validation
 * happen at the application layer, not in the database.
 *
 * The `version` column enables optimistic concurrency control: a `PUT` that
 * sends a stale version receives a `409 Conflict` response. Defaults to `1`
 * on creation.
 *
 * `user_id` has a foreign key reference to `users.id` to enforce referential
 * integrity at the SQLite level.
 */
export const diagrams = sqliteTable("diagrams", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id),
	title: text("title").notNull(),
	graphData: text("graph_data").notNull(),
	version: integer("version").notNull().default(1),
	createdAt: integer("created_at", { mode: "number" }).notNull(),
	updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});
