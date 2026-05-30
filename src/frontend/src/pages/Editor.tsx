import {
	Background,
	BackgroundVariant,
	Controls,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useCatalog, useDiagram } from "@/api";
import { edgeTypes } from "@/components/canvas/edgeTypes";
import { nodeTypes } from "@/components/canvas/nodeTypes";
import { toReactFlowEdge, toReactFlowNode } from "@/components/canvas/utils";
import { useDiagramStore } from "@/stores/diagram";

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
 *
 * @returns The full-page React Flow canvas with controls and minimap, or a
 *   loading indicator while data is in-flight.
 */
function EditorCanvas() {
	const { id } = useParams<{ id: string }>();
	const { fitView, zoomIn, zoomOut } = useReactFlow();

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

	if (diagramLoading || catalogLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-muted-foreground">Loading…</p>
			</div>
		);
	}

	return (
		<div className="h-full w-full">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				fitView
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
 * Route: `/editor/:id` (requires authentication via `ProtectedRoute`).
 *
 * @returns The editor page with a full-page React Flow canvas, minimap,
 *   controls, background grid, and keyboard shortcuts.
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
