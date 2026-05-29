import { describe, expect, it } from "vitest";
import type { User, UserRole } from "./user.js";

describe("shared user types", () => {
	it("should allow constructing a User object", () => {
		const user: User = {
			id: "01HQ...",
			email: "sasha@example.com",
			name: "Sasha",
			avatarUrl: null,
			role: "user",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		expect(user.role).toBe("user");
		expect(user.name).toBe("Sasha");
	});

	it("should support both user roles", () => {
		const roles: UserRole[] = ["user", "admin"];
		expect(roles).toHaveLength(2);
	});

	it("should allow null name and avatarUrl", () => {
		const user: User = {
			id: "01HQ...",
			email: "tomas@example.com",
			name: null,
			avatarUrl: null,
			role: "admin",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		expect(user.name).toBeNull();
		expect(user.avatarUrl).toBeNull();
	});

	it("should allow an avatarUrl to be set", () => {
		const user: User = {
			id: "01HQ...",
			email: "admin@example.com",
			name: "Admin User",
			avatarUrl: "https://cdn.example.com/avatar.png",
			role: "admin",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		expect(user.avatarUrl).toBe("https://cdn.example.com/avatar.png");
	});
});
