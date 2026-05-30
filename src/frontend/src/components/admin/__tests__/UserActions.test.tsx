import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/api/hooks/useAdmin";
import { createQueryWrapper } from "@/test/query-wrapper";
import { UserActions } from "../UserActions";

// Mock the admin hooks so tests can assert on mutation calls without network.
const mockPromoteMutate = vi.fn();
const mockDemoteMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock("@/api/hooks/useAdmin", async () => {
	const actual = await vi.importActual("@/api/hooks/useAdmin");
	return {
		...actual,
		usePromoteUser: () => ({ mutate: mockPromoteMutate }),
		useDemoteUser: () => ({ mutate: mockDemoteMutate }),
		useDeleteUser: () => ({ mutate: mockDeleteMutate }),
	};
});

const regularUser: AdminUser = {
	id: "01USER",
	email: "user@example.com",
	name: "Test User",
	avatar_url: null,
	role: "user",
	diagram_count: 3,
	created_at: 1_000_000,
	updated_at: 1_000_000,
};

const adminUser: AdminUser = {
	...regularUser,
	id: "01ADMIN",
	email: "admin@example.com",
	role: "admin",
};

/**
 * Renders `UserActions` inside the required providers.
 */
function renderActions(user: AdminUser, isSelf = false) {
	const { queryClient } = createQueryWrapper();
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<UserActions user={user} isSelf={isSelf} />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("UserActions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders the trigger button", () => {
		renderActions(regularUser);
		expect(screen.getByRole("button", { name: /actions for user@example.com/i })).toBeInTheDocument();
	});

	it("trigger button is disabled when isSelf is true", () => {
		renderActions(regularUser, true);
		expect(screen.getByRole("button", { name: /actions for/i })).toBeDisabled();
	});

	it("trigger button is enabled when isSelf is false", () => {
		renderActions(regularUser, false);
		expect(screen.getByRole("button", { name: /actions for/i })).not.toBeDisabled();
	});

	it("shows Promote to Admin option for regular user", async () => {
		renderActions(regularUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for user@example.com/i }));
		expect(screen.getByText("Promote to Admin")).toBeInTheDocument();
	});

	it("shows Demote to User option for admin user", async () => {
		renderActions(adminUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for admin@example.com/i }));
		expect(screen.getByText("Demote to User")).toBeInTheDocument();
	});

	it("calls promote mutation with correct userId when Promote is clicked", async () => {
		renderActions(regularUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for user@example.com/i }));
		fireEvent.click(screen.getByText("Promote to Admin"));
		expect(mockPromoteMutate).toHaveBeenCalledWith({ userId: regularUser.id });
	});

	it("calls demote mutation with correct userId when Demote is clicked", async () => {
		renderActions(adminUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for admin@example.com/i }));
		fireEvent.click(screen.getByText("Demote to User"));
		expect(mockDemoteMutate).toHaveBeenCalledWith({ userId: adminUser.id });
	});

	it("opens delete confirmation dialog when Delete User is clicked", async () => {
		renderActions(regularUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for user@example.com/i }));
		fireEvent.click(screen.getByText("Delete User"));
		await waitFor(() => {
			expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		});
	});

	it("confirmation dialog shows user email", async () => {
		renderActions(regularUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for user@example.com/i }));
		fireEvent.click(screen.getByText("Delete User"));
		await waitFor(() => {
			expect(screen.getByText("user@example.com")).toBeInTheDocument();
		});
	});

	it("confirmation dialog shows diagram count", async () => {
		renderActions(regularUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for user@example.com/i }));
		fireEvent.click(screen.getByText("Delete User"));
		await waitFor(() => {
			expect(screen.getByText("3")).toBeInTheDocument();
		});
	});

	it("calls delete mutation with correct userId when confirmed", async () => {
		renderActions(regularUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for user@example.com/i }));
		fireEvent.click(screen.getByText("Delete User"));
		await waitFor(() => {
			expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		});
		// Click the destructive "Delete" button inside the dialog
		const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
		// The confirmation "Delete" button is the last one (Cancel is first)
		fireEvent.click(deleteButtons[deleteButtons.length - 1]);
		expect(mockDeleteMutate).toHaveBeenCalledWith(
			{ userId: regularUser.id },
			expect.objectContaining({ onSettled: expect.any(Function) }),
		);
	});

	it("shows Delete User option in dropdown for regular user", async () => {
		renderActions(regularUser);
		await userEvent.click(screen.getByRole("button", { name: /actions for user@example.com/i }));
		expect(screen.getByText("Delete User")).toBeInTheDocument();
	});
});
