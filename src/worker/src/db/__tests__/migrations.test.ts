import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/**
 * Migration smoke tests.
 *
 * These tests verify that the SQL migration was applied correctly to the
 * Miniflare in-memory D1 database.  They query the SQLite system tables
 * (`sqlite_master`) directly — independent of Drizzle — so they confirm the
 * actual database schema, not just the ORM layer.
 *
 * A failure here means the migration SQL itself is wrong or was never applied,
 * even if the Drizzle schema definition looks correct.
 */
describe("D1 migrations", () => {
	describe("users table", () => {
		it("should exist in the database", async () => {
			const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first<{
				name: string;
			}>();
			expect(result?.name).toBe("users");
		});

		it("should have all required columns", async () => {
			const rows = await env.DB.prepare("PRAGMA table_info(users)").all<{
				name: string;
			}>();
			const cols = rows.results.map((r) => r.name);
			expect(cols).toContain("id");
			expect(cols).toContain("email");
			expect(cols).toContain("name");
			expect(cols).toContain("avatar_url");
			expect(cols).toContain("role");
			expect(cols).toContain("created_at");
			expect(cols).toContain("updated_at");
		});

		it("should have a unique index on the email column", async () => {
			const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users'").all<{
				name: string;
			}>();
			const indexNames = rows.results.map((r) => r.name);
			// Drizzle generates the unique index as users_email_unique
			expect(indexNames).toContain("users_email_unique");
		});

		it("should enforce the email unique constraint", async () => {
			const now = Date.now();
			await env.DB.prepare(
				"INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?1, ?2, 'user', ?3, ?3)",
			)
				.bind("test-unique-id-1", "unique@example.com", now)
				.run();

			await expect(
				env.DB.prepare("INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?1, ?2, 'user', ?3, ?3)")
					.bind("test-unique-id-2", "unique@example.com", now)
					.run(),
			).rejects.toThrow();

			// Cleanup
			await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind("test-unique-id-1").run();
		});
	});

	describe("diagrams table", () => {
		it("should exist in the database", async () => {
			const result = await env.DB.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='diagrams'",
			).first<{ name: string }>();
			expect(result?.name).toBe("diagrams");
		});

		it("should have all required columns", async () => {
			const rows = await env.DB.prepare("PRAGMA table_info(diagrams)").all<{
				name: string;
			}>();
			const cols = rows.results.map((r) => r.name);
			expect(cols).toContain("id");
			expect(cols).toContain("user_id");
			expect(cols).toContain("title");
			expect(cols).toContain("graph_data");
			expect(cols).toContain("version");
			expect(cols).toContain("created_at");
			expect(cols).toContain("updated_at");
		});

		it("should enforce the foreign key constraint on user_id", async () => {
			// D1/SQLite does not enforce FK by default — PRAGMA foreign_keys must be ON.
			// Miniflare enables FK enforcement; verify by attempting an orphaned insert.
			await expect(
				env.DB.prepare(
					"INSERT INTO diagrams (id, user_id, title, graph_data, version, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
				)
					.bind("diag-orphan", "nonexistent-user", "Test", "{}", Date.now())
					.run(),
			).rejects.toThrow();
		});

		it("should default version to 1", async () => {
			const now = Date.now();
			// Insert a parent user first
			await env.DB.prepare(
				"INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?1, ?2, 'user', ?3, ?3)",
			)
				.bind("version-user", "version-test@example.com", now)
				.run();

			// Insert diagram without specifying version
			await env.DB.prepare(
				"INSERT INTO diagrams (id, user_id, title, graph_data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
			)
				.bind("version-diag", "version-user", "Version Test", "{}", now)
				.run();

			const row = await env.DB.prepare("SELECT version FROM diagrams WHERE id = ?1")
				.bind("version-diag")
				.first<{ version: number }>();

			expect(row?.version).toBe(1);

			// Cleanup
			await env.DB.prepare("DELETE FROM diagrams WHERE id = ?1").bind("version-diag").run();
			await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind("version-user").run();
		});
	});
});
