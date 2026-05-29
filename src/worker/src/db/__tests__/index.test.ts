import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "../index.js";

describe("getDb", () => {
	it("should be a function", () => {
		expect(getDb).toBeInstanceOf(Function);
	});

	it("should export schema with users and diagrams tables", () => {
		expect(schema.users).toBeDefined();
		expect(schema.diagrams).toBeDefined();
	});

	it("should return a Drizzle database instance bound to env.DB", () => {
		const db = getDb(env.DB);
		// The Drizzle instance exposes the query builder via the schema namespace.
		expect(db.query.users).toBeDefined();
		expect(db.query.diagrams).toBeDefined();
	});

	it("should be able to run a real query against the migrated D1 database", async () => {
		const db = getDb(env.DB);
		// After migrations, the users table exists and a select returns an empty array.
		const rows = await db.select().from(schema.users);
		expect(rows).toEqual([]);
	});
});
