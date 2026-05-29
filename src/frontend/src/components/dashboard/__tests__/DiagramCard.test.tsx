import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-wrapper";
import { DiagramCard } from "../DiagramCard";

// Mock useNavigate so we can assert navigation calls without a real router.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual("react-router-dom");
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

/**
 * Renders a DiagramCard inside the required providers with a generic mock
 * fetch that returns a successful empty response for all API calls.
 */
function renderCard(overrides: { id?: string; title?: string; updatedAt?: number } = {}) {
	vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

	const { queryClient } = createQueryWrapper();

	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<DiagramCard
					id={overrides.id ?? "01DIAGRAM"}
					title={overrides.title ?? "Test Diagram"}
					updatedAt={overrides.updatedAt ?? Date.now() - 120_000}
				/>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("DiagramCard", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mockNavigate.mockClear();
	});

	it("displays the diagram title", () => {
		renderCard();
		expect(screen.getByText("Test Diagram")).toBeInTheDocument();
	});

	it("displays relative update time", () => {
		renderCard({ updatedAt: Date.now() - 120_000 });
		expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
	});

	it("navigates to the editor when the card is clicked", async () => {
		renderCard();
		const card = screen.getByRole("link");
		await userEvent.click(card);
		expect(mockNavigate).toHaveBeenCalledWith("/editor/01DIAGRAM");
	});

	it("navigates to the editor when Enter is pressed on the card", async () => {
		renderCard();
		const card = screen.getByRole("link");
		card.focus();
		await userEvent.keyboard("{Enter}");
		expect(mockNavigate).toHaveBeenCalledWith("/editor/01DIAGRAM");
	});

	it("shows the actions button (aria-label: 'Diagram actions')", () => {
		renderCard();
		expect(screen.getByRole("button", { name: "Diagram actions" })).toBeInTheDocument();
	});

	it("opens the dropdown and shows Rename/Duplicate/Delete items", async () => {
		renderCard();
		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));
		expect(screen.getByText("Rename")).toBeInTheDocument();
		expect(screen.getByText("Duplicate")).toBeInTheDocument();
		expect(screen.getByText("Delete")).toBeInTheDocument();
	});

	it("activates inline rename mode when Rename is clicked", async () => {
		renderCard();
		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));

		// Use fireEvent.click (direct DOM event) instead of userEvent.click.
		// userEvent fires pointer events first which Radix uses to set up its internal
		// state, but the custom ITEM_SELECT event that triggers onSelect is dispatched
		// inside the native click handler. fireEvent.click dispatches the click directly,
		// ensuring React's event delegation sees it while the component is still mounted.
		fireEvent.click(screen.getByText("Rename"));

		await waitFor(() => {
			expect(screen.getByRole("textbox", { name: "Rename diagram" })).toBeInTheDocument();
		});
	});

	it("cancels rename on Escape and restores the original title", async () => {
		renderCard();
		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));
		fireEvent.click(screen.getByText("Rename"));

		// Wait for the Input to appear.
		const input = await screen.findByRole("textbox", { name: "Rename diagram" });
		// Type a new title then press Escape to cancel.
		await userEvent.clear(input);
		await userEvent.type(input, "Changed Title");
		await userEvent.keyboard("{Escape}");

		await waitFor(() => {
			expect(screen.getByText("Test Diagram")).toBeInTheDocument();
		});
		expect(screen.queryByRole("textbox", { name: "Rename diagram" })).not.toBeInTheDocument();
	});

	it("shows delete confirmation dialog with the diagram title", async () => {
		renderCard({ title: "My Architecture" });
		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));
		await userEvent.click(screen.getByText("Delete"));

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog).toBeInTheDocument();
		// The title appears both in the card and in the dialog description;
		// assert within the dialog to avoid ambiguous matches.
		expect(within(dialog).getByText(/My Architecture/)).toBeInTheDocument();
	});

	it("closes the delete dialog when Cancel is clicked", async () => {
		renderCard();
		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));
		await userEvent.click(screen.getByText("Delete"));

		await screen.findByRole("alertdialog");
		await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => {
			expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
		});
	});

	it("calls the delete mutation when Delete is confirmed", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: null }), { status: 200 }));

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<DiagramCard id="01DELETE" title="To Delete" updatedAt={Date.now()} />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));
		await userEvent.click(screen.getByText("Delete"));
		await screen.findByRole("alertdialog");
		await userEvent.click(screen.getByRole("button", { name: "Delete" }));

		await waitFor(() => {
			// The DELETE API call should have been made
			expect(fetchSpy).toHaveBeenCalledWith(
				expect.stringContaining("diagrams/01DELETE"),
				expect.objectContaining({ method: "DELETE" }),
			);
		});
	});

	it("fires the rename mutation after the 1-second debounce", async () => {
		// shouldAdvanceTime: true means the fake clock still advances with real time,
		// so waitFor / findByRole polling continues to work. We only fake the timer
		// APIs so we can advance past the 1-second debounce without waiting.
		vi.useFakeTimers({ shouldAdvanceTime: true });

		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<DiagramCard id="01DIAGRAM" title="Test Diagram" updatedAt={Date.now() - 120_000} />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		// Use userEvent.setup with delay:null so it doesn't schedule its own timeouts.
		const user = userEvent.setup({ delay: null });
		await user.click(screen.getByRole("button", { name: "Diagram actions" }));
		fireEvent.click(screen.getByText("Rename"));

		const input = await screen.findByRole("textbox", { name: "Rename diagram" });
		await user.clear(input);
		await user.type(input, "New Name");
		await user.keyboard("{Enter}");

		// Fast-forward 1001ms to fire the debounce timer callback synchronously.
		vi.advanceTimersByTime(1001);
		// Restore real timers before waitFor so its polling mechanism works normally.
		vi.useRealTimers();

		// The debounce callback calls `renameMutation.mutate()` which starts an async
		// Promise chain to fetch. waitFor polls until the fetch call appears.
		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(
				expect.stringContaining("diagrams/01DIAGRAM"),
				expect.objectContaining({ method: "PATCH" }),
			);
		});
	});

	it("saves rename on Enter and exits rename mode", async () => {
		renderCard();
		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));
		fireEvent.click(screen.getByText("Rename"));

		const input = await screen.findByRole("textbox", { name: "Rename diagram" });
		await userEvent.clear(input);
		await userEvent.type(input, "Updated Title");
		await userEvent.keyboard("{Enter}");

		// After Enter, rename mode should exit (saveRename called → setIsRenaming(false))
		await waitFor(() => {
			expect(screen.queryByRole("textbox", { name: "Rename diagram" })).not.toBeInTheDocument();
		});
	});

	it("saves rename on blur when focus leaves the input", async () => {
		renderCard();
		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));
		fireEvent.click(screen.getByText("Rename"));

		const input = await screen.findByRole("textbox", { name: "Rename diagram" });
		await userEvent.clear(input);
		await userEvent.type(input, "Blurred Title");

		// Click the card (role="link") to move focus out of the Input.
		// handleCardClick returns early when isRenaming=true, so no navigation occurs.
		// The Input's onBlur fires → saveRename → setIsRenaming(false).
		await userEvent.click(screen.getByRole("link"));

		await waitFor(() => {
			expect(screen.queryByRole("textbox", { name: "Rename diagram" })).not.toBeInTheDocument();
		});
	});

	it("Duplicate calls the duplicate mutation and navigates to the new diagram", async () => {
		const duplicatedDiagram = {
			id: "01DUPLICATE",
			user_id: "01USER",
			title: "Test Diagram (Copy)",
			graph_data: { nodes: [], edges: [] },
			version: 1,
			created_at: Date.now(),
			updated_at: Date.now(),
		};

		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: duplicatedDiagram }), { status: 201 }),
		);

		const { queryClient } = createQueryWrapper();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<DiagramCard id="01DIAGRAM" title="Test Diagram" updatedAt={Date.now() - 120_000} />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await userEvent.click(screen.getByRole("button", { name: "Diagram actions" }));
		await userEvent.click(screen.getByText("Duplicate"));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/editor/01DUPLICATE");
		});
	});
});
