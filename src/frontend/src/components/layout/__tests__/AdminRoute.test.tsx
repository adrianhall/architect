import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/hooks/useAuth";
import { createQueryWrapper } from "@/test/query-wrapper";
import { AdminRoute } from "../AdminRoute";

/** Helper that sets up the AuthProvider with a mocked /api/me response. */
function renderWithAuth(userOverrides: Record<string, unknown> = {}) {
	const defaultUser = {
		id: "01ABC",
		email: "alice@example.com",
		name: "alice",
		avatar_url: null,
		role: "user",
		created_at: 1000,
		updated_at: 1000,
		...userOverrides,
	};

	vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: defaultUser }), { status: 200 }));

	const { Wrapper } = createQueryWrapper();
	return render(
		<Wrapper>
			<MemoryRouter>
				<AuthProvider>
					<AdminRoute>
						<div>Admin content</div>
					</AdminRoute>
				</AuthProvider>
			</MemoryRouter>
		</Wrapper>,
	);
}

describe("AdminRoute", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("renders children when user has admin role", async () => {
		renderWithAuth({ role: "admin" });

		await waitFor(() => {
			expect(screen.getByText("Admin content")).toBeInTheDocument();
		});
	});

	it("renders Forbidden message when user has user role", async () => {
		renderWithAuth({ role: "user" });

		await waitFor(() => {
			expect(screen.getByText("Forbidden")).toBeInTheDocument();
			expect(screen.getByText("You do not have permission to access this page.")).toBeInTheDocument();
		});
	});
});
