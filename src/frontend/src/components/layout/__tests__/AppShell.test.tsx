import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/hooks/useAuth";
import { createQueryWrapper } from "@/test/query-wrapper";
import { AppShell } from "../AppShell";

describe("AppShell", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("renders header with app name and user email", async () => {
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
				<MemoryRouter initialEntries={["/"]}>
					<AuthProvider>
						<Routes>
							<Route element={<AppShell />}>
								<Route path="/" element={<div>Child content</div>} />
							</Route>
						</Routes>
					</AuthProvider>
				</MemoryRouter>
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("CF-Architect")).toBeInTheDocument();
			expect(screen.getByText("alice@example.com")).toBeInTheDocument();
			expect(screen.getByText("Child content")).toBeInTheDocument();
		});
	});

	it("renders avatar initial when no avatar_url", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						id: "01ABC",
						email: "alice@example.com",
						name: "Alice",
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
				<MemoryRouter initialEntries={["/"]}>
					<AuthProvider>
						<Routes>
							<Route element={<AppShell />}>
								<Route path="/" element={<div>Content</div>} />
							</Route>
						</Routes>
					</AuthProvider>
				</MemoryRouter>
			</Wrapper>,
		);

		await waitFor(() => {
			// Should show the first letter of the name as avatar initial.
			expect(screen.getByText("A")).toBeInTheDocument();
		});
	});

	it("uses email initial as avatar when no avatar_url and name is null", async () => {
		// Covers the `(user.name ?? user.email).charAt(0)` branch where name is null.
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						id: "01ABC",
						email: "alice@example.com",
						name: null,
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
				<MemoryRouter initialEntries={["/"]}>
					<AuthProvider>
						<Routes>
							<Route element={<AppShell />}>
								<Route path="/" element={<div>Content</div>} />
							</Route>
						</Routes>
					</AuthProvider>
				</MemoryRouter>
			</Wrapper>,
		);

		await waitFor(() => {
			// First letter of email "alice@example.com" → "A"
			expect(screen.getByText("A")).toBeInTheDocument();
		});
	});

	it("renders avatar image when avatar_url is present", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						id: "01ABC",
						email: "alice@example.com",
						name: "Alice",
						avatar_url: "https://example.com/avatar.png",
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
				<MemoryRouter initialEntries={["/"]}>
					<AuthProvider>
						<Routes>
							<Route element={<AppShell />}>
								<Route path="/" element={<div>Content</div>} />
							</Route>
						</Routes>
					</AuthProvider>
				</MemoryRouter>
			</Wrapper>,
		);

		await waitFor(() => {
			const img = screen.getByRole("img");
			expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
			expect(img).toHaveAttribute("alt", "Alice");
		});
	});

	it("uses email as avatar alt when name is null and avatar_url is present", async () => {
		// Covers the `user.name ?? user.email` branch where name is null.
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						id: "01ABC",
						email: "alice@example.com",
						name: null,
						avatar_url: "https://example.com/avatar.png",
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
				<MemoryRouter initialEntries={["/"]}>
					<AuthProvider>
						<Routes>
							<Route element={<AppShell />}>
								<Route path="/" element={<div>Content</div>} />
							</Route>
						</Routes>
					</AuthProvider>
				</MemoryRouter>
			</Wrapper>,
		);

		await waitFor(() => {
			const img = screen.getByRole("img");
			// alt falls back to email when name is null
			expect(img).toHaveAttribute("alt", "alice@example.com");
		});
	});
});
