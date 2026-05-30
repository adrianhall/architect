import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "@/stores/diagram";
import { createQueryWrapper } from "@/test/query-wrapper";
import { Editor } from "../Editor";

// ── React Flow mock ────────────────────────────────────────────────────────────

/**
 * Shared mock functions for `useReactFlow`. Defined at module scope so test
 * bodies can clear and inspect them without worrying about closure staleness.
 */
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockFitView = vi.fn();

/**
 * Full mock of `@xyflow/react`.
 *
 * Every component that requires React Flow's internal context (ResizeObserver,
 * viewport store, etc.) is replaced with a simple `<div>` wrapper that renders
 * children but needs no browser APIs. `useReactFlow` returns stable mock
 * functions so tests can assert zoom/fit-view calls.
 */
vi.mock("@xyflow/react", () => ({
	ReactFlow: ({ children }: { children: React.ReactNode }) => <div data-testid="reactflow">{children}</div>,
	ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	MiniMap: () => <div data-testid="minimap" />,
	Controls: () => <div data-testid="controls" />,
	Background: () => <div data-testid="background" />,
	BackgroundVariant: { Dots: "dots" },
	useReactFlow: () => ({
		zoomIn: mockZoomIn,
		zoomOut: mockZoomOut,
		fitView: mockFitView,
	}),
	Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
	Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
	applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
	applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Resets the diagram store to its empty initial state. */
function resetStore() {
	useDiagramStore.setState({
		nodes: [],
		edges: [],
		viewport: { x: 0, y: 0, zoom: 1 },
		undoStack: [],
		redoStack: [],
	});
}

/** Mock API responses returned for every fetch during Editor tests. */
function setupFetch() {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

		if (url.includes("/api/me")) {
			return new Response(
				JSON.stringify({
					data: { id: "u1", email: "alice@test.com", name: "Alice", avatar_url: null, role: "user" },
				}),
				{ status: 200 },
			);
		}

		if (url.includes("/api/catalog")) {
			return new Response(JSON.stringify({ data: { services: [], categories: [], edgeTypes: [] } }), { status: 200 });
		}

		// /api/diagrams/:id — returns an empty diagram
		return new Response(
			JSON.stringify({
				data: {
					id: "d1",
					user_id: "u1",
					title: "Test Diagram",
					graph_data: { nodes: [], edges: [] },
					version: 1,
					created_at: 1000,
					updated_at: 1000,
				},
			}),
			{ status: 200 },
		);
	});
}

/** Renders the Editor inside all required providers and the router. */
function renderEditor() {
	const { queryClient } = createQueryWrapper();

	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={["/editor/d1"]}>
				<Routes>
					<Route path="/editor/:id" element={<Editor />} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/**
 * Waits for the ReactFlow canvas to appear, then seeds the diagram store.
 *
 * Seeding AFTER the canvas appears is necessary because the Editor's `useEffect`
 * calls `setDiagram` when the API data loads, which would overwrite any state
 * set before the component mounts. By seeding after the canvas is visible, we
 * guarantee the API effect has already run.
 */
async function waitForCanvasAndSeed(seedFn: () => void) {
	await waitFor(() => screen.getByTestId("reactflow"));
	seedFn();
}

/** Fires a `keydown` event on the document, optionally targeting a specific element. */
function fireKeyDown(key: string, options: Partial<KeyboardEventInit> = {}, target?: Element) {
	const event = new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
		...options,
	});
	(target ?? document).dispatchEvent(event);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Editor", () => {
	beforeEach(() => {
		resetStore();
		mockZoomIn.mockClear();
		mockZoomOut.mockClear();
		mockFitView.mockClear();
		vi.restoreAllMocks();
		setupFetch();
	});

	afterEach(() => {
		resetStore();
	});

	it("renders the React Flow canvas once data loads", async () => {
		renderEditor();
		await waitFor(() => {
			expect(screen.getByTestId("reactflow")).toBeInTheDocument();
		});
	});

	it("renders the minimap", async () => {
		renderEditor();
		await waitFor(() => {
			expect(screen.getByTestId("minimap")).toBeInTheDocument();
		});
	});

	it("renders the controls panel", async () => {
		renderEditor();
		await waitFor(() => {
			expect(screen.getByTestId("controls")).toBeInTheDocument();
		});
	});

	// ── Delete / Backspace ─────────────────────────────────────────────────────

	it("Delete key removes selected nodes from the store", async () => {
		renderEditor();

		// Seed AFTER the API effect runs so `setDiagram` does not overwrite our seed.
		await waitForCanvasAndSeed(() => {
			useDiagramStore.setState({
				nodes: [{ id: "n1", type: "cloudflareService", position: { x: 0, y: 0 }, data: {}, selected: true }],
				edges: [],
			});
		});

		fireKeyDown("Delete");

		expect(useDiagramStore.getState().nodes).toHaveLength(0);
	});

	it("Backspace key removes selected edges from the store", async () => {
		renderEditor();

		await waitForCanvasAndSeed(() => {
			useDiagramStore.setState({
				nodes: [
					{ id: "n1", type: "cloudflareService", position: { x: 0, y: 0 }, data: {} },
					{ id: "n2", type: "cloudflareService", position: { x: 200, y: 0 }, data: {} },
				],
				edges: [{ id: "e1", source: "n1", target: "n2", selected: true }],
			});
		});

		fireKeyDown("Backspace");

		expect(useDiagramStore.getState().edges).toHaveLength(0);
	});

	it("Delete does NOT remove nodes when focus is inside an <input>", async () => {
		renderEditor();

		await waitForCanvasAndSeed(() => {
			useDiagramStore.setState({
				nodes: [{ id: "n1", type: "cloudflareService", position: { x: 0, y: 0 }, data: {}, selected: true }],
				edges: [],
			});
		});

		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();

		fireKeyDown("Delete", {}, input);

		expect(useDiagramStore.getState().nodes).toHaveLength(1);

		document.body.removeChild(input);
	});

	it("Delete does NOT remove nodes when focus is inside a <textarea>", async () => {
		renderEditor();

		await waitForCanvasAndSeed(() => {
			useDiagramStore.setState({
				nodes: [{ id: "n1", type: "cloudflareService", position: { x: 0, y: 0 }, data: {}, selected: true }],
				edges: [],
			});
		});

		const textarea = document.createElement("textarea");
		document.body.appendChild(textarea);
		textarea.focus();

		fireKeyDown("Delete", {}, textarea);

		expect(useDiagramStore.getState().nodes).toHaveLength(1);

		document.body.removeChild(textarea);
	});

	// ── Zoom shortcuts ─────────────────────────────────────────────────────────

	it("+ key calls zoomIn", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		fireKeyDown("+");

		expect(mockZoomIn).toHaveBeenCalledTimes(1);
	});

	it("= key (unshifted +) calls zoomIn", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		fireKeyDown("=");

		expect(mockZoomIn).toHaveBeenCalledTimes(1);
	});

	it("- key calls zoomOut", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		fireKeyDown("-");

		expect(mockZoomOut).toHaveBeenCalledTimes(1);
	});

	// ── Fit-view shortcut ──────────────────────────────────────────────────────

	it("Ctrl+Shift+F calls fitView", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		fireKeyDown("f", { shiftKey: true, ctrlKey: true });

		expect(mockFitView).toHaveBeenCalledWith({ padding: 0.1 });
	});

	it("Cmd+Shift+F (metaKey) calls fitView", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		fireKeyDown("f", { shiftKey: true, metaKey: true });

		expect(mockFitView).toHaveBeenCalledWith({ padding: 0.1 });
	});

	// ── Undo / Redo keyboard shortcuts ─────────────────────────────────────────

	it("Ctrl+Z calls undo on the diagram store", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		// Add a node so there's something to undo, then verify undo is called.
		await waitForCanvasAndSeed(() => {
			useDiagramStore.getState().addNode({
				id: "n1",
				type: "cloudflareService",
				position: { x: 0, y: 0 },
				data: {},
			});
		});

		expect(useDiagramStore.getState().nodes).toHaveLength(1);

		fireKeyDown("z", { ctrlKey: true });

		// Undo should have removed the node.
		expect(useDiagramStore.getState().nodes).toHaveLength(0);
	});

	it("Cmd+Z (metaKey) calls undo on the diagram store", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		await waitForCanvasAndSeed(() => {
			useDiagramStore.getState().addNode({
				id: "n1",
				type: "cloudflareService",
				position: { x: 0, y: 0 },
				data: {},
			});
		});

		fireKeyDown("z", { metaKey: true });

		expect(useDiagramStore.getState().nodes).toHaveLength(0);
	});

	it("Ctrl+Shift+Z calls redo on the diagram store", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		await waitForCanvasAndSeed(() => {
			useDiagramStore.getState().addNode({
				id: "n1",
				type: "cloudflareService",
				position: { x: 0, y: 0 },
				data: {},
			});
		});

		// Undo first to create a redo entry.
		useDiagramStore.getState().undo();
		expect(useDiagramStore.getState().nodes).toHaveLength(0);

		// Now redo should restore the node.
		fireKeyDown("z", { ctrlKey: true, shiftKey: true });

		expect(useDiagramStore.getState().nodes).toHaveLength(1);
	});

	it("Ctrl+Y calls redo on the diagram store (Windows convention)", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		await waitForCanvasAndSeed(() => {
			useDiagramStore.getState().addNode({
				id: "n1",
				type: "cloudflareService",
				position: { x: 0, y: 0 },
				data: {},
			});
		});

		// Undo first to create a redo entry.
		useDiagramStore.getState().undo();
		expect(useDiagramStore.getState().nodes).toHaveLength(0);

		// Ctrl+Y redo.
		fireKeyDown("y", { ctrlKey: true });

		expect(useDiagramStore.getState().nodes).toHaveLength(1);
	});

	// ── Text-input guard — refined to allow non-text inputs ────────────────────

	it("Ctrl+Z does NOT trigger undo when focus is inside a text <input>", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		await waitForCanvasAndSeed(() => {
			useDiagramStore.getState().addNode({
				id: "n1",
				type: "cloudflareService",
				position: { x: 0, y: 0 },
				data: {},
			});
		});

		// Focus a text input — undo should not fire.
		const input = document.createElement("input");
		input.type = "text";
		document.body.appendChild(input);
		input.focus();

		fireKeyDown("z", { ctrlKey: true }, input);

		// Node should still be there (undo was suppressed).
		expect(useDiagramStore.getState().nodes).toHaveLength(1);

		document.body.removeChild(input);
	});

	it("Ctrl+Z DOES trigger undo when focus is on a checkbox (non-text input)", async () => {
		renderEditor();
		await waitFor(() => screen.getByTestId("reactflow"));

		await waitForCanvasAndSeed(() => {
			useDiagramStore.getState().addNode({
				id: "n1",
				type: "cloudflareService",
				position: { x: 0, y: 0 },
				data: {},
			});
		});

		// Focus a checkbox input — undo should fire (non-text input does not block).
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		document.body.appendChild(checkbox);
		checkbox.focus();

		fireKeyDown("z", { ctrlKey: true }, checkbox);

		// Undo should have removed the node.
		expect(useDiagramStore.getState().nodes).toHaveLength(0);

		document.body.removeChild(checkbox);
	});
});
