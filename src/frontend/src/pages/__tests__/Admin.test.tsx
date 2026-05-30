import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/hooks/useAuth";
import { createQueryWrapper } from "@/test/query-wrapper";
import { Admin } from "../Admin";

// Mock useNavigate so we can assert navigation calls.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual("react-router-dom");
	return { ...actual, useNavigate: () => mockNavigate };
});

const mockAdminUser = {
	id: "01ADMIN",
	email: "admin@example.com",
	name: "Admin User",
	avatar_url: null,
	role: "admin",
	created_at: 1000,
	updated_at: 1000,
};

const mockRegularUser = {
	id: "01USER",
	email: "user@example.com",
	name: "Regular User",
	avatar_url: null,
	role: "user",
	created_at: 1000,
	updated_at: 1000,
};

const mockUsersResponse = {
	users: [
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
			name: "Bob",
			avatar_url: null,
			role: "admin",
			diagram_count: 5,
			created_at: 2_000_000,
			updated_at: 2_000_000,
		},
	],
	pagination: {
		page: 1,
		limit: 20,
		total: 2,
		totalPages: 1,
	},
};

/**
 * Renders `Admin` inside the full provider stack required for the component.
 *
 * @param meUser - The user returned by `/api/me`.
 * @param adminResponse - Optional override for the admin users API response data.
 * @param adminStatus - HTTP status for the admin users API call (default 200).
 */
function renderAdmin(
	meUser: typeof mockAdminUser | typeof mockRegularUser,
	adminResponse: unknown = mockUsersResponse,
	adminStatus = 200,
) {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

		if (url.includes("/api/me")) {
			return new Response(JSON.stringify({ data: meUser }), { status: 200 });
		}

		// Admin users endpoint
		if (url.includes("/api/admin/users")) {
			return new Response(JSON.stringify({ data: adminResponse }), { status: adminStatus });
		}

		return new Response(JSON.stringify({ data: null }), { status: 200 });
	});

	const { queryClient } = createQueryWrapper();

	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuthProvider>
					<Admin />
				</AuthProvider>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("Admin", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mockNavigate.mockClear();
	});

	it("renders the User Management heading for admin users", async () => {
		renderAdmin(mockAdminUser);
		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "User Management" })).toBeInTheDocument();
		});
	});

	it("renders user table with correct column headers", async () => {
		renderAdmin(mockAdminUser);
		await waitFor(() => {
			expect(screen.getByText("Email")).toBeInTheDocument();
			expect(screen.getByText("Name")).toBeInTheDocument();
			expect(screen.getByText("Role")).toBeInTheDocument();
			expect(screen.getByText("Created")).toBeInTheDocument();
			expect(screen.getByText("Diagrams")).toBeInTheDocument();
		});
	});

	it("displays user data in table rows", async () => {
		renderAdmin(mockAdminUser);
		await waitFor(() => {
			expect(screen.getByText("alice@example.com")).toBeInTheDocument();
			expect(screen.getByText("Alice")).toBeInTheDocument();
			expect(screen.getByText("bob@example.com")).toBeInTheDocument();
		});
	});

	it("redirects non-admin users to the dashboard", async () => {
		renderAdmin(mockRegularUser);
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
		});
	});

	it("shows loading skeleton while data is fetching", async () => {
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

			if (url.includes("/api/me")) {
				return new Response(JSON.stringify({ data: mockAdminUser }), {
					status: 200,
				});
			}

			// Never resolves — simulates loading
			return new Promise<Response>(() => {});
		});

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<AuthProvider>
						<Admin />
					</AuthProvider>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		// Auth resolves first; then admin data hangs
		await waitFor(() => {
			expect(screen.getByTestId("table-skeleton")).toBeInTheDocument();
		});
	});

	it("shows error state with retry button when fetch fails", async () => {
		renderAdmin(mockAdminUser, { error: { code: "INTERNAL_ERROR", message: "Server error" } }, 500);
		await waitFor(() => {
			expect(screen.getByText("Failed to load users. Please try again.")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
		});
	});

	it("shows empty state when no users match search", async () => {
		renderAdmin(mockAdminUser, {
			users: [],
			pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
		});
		await waitFor(() => {
			expect(screen.getByText("No users found.")).toBeInTheDocument();
		});
	});

	it("renders the search input", async () => {
		renderAdmin(mockAdminUser);
		await waitFor(() => {
			expect(screen.getByRole("searchbox", { name: /search users/i })).toBeInTheDocument();
		});
	});

	it("shows pagination controls when totalPages > 1", async () => {
		renderAdmin(mockAdminUser, {
			users: mockUsersResponse.users,
			pagination: { page: 1, limit: 20, total: 40, totalPages: 2 },
		});
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /next page/i })).toBeInTheDocument();
		});
	});

	it("does not show pagination controls when totalPages <= 1", async () => {
		renderAdmin(mockAdminUser, mockUsersResponse);
		await waitFor(() => {
			expect(screen.getByText("alice@example.com")).toBeInTheDocument();
		});
		expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
	});

	it("clicking a column header requests a sort by that column", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/me")) {
				return new Response(JSON.stringify({ data: mockAdminUser }), { status: 200 });
			}
			return new Response(JSON.stringify({ data: mockUsersResponse }), { status: 200 });
		});

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<AuthProvider>
						<Admin />
					</AuthProvider>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		// Wait for the table to load, then click the Email column header
		await waitFor(() => {
			expect(screen.getByText("alice@example.com")).toBeInTheDocument();
		});

		// Click "Email" column header
		await userEvent.click(screen.getByText("Email"));

		// A new fetch should be made with the sort parameter
		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("sort=email"), expect.any(Object));
		});
	});

	it("clicking the same column header twice toggles sort order", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/me")) {
				return new Response(JSON.stringify({ data: mockAdminUser }), { status: 200 });
			}
			return new Response(JSON.stringify({ data: mockUsersResponse }), { status: 200 });
		});

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<AuthProvider>
						<Admin />
					</AuthProvider>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		// Wait for data to load
		await waitFor(() => {
			expect(screen.getByText("alice@example.com")).toBeInTheDocument();
		});

		// First click: sets sort to email, order to asc
		await userEvent.click(screen.getByText("Email"));
		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("sort=email"), expect.any(Object));
		});

		// Second click on the same column: toggles order to desc
		await userEvent.click(screen.getByText("Email"));
		await waitFor(() => {
			const calls = fetchSpy.mock.calls.map(([url]) => (typeof url === "string" ? url : ""));
			const descCall = calls.find((u) => u.includes("sort=email") && u.includes("order=desc"));
			expect(descCall).toBeTruthy();
		});
	});
});
