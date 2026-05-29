import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

		render(
			<AuthProvider>
				<AuthDisplay />
			</AuthProvider>,
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

		render(
			<AuthProvider>
				<AuthDisplay />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("User: alice@example.com")).toBeInTheDocument();
		});
	});

	it("sets error to 'unauthorized' on 401 response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

		render(
			<AuthProvider>
				<AuthDisplay />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Error: unauthorized")).toBeInTheDocument();
		});
	});

	it("sets error message on network failure", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

		render(
			<AuthProvider>
				<AuthDisplay />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Error: Network error")).toBeInTheDocument();
		});
	});

	it("sets error message on non-401 server error response", async () => {
		// Covers the branch where res.ok is false but status is not 401/302.
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

		render(
			<AuthProvider>
				<AuthDisplay />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Error: Failed to fetch user: 500")).toBeInTheDocument();
		});
	});

	it("sets generic error message when a non-Error value is thrown", async () => {
		// Covers the `err instanceof Error ? ... : "Unknown error"` else branch.
		vi.spyOn(globalThis, "fetch").mockRejectedValue("string rejection");

		render(
			<AuthProvider>
				<AuthDisplay />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Error: Unknown error")).toBeInTheDocument();
		});
	});

	it("throws when useAuth is used outside AuthProvider", () => {
		// Suppress React's own error boundary console output for this test.
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(() => render(<AuthDisplay />)).toThrow("useAuth must be used within an AuthProvider");

		spy.mockRestore();
	});
});
