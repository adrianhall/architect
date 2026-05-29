import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/hooks/useAuth";
import { createQueryWrapper } from "@/test/query-wrapper";
import { Dashboard } from "../Dashboard";

// Mock useNavigate so we can assert navigation calls.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual("react-router-dom");
	return { ...actual, useNavigate: () => mockNavigate };
});

const mockUser = {
	id: "01USER",
	email: "alice@example.com",
	name: "Alice",
	avatar_url: null,
	role: "user",
	created_at: 1000,
	updated_at: 1000,
};

const mockDiagram = {
	id: "01DIAGRAM",
	user_id: "01USER",
	title: "My Architecture",
	graph_data: { nodes: [], edges: [] },
	version: 1,
	created_at: 1000,
	updated_at: Date.now() - 60_000, // 1 minute ago
};

/**
 * Renders the Dashboard inside the required providers.
 *
 * The `meResponse` is returned for `/api/me`; the `diagramsResponse` is
 * returned for all other requests (primarily `/api/diagrams`).
 */
function renderDashboard(diagramsData: unknown, diagramsStatus = 200) {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

		if (url.includes("/api/me")) {
			return new Response(JSON.stringify({ data: mockUser }), { status: 200 });
		}

		return new Response(JSON.stringify({ data: diagramsData }), { status: diagramsStatus });
	});

	const { queryClient } = createQueryWrapper();

	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuthProvider>
					<Dashboard />
				</AuthProvider>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("Dashboard", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mockNavigate.mockClear();
	});

	it("renders the Dashboard heading", async () => {
		renderDashboard([]);
		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
		});
	});

	it("renders a welcome message with the user's name", async () => {
		renderDashboard([]);
		await waitFor(() => {
			expect(screen.getByText("Welcome back, Alice")).toBeInTheDocument();
		});
	});

	it("shows the New Diagram button", async () => {
		renderDashboard([]);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /new diagram/i })).toBeInTheDocument();
		});
	});

	it("shows the empty state when the user has no diagrams", async () => {
		renderDashboard([]);
		await waitFor(() => {
			expect(screen.getByText("Create your first diagram")).toBeInTheDocument();
		});
	});

	it("renders diagram cards when diagrams exist", async () => {
		renderDashboard([mockDiagram]);
		await waitFor(() => {
			expect(screen.getByText("My Architecture")).toBeInTheDocument();
		});
	});

	it("does not show the empty state when diagrams exist", async () => {
		renderDashboard([mockDiagram]);
		await waitFor(() => {
			expect(screen.getByText("My Architecture")).toBeInTheDocument();
		});
		expect(screen.queryByText("Create your first diagram")).not.toBeInTheDocument();
	});

	it("renders the Dashboard heading immediately (before data loads)", () => {
		// Use a fetch that never resolves for diagrams to test the loading state.
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/me")) {
				return new Response(JSON.stringify({ data: mockUser }), { status: 200 });
			}
			return new Promise(() => {
				// Never resolves — simulates loading
			});
		});

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<AuthProvider>
						<Dashboard />
					</AuthProvider>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		expect(screen.getByText("Dashboard")).toBeInTheDocument();
	});

	it("shows an error banner when the diagram fetch fails", async () => {
		renderDashboard({ error: { code: "INTERNAL_ERROR", message: "Server error" } }, 500);
		await waitFor(() => {
			expect(screen.getByText("Failed to load diagrams. Please try again.")).toBeInTheDocument();
		});
	});

	it("New Diagram button calls create mutation and navigates to the editor", async () => {
		const newDiagram = { ...mockDiagram, id: "01NEW" };

		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/me")) {
				return new Response(JSON.stringify({ data: mockUser }), { status: 200 });
			}
			// POST /api/diagrams (create) returns a new diagram
			if (url.includes("/api/diagrams") && !url.includes("/api/diagrams/")) {
				return new Response(JSON.stringify({ data: newDiagram }), { status: 201 });
			}
			return new Response(JSON.stringify({ data: [] }), { status: 200 });
		});

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<AuthProvider>
						<Dashboard />
					</AuthProvider>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		// Wait for dashboard to load then click New Diagram
		const btn = await screen.findByRole("button", { name: /new diagram/i });
		await userEvent.click(btn);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/editor/01NEW");
		});
	});

	it("empty state New Diagram button also creates a diagram and navigates", async () => {
		const newDiagram = { ...mockDiagram, id: "01EMPTY" };

		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/me")) {
				return new Response(JSON.stringify({ data: mockUser }), { status: 200 });
			}
			if (url.includes("/api/diagrams")) {
				return new Response(JSON.stringify({ data: newDiagram }), { status: 201 });
			}
			return new Response(JSON.stringify({ data: [] }), { status: 200 });
		});

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<AuthProvider>
						<Dashboard />
					</AuthProvider>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		// Wait for empty state, then click the CTA button inside it
		const ctaBtn = await screen.findByRole("button", { name: "New Diagram" });
		await userEvent.click(ctaBtn);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/editor/01EMPTY");
		});
	});
});
