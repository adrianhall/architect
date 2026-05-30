import {
	applyEdgeChanges,
	applyNodeChanges,
	type Connection,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	type Viewport,
} from "@xyflow/react";
import { ulid } from "ulid";
import { create } from "zustand";

/**
 * Default viewport state — origin with 100% zoom.
 *
 * Used as the fallback when no viewport is persisted in the API response
 * (e.g. a freshly created diagram with no saved pan/zoom).
 */
const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/**
 * Shape of the Zustand diagram store.
 *
 * Owns all canvas state: nodes, edges, and viewport. Provides React Flow
 * change handlers and imperative mutation actions used by keyboard shortcuts,
 * palette drag-drop, connection handling, and the auto-save layer.
 */
interface DiagramState {
	/** All nodes currently on the canvas. */
	nodes: Node[];
	/** All edges (connections) currently on the canvas. */
	edges: Edge[];
	/** Current viewport — pan offset and zoom level. */
	viewport: Viewport;

	/**
	 * React Flow change handler for nodes.
	 *
	 * Must be passed directly to the `onNodesChange` prop of `<ReactFlow>`.
	 * Delegates to React Flow's `applyNodeChanges` utility which handles
	 * position, selection, dimension, and removal changes from the canvas.
	 *
	 * @param changes - Array of `NodeChange` objects emitted by React Flow.
	 */
	onNodesChange: (changes: NodeChange[]) => void;

	/**
	 * React Flow change handler for edges.
	 *
	 * Must be passed directly to the `onEdgesChange` prop of `<ReactFlow>`.
	 * Delegates to React Flow's `applyEdgeChanges` utility which handles
	 * selection and removal changes.
	 *
	 * @param changes - Array of `EdgeChange` objects emitted by React Flow.
	 */
	onEdgesChange: (changes: EdgeChange[]) => void;

	/**
	 * Appends a single node to the canvas.
	 *
	 * Used by the palette drop handler (ISSUE-15) to place a dragged service
	 * onto the canvas.
	 *
	 * @param node - A fully constructed React Flow `Node` to add.
	 */
	addNode: (node: Node) => void;

	/**
	 * Clears the `selected` flag on every node currently in the store.
	 *
	 * Used by the palette drop handler before adding a newly dropped node so
	 * that only the freshly placed node ends up selected. Mutating `selected`
	 * directly (rather than via `onNodesChange` / `applyNodeChanges`) avoids
	 * a dependency on the React Flow utility and works correctly in tests where
	 * `applyNodeChanges` is replaced with a no-op mock.
	 */
	deselectAllNodes: () => void;

	/**
	 * Removes one or more nodes from the canvas by their IDs.
	 *
	 * Also removes any edges whose `source` or `target` matches a removed
	 * node, preventing orphaned connections.
	 *
	 * @param ids - Array of node IDs to remove.
	 */
	removeNodes: (ids: string[]) => void;

	/**
	 * Removes one or more edges from the canvas by their IDs.
	 *
	 * Nodes are not affected.
	 *
	 * @param ids - Array of edge IDs to remove.
	 */
	removeEdges: (ids: string[]) => void;

	/**
	 * Appends a single, fully constructed edge to the canvas.
	 *
	 * Unlike `onConnect` (which creates a new edge from a React Flow
	 * `Connection` object), `addEdge` accepts a pre-built `Edge` and is used
	 * for programmatic edge insertion — for example, by the undo/redo system
	 * (ISSUE-17) re-applying a previously deleted edge.
	 *
	 * @param edge - A fully constructed React Flow `Edge` to add.
	 */
	addEdge: (edge: Edge) => void;

	/**
	 * Merges partial updates onto an existing edge identified by `edgeId`.
	 *
	 * Performs a shallow merge: top-level fields in `updates` overwrite the
	 * corresponding fields on the existing edge while all other fields remain
	 * unchanged. Used by the properties panel (ISSUE-16) to change individual
	 * edge fields such as `type`, `data.label`, or `data.protocol`.
	 *
	 * If `edgeId` does not exist in the current edges array the call is a
	 * no-op — no error is thrown and the edges array is not mutated.
	 *
	 * @param edgeId - The `id` of the edge to update.
	 * @param updates - Partial edge fields to merge onto the existing edge.
	 *
	 * @example
	 * ```ts
	 * updateEdge("01HX...", { type: "binding", data: { label: "KV" } });
	 * ```
	 */
	updateEdge: (edgeId: string, updates: Partial<Edge>) => void;

	/**
	 * Deeply merges updates into the `data` object of a node identified by
	 * `nodeId`.
	 *
	 * Only the keys present in `dataUpdates` are overwritten; all other keys
	 * on the existing `node.data` object are preserved. This is the correct
	 * action for updating individual node properties such as `label`,
	 * `description`, or `accentColor` without accidentally clearing unrelated
	 * fields.
	 *
	 * If `nodeId` does not exist in the current nodes array the call is a
	 * no-op — no error is thrown and the nodes array is not mutated.
	 *
	 * @param nodeId - The `id` of the node whose data to update.
	 * @param dataUpdates - Keys/values to merge onto the existing `node.data`.
	 *
	 * @example
	 * ```ts
	 * // Update only the label; all other data fields are preserved.
	 * updateNodeData("01HX...", { label: "My Worker" });
	 * ```
	 */
	updateNodeData: (nodeId: string, dataUpdates: Record<string, unknown>) => void;

