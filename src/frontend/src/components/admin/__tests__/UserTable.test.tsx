import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/api/hooks/useAdmin";
import { createQueryWrapper } from "@/test/query-wrapper";
import { UserTable } from "../UserTable";

// Mock the UserActions component to isolate table rendering from mutations.
vi.mock("../UserActions", () => ({
	UserActions: ({ user, isSelf }: { user: AdminUser; isSelf: boolean }) => (
		<button type="button" disabled={isSelf} aria-label={`Actions for ${user.email}`}>
			Actions
		</button>
	),
}));

const mockUsers: AdminUser[] = [
	{
		id: "01USER1",
		email: "alice@example.com",
		name: "Alice",
		avatar_url: null,
		role: "user",
		diagram_count: 3,
		created_at: 1_000_000,
		updated_at: 1_000_000,
	},
	{
		id: "01USER2",
		email: "bob@example.com",
		name: null,
		avatar_url: null,
		role: "admin",
		diagram_count: 5,
		created_at: 2_000_000,
		updated_at: 2_000_000,
	},
];

/**
 * Renders `UserTable` inside the required providers with sensible defaults.
 */
function renderTable(
	users: AdminUser[] = mockUsers,
	sort = "created_at",
	order: "asc" | "desc" = "desc",
	onSort = vi.fn(),
) {
	const { queryClient } = createQueryWrapper();
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<UserTable users={users} currentUserId="01CURRENT" sort={sort} order={order} onSort={onSort} />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("UserTable", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("renders all column headers", () => {
		renderTable();
		// Column headers are <th> elements; use role="columnheader" to be specific.
		const headers = screen.getAllByRole("columnheader").map((el) => el.textContent);
		expect(headers).toContain("Email");
		expect(headers.join("")).toContain("Name");
		expect(headers.join("")).toContain("Role");
		expect(headers.join("")).toContain("Created");
		expect(headers.join("")).toContain("Diagrams");
		expect(headers.join("")).toContain("Actions");
	});

	it("displays user data in rows", () => {
		renderTable();
		expect(screen.getByText("alice@example.com")).toBeInTheDocument();
		expect(screen.getByText("Alice")).toBeInTheDocument();
		expect(screen.getByText("bob@example.com")).toBeInTheDocument();
	});

	it("shows em dash for users with no name", () => {
		renderTable();
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("displays diagram counts", () => {
		renderTable();
		expect(screen.getByText("3")).toBeInTheDocument();
		expect(screen.getByText("5")).toBeInTheDocument();
	});

	it("renders role badge as 'user' for non-admin users", () => {
		renderTable();
		expect(screen.getByText("user")).toBeInTheDocument();
	});

	it("renders role badge as 'admin' for admin users", () => {
		renderTable();
		expect(screen.getByText("admin")).toBeInTheDocument();
	});

	it("calls onSort with column key when a header is clicked", async () => {
		const onSort = vi.fn();
		renderTable(mockUsers, "created_at", "desc", onSort);
		await userEvent.click(screen.getByText("Email"));
		expect(onSort).toHaveBeenCalledWith("email");
	});

	it("calls onSort with 'name' when Name header is clicked", async () => {
		const onSort = vi.fn();
		renderTable(mockUsers, "created_at", "desc", onSort);
		await userEvent.click(screen.getByText("Name"));
		expect(onSort).toHaveBeenCalledWith("name");
	});

	it("disables actions for the current user's row", () => {
		const users: AdminUser[] = [
			{
				id: "01CURRENT",
				email: "self@example.com",
				name: "Self",
				avatar_url: null,
				role: "admin",
				diagram_count: 0,
				created_at: 1_000_000,
				updated_at: 1_000_000,
			},
		];
		renderTable(users);
		const actionsButton = screen.getByRole("button", {
			name: "Actions for self@example.com",
		});
		expect(actionsButton).toBeDisabled();
	});

	it("does not disable actions for other users' rows", () => {
		renderTable();
		const aliceButton = screen.getByRole("button", {
			name: "Actions for alice@example.com",
		});
		expect(aliceButton).not.toBeDisabled();
	});

	it("shows empty state message when users array is empty", () => {
		renderTable([]);
		expect(screen.getByText("No users found.")).toBeInTheDocument();
	});

	it("does not render a table when users array is empty", () => {
		renderTable([]);
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
	});
});
