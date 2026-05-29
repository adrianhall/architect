import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "../ProtectedRoute";

describe("ProtectedRoute", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("shows loading spinner while auth is pending", () => {
		// A fetch that never resolves keeps isLoading === true.
		vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

		render(
			<MemoryRouter>
				<AuthProvider>
					<ProtectedRoute>
						<div>Protected content</div>
					</ProtectedRoute>
				</AuthProvider>
			</MemoryRouter>,
		);

		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
	});

	it("renders children when authenticated", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						id: "01ABC",
						email: "alice@example.com",
						name: "alice",
						avatar_url: null,
						role: "user",
						created_at: 1000,
						updated_at: 1000,
					},
				}),
				{ status: 200 },
			),
		);

		render(
			<MemoryRouter>
				<AuthProvider>
					<ProtectedRoute>
						<div>Protected content</div>
					</ProtectedRoute>
				</AuthProvider>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Protected content")).toBeInTheDocument();
		});
	});

	it("redirects to /_auth/login when not authenticated", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

		render(
			<MemoryRouter initialEntries={["/"]}>
				<AuthProvider>
					<Routes>
						<Route
							path="/"
							element={
								<ProtectedRoute>
									<div>Protected content</div>
								</ProtectedRoute>
							}
						/>
						<Route path="/_auth/login" element={<div>Login page</div>} />
					</Routes>
				</AuthProvider>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Login page")).toBeInTheDocument();
		});
	});
});
