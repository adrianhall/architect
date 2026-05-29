import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

/** Shared mock user returned by most App-level tests. */
const mockUser = {
	id: "01ABC",
	email: "alice@example.com",
	name: "alice",
	avatar_url: null,
	role: "user",
	created_at: 1000,
	updated_at: 1000,
};

/**
 * Integration tests for the root App component.
 *
 * Verifies that routing, auth context, and the app shell work together
 * end-to-end with a mocked `/api/me` endpoint.
 */
describe("App", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the dashboard when authenticated", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: mockUser }), { status: 200 }));

		render(<App />);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
		});
	});
});
