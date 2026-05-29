import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { diagrams, users } from "../schema.js";

describe("users schema", () => {
	it("should have table name 'users'", () => {
		expect(getTableName(users)).toBe("users");
	});

	it("should have all required columns", () => {
		const columns = getTableColumns(users);
		expect(columns.id).toBeDefined();
		expect(columns.email).toBeDefined();
		expect(columns.name).toBeDefined();
		expect(columns.avatarUrl).toBeDefined();
		expect(columns.role).toBeDefined();
		expect(columns.createdAt).toBeDefined();
		expect(columns.updatedAt).toBeDefined();
	});

	it("should have id as primary key", () => {
		const columns = getTableColumns(users);
		expect(columns.id.primary).toBe(true);
	});

	it("should have email as unique and not null", () => {
		const columns = getTableColumns(users);
		expect(columns.email.isUnique).toBe(true);
		expect(columns.email.notNull).toBe(true);
	});

	it("should default role to 'user'", () => {
		const columns = getTableColumns(users);
		expect(columns.role.hasDefault).toBe(true);
	});
});

describe("diagrams schema", () => {
	it("should have table name 'diagrams'", () => {
		expect(getTableName(diagrams)).toBe("diagrams");
	});

	it("should have all required columns", () => {
		const columns = getTableColumns(diagrams);
		expect(columns.id).toBeDefined();
		expect(columns.userId).toBeDefined();
		expect(columns.title).toBeDefined();
		expect(columns.graphData).toBeDefined();
		expect(columns.version).toBeDefined();
		expect(columns.createdAt).toBeDefined();
		expect(columns.updatedAt).toBeDefined();
	});

	it("should have version default to 1", () => {
		const columns = getTableColumns(diagrams);
		expect(columns.version.hasDefault).toBe(true);
	});
});
