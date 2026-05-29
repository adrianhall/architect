import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/hooks/useAuth";
import { Admin } from "../Admin";

describe("Admin", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the Admin heading and user email", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						id: "01ABC",
						email: "admin@example.com",
						name: "Admin",
						avatar_url: null,
						role: "admin",
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
					<Admin />
				</AuthProvider>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
			expect(screen.getByText("Admin user: admin@example.com")).toBeInTheDocument();
		});
	});
});
