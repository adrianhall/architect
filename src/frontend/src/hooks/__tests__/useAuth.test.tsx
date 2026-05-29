import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../test/query-wrapper";
import { AuthProvider, useAuth } from "../useAuth";

/**
 * Helper component that renders the current auth state to the DOM so tests
 * can assert on it without exposing any hook internals.
 */
function AuthDisplay() {
	const { user, isLoading, error } = useAuth();
	if (isLoading) return <div>Loading...</div>;
	if (error) return <div>Error: {error}</div>;
	if (user) return <div>User: {user.email}</div>;
	return <div>No user</div>;
}

describe("useAuth", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("shows loading state initially", () => {
		// Mock a fetch that never resolves so the loading state persists.
		vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

		const { Wrapper } = createQueryWrapper();
		render(
			<Wrapper>
				<AuthProvider>
					<AuthDisplay />
				</AuthProvider>
			</Wrapper>,
		);

		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});

	it("provides user data on successful fetch", async () => {
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

		const { Wrapper } = createQueryWrapper();
		render(
			<Wrapper>
				<AuthProvider>
					<AuthDisplay />
				</AuthProvider>
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("User: alice@example.com")).toBeInTheDocument();
		});
	});

	it("sets error to 'unauthorized' on 401 response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }), { status: 401 }),
		);

		const { Wrapper } = createQueryWrapper();
		render(
			<Wrapper>
				<AuthProvider>
					<AuthDisplay />
				</AuthProvider>
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Error: unauthorized")).toBeInTheDocument();
		});
	});

	it("sets error message on network failure", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

		const { Wrapper } = createQueryWrapper();
		render(
			<Wrapper>
				<AuthProvider>
					<AuthDisplay />
				</AuthProvider>
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Error: Network error")).toBeInTheDocument();
		});
	});

	it("sets error message on non-401 server error response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }), {
				status: 500,
			}),
		);

		const { Wrapper } = createQueryWrapper();
		render(
			<Wrapper>
				<AuthProvider>
					<AuthDisplay />
				</AuthProvider>
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Error: Internal server error")).toBeInTheDocument();
		});
	});

	it("throws when useAuth is used outside AuthProvider", () => {
		// Suppress React's own error boundary console output for this test.
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(() => render(<AuthDisplay />)).toThrow("useAuth must be used within an AuthProvider");

		spy.mockRestore();
	});
});
