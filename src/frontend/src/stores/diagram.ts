import {
	applyEdgeChanges,
	applyNodeChanges,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	type Viewport,
} from "@xyflow/react";
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
 * palette drag-drop, and the auto-save layer.
 *
 * Note: undo/redo is deferred to ISSUE-17; `onConnect` is deferred to
 * ISSUE-14. This store intentionally excludes both for now.
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
 * `onEdgesChange`) and imperative mutation actions (`addNode`, `removeNodes`,
 * `removeEdges`, `setDiagram`).
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

	setDiagram: (nodes, edges, viewport) => {
		set({ nodes, edges, viewport: viewport ?? DEFAULT_VIEWPORT });
	},
}));
