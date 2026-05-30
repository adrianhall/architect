import {
	Background,
	BackgroundVariant,
	Controls,
	type Edge,
	MiniMap,
	type Node,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import { type DragEvent, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ulid } from "ulid";
import { useCatalog, useDiagram } from "@/api";
import { edgeTypes } from "@/components/canvas/edgeTypes";
import { nodeTypes } from "@/components/canvas/nodeTypes";
import { toReactFlowEdge, toReactFlowNode } from "@/components/canvas/utils";
import { ServicePalette } from "@/components/palette/ServicePalette";
import { useDiagramStore } from "@/stores/diagram";
import { useUIStore } from "@/stores/ui";

/**
 * Inner canvas component — must be a child of `<ReactFlowProvider>` so that
 * `useReactFlow()` resolves correctly.
 *
 * Responsibilities:
 * - Fetches the diagram and service catalog from the API on mount.
 * - Hydrates the Zustand diagram store when both datasets arrive.
 * - Renders `<ReactFlow>` with `<MiniMap>`, `<Controls>`, and a dotted
 *   `<Background>` grid.
 * - Attaches global keyboard shortcuts: Delete/Backspace (remove selected
 *   nodes/edges), `+`/`-` (zoom in/out), `Ctrl+Shift+F` / `Cmd+Shift+F`
 *   (fit view). Shortcuts are suppressed when focus is inside an `<input>`,
 *   `<textarea>`, or a `contenteditable` element.
 * - Wires the `onConnect` handler from the diagram store so dragging from one
 *   node handle to another creates a new `data-flow` edge with a ULID id.
 *   Self-loop connections are silently rejected by the store.
 * - Provides `onDrop` / `onDragOver` handlers so that services dragged from
 *   the palette sidebar are placed on the canvas as new nodes at the cursor
 *   position.
 * - Tracks the selected node and edge in the `useUIStore` so that the
 *   properties panel (ISSUE-16) receives the correct item to display.
 *
 * @returns The full-page React Flow canvas with controls and minimap, or a
 *   loading indicator while data is in-flight.
 */
function EditorCanvas() {
	const { id } = useParams<{ id: string }>();
	const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();

	// Server state — TanStack Query hooks from ISSUE-11
	const { data: diagram, isLoading: diagramLoading } = useDiagram(id ?? "");
	const { data: catalog, isLoading: catalogLoading } = useCatalog();

	// Canvas state — Zustand diagram store
	const nodes = useDiagramStore((s) => s.nodes);
	const edges = useDiagramStore((s) => s.edges);
	const onNodesChange = useDiagramStore((s) => s.onNodesChange);
	const onEdgesChange = useDiagramStore((s) => s.onEdgesChange);
	const onConnect = useDiagramStore((s) => s.onConnect);
	const setDiagram = useDiagramStore((s) => s.setDiagram);
	const removeNodes = useDiagramStore((s) => s.removeNodes);
	const removeEdges = useDiagramStore((s) => s.removeEdges);
	const addNode = useDiagramStore((s) => s.addNode);

	// UI state — Zustand UI store
	const setSelectedNode = useUIStore((s) => s.setSelectedNode);
	const setSelectedEdge = useUIStore((s) => s.setSelectedEdge);
	const clearSelection = useUIStore((s) => s.clearSelection);

	// Hydrate the Zustand store when both the diagram and catalog have loaded.
	useEffect(() => {
		if (diagram && catalog) {
			const rfNodes = diagram.graph_data.nodes.map((n) => toReactFlowNode(n, catalog));
			const rfEdges = diagram.graph_data.edges.map((e) => toReactFlowEdge(e));
			setDiagram(rfNodes, rfEdges, diagram.graph_data.viewport);
		}
	}, [diagram, catalog, setDiagram]);

	/**
	 * Global keyboard shortcut handler.
	 *
	 * Guards against text-input focus so that typing in a rename field or
	 * properties panel does not accidentally delete nodes or zoom the canvas.
	 *
	 * React Flow's built-in `deleteKeyCode` is set to `null` so this handler
	 * has sole ownership of delete behavior.
	 */
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// Suppress shortcuts when focus is inside a text entry element.
			const target = event.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
				return;
			}

			// Delete / Backspace — remove all currently selected nodes and edges.
			if (event.key === "Delete" || event.key === "Backspace") {
				event.preventDefault();
				const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
				const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);
				if (selectedNodeIds.length > 0) removeNodes(selectedNodeIds);
				if (selectedEdgeIds.length > 0) removeEdges(selectedEdgeIds);
				return;
			}

			// + / = — zoom in (= is the unshifted + on most keyboards).
			if (event.key === "+" || event.key === "=") {
				event.preventDefault();
				zoomIn();
				return;
			}

			// - — zoom out.
			if (event.key === "-") {
				event.preventDefault();
				zoomOut();
				return;
			}

			// Ctrl+Shift+F / Cmd+Shift+F — fit view to all nodes.
			if (event.key === "f" && event.shiftKey && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				fitView({ padding: 0.1 });
			}
		},
		[nodes, edges, removeNodes, removeEdges, zoomIn, zoomOut, fitView],
	);

	// Attach the keyboard listener to the document. Cleaned up on unmount.
	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	/**
	 * Prevents the browser's default drag-over behavior so the canvas accepts
	 * drops. Sets `dropEffect = "move"` to show the correct cursor affordance.
	 */
	const handleDragOver = useCallback((event: DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	}, []);

	/**
	 * Handles a service being dropped from the palette onto the canvas.
	 *
	 * Reads the `typeId` from the drag transfer data, looks up the service in
	 * the catalog, converts the browser viewport drop coordinates to React Flow
	 * canvas coordinates (accounting for pan and zoom), and adds a new node at
	 * that position.
	 *
	 * Before adding the new node, every currently-selected node is deselected
	 * so that only the freshly dropped node ends up selected. This matches the
	 * behaviour of standard diagramming tools (Figma, Lucidchart, etc.) where
	 * dropping a component replaces the current selection.
	 *
	 * `useDiagramStore.getState()` is used inside the handler instead of
	 * closing over the `nodes` reactive value. This avoids adding `nodes` to
	 * the `useCallback` dependency array, which would recreate the handler on
	 * every node-position change (very frequent during canvas drag operations).
	 *
	 * If the drop carries no `typeId`, or the `typeId` is not found in the
	 * catalog, the drop is silently ignored and no node is created.
	 */
	const handleDrop = useCallback(
		(event: DragEvent) => {
			event.preventDefault();

			const typeId = event.dataTransfer.getData("application/cf-architect-service");
			if (!typeId || !catalog) return;

			// Look up the service in the catalog.
			const service = catalog.services.find((s) => s.typeId === typeId);
			if (!service) return;

			const category = catalog.categories.find((c) => c.id === service.category);

			// Convert browser viewport coordinates to React Flow canvas coordinates.
			// `screenToFlowPosition` accounts for the current pan and zoom level.
			const position = screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});

			const newNode: Node = {
				id: ulid(),
				type: "cloudflareService",
				position,
				data: {
					label: service.shortName,
					serviceTypeId: typeId,
					iconUrl: `/catalog/icons/${service.iconPath}`,
					categoryColor: category?.color ?? "#6b7280",
				},
				selected: true,
			};

			// Deselect every currently-selected node so only the dropped node
			// ends up selected. Reading from getState() avoids a stale closure
			// without adding `nodes` to the useCallback dependency array.
			useDiagramStore.getState().deselectAllNodes();

			addNode(newNode);
		},
		[catalog, screenToFlowPosition, addNode],
	);

	/**
	 * Tracks the clicked node in the UI store so the properties panel can
	 * display its details.
	 */
	const handleNodeClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			setSelectedNode(node.id);
		},
		[setSelectedNode],
	);

	/**
	 * Tracks the clicked edge in the UI store so the properties panel can
	 * display its details.
	 */
	const handleEdgeClick = useCallback(
		(_event: React.MouseEvent, edge: Edge) => {
			setSelectedEdge(edge.id);
		},
		[setSelectedEdge],
	);

	/**
	 * Clears the selection in the UI store when the user clicks on empty canvas
	 * space (not on a node or edge).
	 */
	const handlePaneClick = useCallback(() => {
		clearSelection();
	}, [clearSelection]);

	if (diagramLoading || catalogLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-muted-foreground">Loading…</p>
			</div>
		);
	}

	return (
		<div className="flex h-full">
			{/* Service palette sidebar */}
			<aside className="w-60 shrink-0 border-r bg-background">
				<ServicePalette />
			</aside>

			{/* React Flow canvas */}
			<div className="flex-1">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onConnect={onConnect}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onNodeClick={handleNodeClick}
					onEdgeClick={handleEdgeClick}
					onPaneClick={handlePaneClick}
					// fitView is intentionally omitted.  React Flow defers fitView
					// when the node array is empty on mount, then fires it the moment
					// the first node appears — zooming the canvas all the way into that
					// single node.  Subsequent drops are unaffected because fitView
					// only triggers once per component lifecycle.  The keyboard shortcut
					// Ctrl+Shift+F (calls fitView() from useReactFlow) is the explicit
					// way to fit the viewport; the prop is not needed for that.
					// Disable React Flow's built-in delete handling — our handler
					// adds a text-input guard that the built-in handler lacks.
					deleteKeyCode={null}
					// Default edge options for the connection-line preview while dragging.
					defaultEdgeOptions={{ type: "data-flow" }}
					// Visual style of the dragging connection line before it snaps to a handle.
					connectionLineStyle={{ stroke: "#64748b", strokeWidth: 2 }}
				>
					<MiniMap zoomable pannable />
					<Controls />
					<Background variant={BackgroundVariant.Dots} gap={16} size={1} />
				</ReactFlow>
			</div>
		</div>
	);
}

/**
 * Architecture diagram editor page.
 *
 * Wraps `EditorCanvas` in a `ReactFlowProvider` so that `useReactFlow()`
 * (which is called inside `EditorCanvas`) can access React Flow's internal
 * context. The provider must be a parent — not a sibling — of the component
 * that calls `useReactFlow()`.
 *
 * The page layout is a horizontal flex container:
 * - Left: a 240 px service palette sidebar listing all Cloudflare services
 *   grouped by category.
 * - Right: the full React Flow canvas with minimap, controls, background grid,
 *   keyboard shortcuts, and drag-drop node creation.
 *
 * Route: `/editor/:id` (requires authentication via `ProtectedRoute`).
 *
 * @returns The editor page with a palette sidebar and full-page React Flow
 *   canvas.
 *
 * @example
 * ```tsx
 * // In App.tsx:
 * <Route path="/editor/:id" element={<Editor />} />
 * ```
 */
export function Editor() {
	return (
		<ReactFlowProvider>
			<EditorCanvas />
		</ReactFlowProvider>
	);
}
