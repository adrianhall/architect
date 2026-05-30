import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "@/stores/diagram";
import { useUIStore } from "@/stores/ui";
import { createQueryWrapper } from "@/test/query-wrapper";
import { Editor } from "../Editor";

// ── React Flow mock with drag-drop and selection support ───────────────────────

/**
 * Shared mock functions for `useReactFlow`.
 *
 * `screenToFlowPosition` is mocked to return a predictable position so tests
 * can assert on the exact drop coordinates without browser geometry.
 */
const mockScreenToFlowPosition = vi.fn().mockReturnValue({ x: 100, y: 200 });
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockFitView = vi.fn();

/**
 * Captured handler references, updated each time the ReactFlow mock renders.
 *
 * Tests that need to trigger selection events call these functions directly
 * after the canvas has mounted. This approach avoids trying to fire synthetic
 * React events on internal React Flow internals.
 */
const capturedHandlers: {
	onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
	onEdgeClick?: (event: React.MouseEvent, edge: { id: string }) => void;
	onPaneClick?: () => void;
} = {};

/**
 * Full mock of `@xyflow/react`.
 *
 * The ReactFlow mock forwards `onDrop` and `onDragOver` to the rendered div
 * so test code can fire synthetic events on `data-testid="reactflow"` and
 * have the handlers execute. `onNodeClick`, `onEdgeClick`, and `onPaneClick`
 * are captured in `capturedHandlers` so tests can call them directly.
 */
