import { getValueOrDefault } from "@architect/shared";
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
import { type DragEvent, useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { ulid } from "ulid";
import { useCatalog, useDiagram } from "@/api";
import { edgeTypes } from "@/components/canvas/edgeTypes";
import { LayoutButton } from "@/components/canvas/LayoutButton";
import { nodeTypes } from "@/components/canvas/nodeTypes";
import { SaveStatus } from "@/components/canvas/SaveStatus";
import { toReactFlowEdge, toReactFlowNode } from "@/components/canvas/utils";
import { ServicePalette } from "@/components/palette/ServicePalette";
import PropertiesPanel from "@/components/panels/PropertiesPanel";
import { useDiagramStore } from "@/stores/diagram";
import type { Position } from "@/stores/operations";
import { useUIStore } from "@/stores/ui";
import { createRestSync } from "@/sync/restSync";
import { useDiagramSync } from "@/sync/useDiagramSync";

/**
 * Module-level singleton `DiagramSync` instance.
 *
 * Created once — not inside `EditorCanvas` — so it is never recreated on
 * re-renders (which would cause the `useDiagramSync` effect to re-subscribe
 * unnecessarily). The REST implementation is stateless, so sharing a single
 * instance across all renders is safe.
 */
const restSync = createRestSync();

/**
 * Inner canvas component — must be a child of `<ReactFlowProvider>` so that
 * `useReactFlow()` resolves correctly.
 *
 * Responsibilities:
 * - Fetches the diagram and service catalog from the API on mount.
 * - Hydrates the Zustand diagram store (including `diagramId`, `title`, and
 *   `version`) when both datasets arrive via `loadDiagram`.
 * - Mounts `useDiagramSync` to auto-save changes through the `DiagramSync`
 *   abstraction (debounced 500 ms PUT requests via `RestSync`).
 * - Renders `<SaveStatus>` in a bottom status bar showing the current
 *   save state.
 * - Renders `<ReactFlow>` with `<MiniMap>`, `<Controls>`, and a dotted
 *   `<Background>` grid.
 * - Attaches global keyboard shortcuts:
 *   - Delete/Backspace: remove selected nodes/edges.
 *   - `+`/`-`: zoom in/out.
 *   - `Ctrl+Shift+F` / `Cmd+Shift+F`: fit view.
 *   - `Ctrl/Cmd+Z`: undo last operation.
 *   - `Ctrl/Cmd+Shift+Z`: redo last undone operation.
 *   - `Ctrl/Cmd+Y`: redo (Windows convention).
 *   Shortcuts are suppressed when focus is inside a text `<input>`,
 *   `<textarea>`, or a `contenteditable` element. Non-text inputs
 *   (`checkbox`, `radio`) do NOT block shortcuts.
 * - Wires the `onConnect` handler from the diagram store so dragging from one
 *   node handle to another creates a new `data-flow` edge with a ULID id.
 *   Self-loop connections are silently rejected by the store.
 * - Provides `onDrop` / `onDragOver` handlers so that services dragged from
 *   the palette sidebar are placed on the canvas as new nodes at the cursor
 *   position.
 * - Tracks node drag start positions via `onNodeDragStart` and records the
 *   completed move via `onNodeDragStop`, so node drags are undoable.
 * - Uses `onSelectionChange` (not separate `onNodeClick`/`onEdgeClick`) so
 *   that multi-select is detected correctly: the properties panel is only shown
 *   when exactly one node or one edge is selected.
 *
 * @returns The full-page React Flow canvas with controls and minimap, or a
 *   loading indicator while data is in-flight.
 */
function EditorCanvas() {
	const { id } = useParams<{ id: string }>();
	const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();

	// Server state — TanStack Query hooks from ISSUE-11
	const { data: diagram, isLoading: diagramLoading } = useDiagram(getValueOrDefault(id, ""));
	const { data: catalog, isLoading: catalogLoading } = useCatalog();

	// Canvas state — Zustand diagram store
	const nodes = useDiagramStore((s) => s.nodes);
	const edges = useDiagramStore((s) => s.edges);
	const onNodesChange = useDiagramStore((s) => s.onNodesChange);
	const onEdgesChange = useDiagramStore((s) => s.onEdgesChange);
	const onConnect = useDiagramStore((s) => s.onConnect);
	const loadDiagram = useDiagramStore((s) => s.loadDiagram);
	const removeNodes = useDiagramStore((s) => s.removeNodes);
	const removeEdges = useDiagramStore((s) => s.removeEdges);
	const addNode = useDiagramStore((s) => s.addNode);

	// UI state — Zustand UI store
	const setSelectedNode = useUIStore((s) => s.setSelectedNode);
	const setSelectedEdge = useUIStore((s) => s.setSelectedEdge);
	const clearSelection = useUIStore((s) => s.clearSelection);
	const selectedNodeId = useUIStore((s) => s.selectedNodeId);
	const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
	// Show the panel only when exactly one element is selected.
	const hasSelection = selectedNodeId !== null || selectedEdgeId !== null;

	// Auto-save — debounced 500 ms; `beforeunload` guard when dirty.
	const { status: saveStatus, lastSavedAt, errorMessage } = useDiagramSync(getValueOrDefault(id, ""), restSync);

	/**
	 * Tracks the canvas position of each node at the start of a drag operation.
	 * Keyed by node ID. Cleared per-node on drag stop.
	 *
	 * A ref is used (not state) because drag-start positions are transient
	 * tracking data that must not trigger re-renders. Using state here would
	 * cause `onNodeDragStop` to capture a stale closure (the pre-re-render
	 * function), making it unable to find the start position it just recorded.
	 */
	const dragStartPositionsRef = useRef<Map<string, Position>>(new Map());

	// Hydrate the Zustand store when both the diagram and catalog have loaded.
	// Uses `loadDiagram` (instead of the old `setDiagram`) so that
	// `diagramId`, `title`, and `version` are also initialised for auto-save.
	useEffect(() => {
		if (diagram && catalog) {
			const rfNodes = diagram.graph_data.nodes.map((n) => toReactFlowNode(n, catalog));
			const rfEdges = diagram.graph_data.edges.map((e) => toReactFlowEdge(e));
			loadDiagram(diagram.id, diagram.title, rfNodes, rfEdges, diagram.graph_data.viewport, diagram.version);
		}
	}, [diagram, catalog, loadDiagram]);

	/**
	 * Global keyboard shortcut handler.
	 *
	 * Guards against text-input focus so that typing in a rename field or
	 * properties panel does not accidentally delete nodes or trigger undo/redo.
	 * The check is intentionally narrow: only text-type inputs, textareas, and
	 * contenteditable elements block shortcuts. Non-text inputs (checkbox,
	 * radio, etc.) pass through so their host components can handle them.
	 *
	 * React Flow's built-in `deleteKeyCode` is set to `null` so this handler
	 * has sole ownership of delete behavior.
	 *
	 * Shortcut order (checked first-to-last):
	 * 1. Undo / Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y) — placed
	 *    BEFORE delete/zoom so they are never shadowed by other checks.
	 * 2. Delete / Backspace — remove selected nodes and edges.
	 * 3. + / = — zoom in.
	 * 4. - — zoom out.
	 * 5. Ctrl/Cmd+Shift+F — fit view.
	 */
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// Suppress shortcuts when focus is inside a text entry element.
			// Refined to allow non-text inputs (checkbox, radio) through.
			const target = event.target as HTMLElement;
			const isTextInput =
				(target.tagName === "INPUT" &&
					["text", "search", "url", "tel", "password", "number", "email"].includes(
						(target as HTMLInputElement).type,
					)) ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (isTextInput) return;

			const mod = event.metaKey || event.ctrlKey;

			// Undo / Redo — checked first so they are not shadowed.
			if (mod && event.key === "z" && !event.shiftKey) {
				event.preventDefault();
				useDiagramStore.getState().undo();
				return;
			}
			if (mod && event.key === "z" && event.shiftKey) {
				event.preventDefault();
				useDiagramStore.getState().redo();
				return;
			}
			if (mod && event.key === "y") {
				event.preventDefault();
				useDiagramStore.getState().redo();
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
	 * Captures the node's canvas position at the start of a drag operation.
	 *
	 * Stores the starting position in `dragStartPositionsRef` keyed by the
	 * node ID so that `onNodeDragStop` can compute the delta and call
	 * `moveNode`. Writing to a ref does not trigger a re-render (intentional —
	 * drag positions are transient state that should not cause component
	 * updates).
	 *
	 * @param _event - The mouse event (unused; present for React Flow compatibility).
	 * @param node - The node being dragged, with its current position.
	 */
	const onNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
		dragStartPositionsRef.current.set(node.id, node.position);
	}, []);

	/**
	 * Records the completed node move as an undoable operation.
	 *
	 * Called by React Flow after the user releases the mouse button at the end
	 * of a drag. Reads the start position from `dragStartPositionsRef` (always
	 * current — refs are not subject to stale closure issues). If the position
	 * changed, calls `moveNode` to update the store and push the operation onto
	 * the undo stack. Cleans up the drag start position entry regardless of
	 * whether the node actually moved.
	 *
	 * @param _event - The mouse event (unused; present for React Flow compatibility).
	 * @param node - The node that was dragged, with its final canvas position.
	 */
	const onNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
		const from = dragStartPositionsRef.current.get(node.id);
		if (from && (from.x !== node.position.x || from.y !== node.position.y)) {
			useDiagramStore.getState().moveNode(node.id, from, node.position);
		}
		dragStartPositionsRef.current.delete(node.id);
	}, []);

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
	 * Unified selection handler driven by React Flow's `onSelectionChange`.
	 *
	 * `onSelectionChange` fires on every selection-state change — single click,
	 * Shift+Click multi-select, drag-marquee select, and programmatic changes —
	 * and receives the **complete** current selection rather than just the
	 * element that was last clicked. This makes it the single source of truth
	 * for the properties panel.
	 *
	 * Routing logic:
	 * - Exactly 1 node, 0 edges selected → `setSelectedNode`
	 * - Exactly 0 nodes, 1 edge selected → `setSelectedEdge`
	 * - Any other combination (0 items, multiple nodes, multiple edges, mixed) →
	 *   `clearSelection` — the properties panel hides for multi-select because
	 *   it cannot meaningfully display properties for more than one element.
	 */
	const handleSelectionChange = useCallback(
		({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
			if (selectedNodes.length === 1 && selectedEdges.length === 0) {
				setSelectedNode(selectedNodes[0].id);
			} else if (selectedNodes.length === 0 && selectedEdges.length === 1) {
				setSelectedEdge(selectedEdges[0].id);
			} else {
				// Covers: nothing selected, multi-select, or mixed node+edge selection.
				clearSelection();
			}
		},
		[setSelectedNode, setSelectedEdge, clearSelection],
	);

	/**
	 * Clears the selection in the UI store when the user clicks on empty canvas
	 * space. Belt-and-suspenders alongside `handleSelectionChange` — React Flow
	 * also fires `onSelectionChange` with empty arrays on a pane click, but
	 * being explicit here makes the intent unambiguous.
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
		<div className="flex h-full flex-col">
			{/* Canvas toolbar — layout and other canvas-wide controls */}
			<div className="flex items-center gap-2 border-b bg-background px-2 py-1">
				<LayoutButton />
			</div>

			{/* Main canvas area — palette, canvas, optional properties panel */}
			<div className="flex flex-1 overflow-hidden">
				{/* Service palette sidebar */}
				<aside className="w-60 shrink-0 border-r bg-background">
					<ServicePalette />
				</aside>

				{/* React Flow canvas — flex-1 takes remaining space after palette and panel */}
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
						onSelectionChange={handleSelectionChange}
						onPaneClick={handlePaneClick}
						onNodeDragStart={onNodeDragStart}
						onNodeDragStop={onNodeDragStop}
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
						// Hide the "React Flow" attribution link. CF-Architect is an internal
						// tool and is not a commercial product; removing the attribution is
						// permitted under the React Flow open-source license terms.
						proOptions={{ hideAttribution: true }}
					>
						<MiniMap zoomable pannable />
						<Controls />
						<Background variant={BackgroundVariant.Dots} gap={16} size={1} />
					</ReactFlow>
				</div>

				{/* Properties panel — shown only when a node or edge is selected */}
				{hasSelection && (
					<aside className="w-72 shrink-0 border-l bg-background">
						<PropertiesPanel />
					</aside>
				)}
			</div>

			{/* Status bar — always visible at the bottom of the editor */}
			<div className="flex items-center justify-between border-t bg-background px-4 py-1">
				<SaveStatus
					status={saveStatus}
					lastSavedAt={lastSavedAt}
					errorMessage={errorMessage}
					onReload={() => window.location.reload()}
				/>
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
 * The page layout is a vertical flex container:
 * - Top: a horizontal area with palette sidebar, canvas, and optional
 *   properties panel.
 * - Bottom: a status bar showing the current auto-save state (`SaveStatus`).
 *
 * The canvas area is:
 * - Left: a 240 px service palette sidebar listing all Cloudflare services
 *   grouped by category.
 * - Center: the full React Flow canvas with minimap, controls, background grid,
 *   keyboard shortcuts, and drag-drop node creation.
 * - Right (conditional): a 288 px properties panel shown only when a node or
 *   edge is selected. Hidden when nothing is selected so the canvas uses the
 *   full remaining width.
 *
 * Route: `/editor/:id` (requires authentication via `ProtectedRoute`).
 *
 * @returns The editor page with a palette sidebar, full-page React Flow
 *   canvas, and status bar.
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