	/**
	 * Deeply merges updates into the `data` object of an edge identified by
	 * `edgeId`.
	 *
	 * Only the keys present in `dataUpdates` are overwritten; all other keys
	 * on the existing `edge.data` object are preserved. This is the correct
	 * action for updating edge metadata such as `label`, `protocol`, or
	 * `description` without clearing other fields.
	 *
	 * To change the top-level `type` of an edge (e.g. from `"data-flow"` to
	 * `"binding"`), use `updateEdge(edgeId, { type: "binding" })` instead —
	 * `updateEdgeData` only touches the nested `edge.data` object.
	 *
	 * If `edgeId` does not exist in the current edges array the call is a
	 * no-op — no error is thrown and the edges array is not mutated.
	 *
	 * @param edgeId - The `id` of the edge whose data to update.
	 * @param dataUpdates - Keys/values to merge onto the existing `edge.data`.
	 *
	 * @example
	 * ```ts
	 * // Update protocol without losing any existing label or description.
	 * updateEdgeData("01HX...", { protocol: "HTTPS" });
	 * ```
	 */
	updateEdgeData: (edgeId: string, dataUpdates: Record<string, unknown>) => void;

	/**
	 * React Flow connection handler — creates a new `data-flow` edge when the
	 * user drags from one node handle to another.
	 *
	 * Must be passed directly to the `onConnect` prop of `<ReactFlow>`. React
	 * Flow calls this handler only when a valid connection is completed (i.e.
	 * the drag ends on a handle, not on empty canvas). The handler performs an
	 * additional self-loop guard: if `connection.source === connection.target`
	 * the connection is silently discarded without adding an edge.
	 *
	 * New edges always receive a ULID `id` and default to `type: "data-flow"`.
	 * Users can change the type via the properties panel (ISSUE-16).
	 *
	 * @param connection - The `Connection` object emitted by React Flow,
	 *   containing `source`, `target`, `sourceHandle`, and `targetHandle`.
	 */
	onConnect: (connection: Connection) => void;

	/**
	 * Replaces the entire diagram state with the provided nodes, edges, and
	 * optional viewport.
	 *
	 * Used by the Editor to hydrate the canvas when API data loads. If no
	 * `viewport` is provided, falls back to `DEFAULT_VIEWPORT`
	 * (`{ x: 0, y: 0, zoom: 1 }`).
	 *
	 * @param nodes - Replacement node array.
	 * @param edges - Replacement edge array.
	 * @param viewport - Optional viewport to restore; defaults to origin + zoom 1.
	 *
	 * @example
	 * ```ts
	 * const { setDiagram } = useDiagramStore.getState();
	 * setDiagram(rfNodes, rfEdges, savedViewport);
	 * ```
	 */
	setDiagram: (nodes: Node[], edges: Edge[], viewport?: Viewport) => void;
}

/**
 * Zustand store that owns all canvas state for the architecture editor.
 *
 * Provides React Flow-compatible change handlers (`onNodesChange`,
 * `onEdgesChange`, `onConnect`) and imperative mutation actions (`addNode`,
 * `removeNodes`, `removeEdges`, `addEdge`, `updateEdge`, `updateNodeData`,
 * `updateEdgeData`, `setDiagram`).
 *
 * Use selector functions to subscribe to individual slices so that components
 * only re-render when the slice they care about changes:
 *
 * @example
 * ```tsx
 * const nodes = useDiagramStore((s) => s.nodes);
 * const addNode = useDiagramStore((s) => s.addNode);
 * ```
 */
export const useDiagramStore = create<DiagramState>((set, get) => ({
	nodes: [],
	edges: [],
	viewport: DEFAULT_VIEWPORT,

	onNodesChange: (changes) => {
		set({ nodes: applyNodeChanges(changes, get().nodes) });
	},

	onEdgesChange: (changes) => {
		set({ edges: applyEdgeChanges(changes, get().edges) });
	},

	addNode: (node) => {
		set({ nodes: [...get().nodes, node] });
	},

	deselectAllNodes: () => {
		const current = get().nodes;
		// Skip the allocation when nothing is selected.
		if (!current.some((n) => n.selected)) return;
		set({ nodes: current.map((n) => (n.selected ? { ...n, selected: false } : n)) });
	},

	removeNodes: (ids) => {
		const idSet = new Set(ids);
		set({
			nodes: get().nodes.filter((n) => !idSet.has(n.id)),
			// Remove any edges connected to the removed nodes to avoid orphaned connections.
			edges: get().edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
		});
	},

	removeEdges: (ids) => {
		const idSet = new Set(ids);
		set({ edges: get().edges.filter((e) => !idSet.has(e.id)) });
	},

	addEdge: (edge) => {
		set({ edges: [...get().edges, edge] });
	},

	updateEdge: (edgeId, updates) => {
		set({
			edges: get().edges.map((e) => (e.id === edgeId ? { ...e, ...updates } : e)),
		});
	},

	updateNodeData: (nodeId, dataUpdates) => {
		set({
			nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...dataUpdates } } : n)),
		});
	},

	updateEdgeData: (edgeId, dataUpdates) => {
		set({
			edges: get().edges.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, ...dataUpdates } } : e)),
		});
	},

	onConnect: (connection) => {
		// Silently reject self-loops — a node cannot connect to itself.
		if (connection.source === connection.target) {
			return;
		}

		// Guard against malformed connections with missing source or target.
		if (!connection.source || !connection.target) {
			return;
		}

		const newEdge: Edge = {
			id: ulid(),
			source: connection.source,
			target: connection.target,
			sourceHandle: connection.sourceHandle ?? undefined,
			targetHandle: connection.targetHandle ?? undefined,
			// Default to data-flow per F4-US4. Users can change the type via
			// the properties panel (ISSUE-16).
			type: "data-flow",
			data: {},
		};

		set({ edges: [...get().edges, newEdge] });
	},

	setDiagram: (nodes, edges, viewport) => {
		set({ nodes, edges, viewport: viewport ?? DEFAULT_VIEWPORT });
	},
}));