vi.mock("@xyflow/react", () => ({
	ReactFlow: (props: {
		children: React.ReactNode;
		onDrop?: React.DragEventHandler;
		onDragOver?: React.DragEventHandler;
		onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
		onEdgeClick?: (event: React.MouseEvent, edge: { id: string }) => void;
		onPaneClick?: () => void;
	}) => {
		// Capture selection handlers for use in test assertions.
		capturedHandlers.onNodeClick = props.onNodeClick;
		capturedHandlers.onEdgeClick = props.onEdgeClick;
		capturedHandlers.onPaneClick = props.onPaneClick;

		return (
			<div data-testid="reactflow" role="application" onDrop={props.onDrop} onDragOver={props.onDragOver}>
				{props.children}
			</div>
		);
	},
	ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	MiniMap: () => <div data-testid="minimap" />,
	Controls: () => <div data-testid="controls" />,
	Background: () => <div data-testid="background" />,
	BackgroundVariant: { Dots: "dots" },
	useReactFlow: () => ({
		zoomIn: mockZoomIn,
		zoomOut: mockZoomOut,
		fitView: mockFitView,
		screenToFlowPosition: mockScreenToFlowPosition,
	}),
	Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
	Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
	applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
	applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Resets both diagram and UI stores to their initial empty state. */
function resetStores() {
	useDiagramStore.setState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
	useUIStore.setState({
		collapsedCategories: new Set(),
		selectedNodeId: null,
		selectedEdgeId: null,
		panelVisible: true,
	});
}

/** ULID pattern: 26 characters, Crockford Base32 alphabet. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Mock fetch responses used in all Editor tests. */
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
			return new Response(
				JSON.stringify({
					data: {
						categories: [{ id: "developer-platform", label: "Developer Platform", color: "#2563eb" }],
						services: [
							{
								typeId: "workers",
								officialName: "Cloudflare Workers",
								shortName: "Workers",
								category: "developer-platform",
								iconPath: "workers.svg",
								docUrl: "https://developers.cloudflare.com/workers/",
							},
						],
						edgeTypes: [],
					},
				}),
				{ status: 200 },
			);
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

/** Renders the Editor inside all required providers. */
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
 * Waits for the ReactFlow canvas to appear, confirming the API data has loaded.
 *
 * Seeding the store AFTER this point is required because the Editor's
 * `useEffect` calls `setDiagram` when data loads, which would overwrite earlier
 * seeds.
 */
async function waitForCanvas() {
	await waitFor(() => screen.getByTestId("reactflow"));
}

/**
 * Creates a synthetic DragEvent with a mocked `dataTransfer` object.
 *
 * @param typeId - The service typeId to set in the transfer data.
 *   Pass an empty string to simulate a drop with no service data.
 * @returns A DragEvent with `dataTransfer.getData` configured.
 */
function makeDragEvent(typeId: string): DragEvent {
	const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
	Object.defineProperty(event, "clientX", { value: 500, writable: false });
	Object.defineProperty(event, "clientY", { value: 300, writable: false });
	Object.defineProperty(event, "dataTransfer", {
		value: {
			getData: (type: string) => (type === "application/cf-architect-service" ? typeId : ""),
			dropEffect: "move",
		},
		writable: true,
	});
	return event;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("EditorDrop", () => {
	beforeEach(() => {
		resetStores();
		mockZoomIn.mockClear();
		mockZoomOut.mockClear();
		mockFitView.mockClear();
		mockScreenToFlowPosition.mockClear().mockReturnValue({ x: 100, y: 200 });
		capturedHandlers.onNodeClick = undefined;
		capturedHandlers.onEdgeClick = undefined;
		capturedHandlers.onPaneClick = undefined;
		vi.restoreAllMocks();
		setupFetch();
	});

	afterEach(() => {
		resetStores();
	});

	// ── onDragOver ─────────────────────────────────────────────────────────────

	it("onDragOver sets dropEffect to 'move' to allow the drop", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");
		const dragOverEvent = new Event("dragover", { bubbles: true }) as DragEvent;
		const dataTransfer = { dropEffect: "" };
		Object.defineProperty(dragOverEvent, "dataTransfer", { value: dataTransfer, writable: true });

		fireEvent(canvas, dragOverEvent);

		expect(dataTransfer.dropEffect).toBe("move");
	});

	// ── Drop creates a node ────────────────────────────────────────────────────

	it("dropping a service creates a new node at the canvas position", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");
		fireEvent(canvas, makeDragEvent("workers"));

		// Wait for the store to reflect the new node.
		await waitFor(() => expect(useDiagramStore.getState().nodes).toHaveLength(1));

		const node = useDiagramStore.getState().nodes[0];
		expect(node.position).toEqual({ x: 100, y: 200 });
		expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 500, y: 300 });
	});

	it("dropped node has a ULID id", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");
		fireEvent(canvas, makeDragEvent("workers"));

		await waitFor(() => expect(useDiagramStore.getState().nodes).toHaveLength(1));

		const node = useDiagramStore.getState().nodes[0];
		expect(node.id).toMatch(ULID_PATTERN);
	});

	it("dropped node has type 'cloudflareService'", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");
		fireEvent(canvas, makeDragEvent("workers"));

		await waitFor(() => expect(useDiagramStore.getState().nodes).toHaveLength(1));

		const node = useDiagramStore.getState().nodes[0];
		expect(node.type).toBe("cloudflareService");
	});

	it("dropped node data.label is set to the service shortName", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");
		fireEvent(canvas, makeDragEvent("workers"));

		await waitFor(() => expect(useDiagramStore.getState().nodes).toHaveLength(1));

		const node = useDiagramStore.getState().nodes[0];
		expect((node.data as Record<string, unknown>).label).toBe("Workers");
	});

	it("dropped node is immediately selected", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");
		fireEvent(canvas, makeDragEvent("workers"));

		await waitFor(() => expect(useDiagramStore.getState().nodes).toHaveLength(1));

		const node = useDiagramStore.getState().nodes[0];
		expect(node.selected).toBe(true);
	});

	it("dropping a second node deselects the first node", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");

		// Drop the first node — it should be selected.
		fireEvent(canvas, makeDragEvent("workers"));
		await waitFor(() => expect(useDiagramStore.getState().nodes).toHaveLength(1));
		expect(useDiagramStore.getState().nodes[0].selected).toBe(true);

		// Drop a second node — first node must be deselected, second selected.
		fireEvent(canvas, makeDragEvent("workers"));
		await waitFor(() => expect(useDiagramStore.getState().nodes).toHaveLength(2));

		const [first, second] = useDiagramStore.getState().nodes;
		expect(first.selected).toBe(false);
		expect(second.selected).toBe(true);
	});

	it("dropping with an unknown typeId does not create a node", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");
		fireEvent(canvas, makeDragEvent("nonexistent-service-id"));

		// No node should be added — give React a moment to process.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(useDiagramStore.getState().nodes).toHaveLength(0);
	});

	it("dropping with empty transfer data does not create a node", async () => {
		renderEditor();
		await waitForCanvas();

		const canvas = screen.getByTestId("reactflow");
		// Pass empty string as typeId — simulates drop with no service data.
		fireEvent(canvas, makeDragEvent(""));

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(useDiagramStore.getState().nodes).toHaveLength(0);
	});

	// ── Selection handlers ─────────────────────────────────────────────────────

	it("onNodeClick sets selectedNodeId in the UI store", async () => {
		renderEditor();
		await waitForCanvas();

		expect(capturedHandlers.onNodeClick).toBeDefined();
		capturedHandlers.onNodeClick?.({} as React.MouseEvent, { id: "node-abc" } as { id: string });

		expect(useUIStore.getState().selectedNodeId).toBe("node-abc");
		// Selecting a node must clear any edge selection.
		expect(useUIStore.getState().selectedEdgeId).toBeNull();
	});

	it("onEdgeClick sets selectedEdgeId in the UI store", async () => {
		renderEditor();
		await waitForCanvas();

		expect(capturedHandlers.onEdgeClick).toBeDefined();
		capturedHandlers.onEdgeClick?.({} as React.MouseEvent, { id: "edge-xyz" } as { id: string });

		expect(useUIStore.getState().selectedEdgeId).toBe("edge-xyz");
		// Selecting an edge must clear any node selection.
		expect(useUIStore.getState().selectedNodeId).toBeNull();
	});

	it("onPaneClick clears both node and edge selection", async () => {
		// Seed both selections.
		useUIStore.setState({ selectedNodeId: "n1", selectedEdgeId: "e1" });

		renderEditor();
		await waitForCanvas();

		expect(capturedHandlers.onPaneClick).toBeDefined();
		capturedHandlers.onPaneClick?.();

		expect(useUIStore.getState().selectedNodeId).toBeNull();
		expect(useUIStore.getState().selectedEdgeId).toBeNull();
	});
});
