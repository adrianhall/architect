import { getValueOrDefault } from "@architect/shared";
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
import type { Position } from "./operations";
import { applyOperation, type Operation, reverseOperation } from "./operations";

/**
 * Default viewport state — origin with 100% zoom.
 *
 * Used as the fallback when no viewport is persisted in the API response
 * (e.g. a freshly created diagram with no saved pan/zoom).
 */
const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/**
 * Default maximum number of undo steps retained in the history stack.
 *
 * Satisfies F4-US8 which requires at least 50 undoable steps. When the
 * stack exceeds this limit, the oldest entry is discarded.
 */
const DEFAULT_MAX_UNDO_STEPS = 50;

/**
 * Shape of the Zustand diagram store.
 *
 * Owns all canvas state: nodes, edges, viewport, undo/redo history, and
 * auto-save metadata (`dirty`, `version`, `diagramId`, `title`). The
 * auto-save layer reads `dirty`, `version`, `title`, and the canvas data
 * to build the PUT request body; `markClean` is called after a successful
 * save to update the version and clear the dirty flag.
 */
interface DiagramState {
	/** All nodes currently on the canvas. */
	nodes: Node[];
	/** All edges (connections) currently on the canvas. */
	edges: Edge[];
	/** Current viewport — pan offset and zoom level. */
	viewport: Viewport;

	/**
	 * The ULID of the diagram currently loaded in the editor.
	 *
	 * `null` when no diagram has been loaded yet (e.g. before the API
	 * response arrives on first mount).
	 */
	diagramId: string | null;

	/**
	 * Current diagram title.
	 *
	 * Tracked here so the auto-save layer can include it in PUT requests
	 * without needing to read from a separate TanStack Query cache.
	 * Initialised to `""` and set to the API value by `loadDiagram`.
	 */
	title: string;

	/**
	 * Optimistic concurrency version number.
	 *
	 * Mirrors the `version` column in the `diagrams` table. Sent with every
	 * PUT request; the server returns 409 if the stored version differs.
	 * Updated to the server's new value by `markClean`.
	 */
	version: number;

	/**
	 * Whether the canvas has unsaved changes.
	 *
	 * Set to `true` by every mutating action (add, remove, move, update,
	 * undo, redo). Reset to `false` by `loadDiagram` (initial load) and
	 * `markClean` (after a successful auto-save).
	 *
	 * Used by the auto-save hook to skip the debounce when there are no
	 * pending changes, and by the `beforeunload` guard to warn users before
	 * they navigate away with unsaved work.
	 */
	dirty: boolean;

	/**
	 * History stack for undo operations. The last entry is the most recently
	 * applied operation and is the first to be undone. Capped at
	 * `maxUndoSteps` entries; oldest entries are discarded when the cap is
	 * exceeded.
	 */
	undoStack: Operation[];

	/**
	 * History stack for redo operations. Populated when operations are undone.
	 * Cleared whenever a new mutating action is performed.
	 */
	redoStack: Operation[];

	/**
	 * Maximum number of operations retained in the undo stack.
	 *
	 * Defaults to 50 (satisfying F4-US8). Configurable to allow tests to use
	 * smaller values without excessive setup.
	 */
	maxUndoSteps: number;

	/**
	 * React Flow change handler for nodes.
	 *
	 * Must be passed directly to the `onNodesChange` prop of `<ReactFlow>`.
	 * Delegates to React Flow's `applyNodeChanges` utility which handles
	 * position, selection, dimension, and removal changes from the canvas.
	 *
	 * This handler does NOT push undo operations — position changes during a
	 * drag are handled continuously by React Flow and are not individually
	 * undoable. Use `moveNode` on drag stop to record a single position change.
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
	 * This handler does NOT push undo operations.
	 *
	 * @param changes - Array of `EdgeChange` objects emitted by React Flow.
	 */
	onEdgesChange: (changes: EdgeChange[]) => void;

	/**
	 * Appends a single node to the canvas and records an undo operation.
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
	 * that only the freshly placed node ends up selected. This action does NOT
	 * push an undo operation — selection state is not undoable.
	 *
	 * Mutating `selected` directly (rather than via `onNodesChange` /
	 * `applyNodeChanges`) avoids a dependency on the React Flow utility and
	 * works correctly in tests where `applyNodeChanges` is replaced with a
	 * no-op mock.
	 */
	deselectAllNodes: () => void;

	/**
	 * Removes one or more nodes from the canvas and records an undo operation.
	 *
	 * Also removes any edges whose `source` or `target` matches a removed
	 * node, preventing orphaned connections. When multiple IDs are provided,
	 * all removals are bundled into a single `batch` operation so they undo
	 * as one step.
	 *
	 * @param ids - Array of node IDs to remove.
	 */
	removeNodes: (ids: string[]) => void;

	/**
	 * Removes one or more edges from the canvas and records an undo operation.
	 *
	 * When multiple IDs are provided, all removals are bundled into a single
	 * `batch` operation so they undo as one step. Nodes are not affected.
	 *
	 * @param ids - Array of edge IDs to remove.
	 */
	removeEdges: (ids: string[]) => void;

	/**
	 * Appends a single, fully constructed edge to the canvas and records an
	 * undo operation.
	 *
	 * Unlike `onConnect` (which creates a new edge from a React Flow
	 * `Connection` object), `addEdge` accepts a pre-built `Edge` and is used
	 * for programmatic edge insertion — for example, by the undo/redo system
	 * re-applying a previously deleted edge.
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
	 * This action does NOT push an undo operation. Use `updateEdgeData` for
	 * tracked data-field changes.
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
	 * `nodeId` and records an undo operation.
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
	 * `edgeId` and records an undo operation.
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
	 * user drags from one node handle to another and records an undo operation.
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
	 * Routes through `addEdge` internally so the operation is tracked in the
	 * undo stack.
	 *
	 * @param connection - The `Connection` object emitted by React Flow,
	 *   containing `source`, `target`, `sourceHandle`, and `targetHandle`.
	 */
	onConnect: (connection: Connection) => void;

	/**
	 * Records a node move operation after a drag completes.
	 *
	 * Called by the `onNodeDragStop` handler in `Editor.tsx` with the node's
	 * position before and after the drag. Creates a `move_node` operation and
	 * pushes it onto the undo stack. The visual movement during the drag is
	 * handled by React Flow's `onNodesChange` (which does not push operations);
	 * this action only updates the canonical position in the store and records
	 * the change for undo.
	 *
	 * If `from` and `to` are identical, the call is a no-op (no operation is
	 * pushed and no re-render occurs).
	 *
	 * @param nodeId - ID of the node that was moved.
	 * @param from - Canvas position at the start of the drag.
	 * @param to - Canvas position at the end of the drag.
	 *
	 * @example
	 * ```ts
	 * // Called from onNodeDragStop:
	 * useDiagramStore.getState().moveNode(node.id, dragStart, node.position);
	 * ```
	 */
	moveNode: (nodeId: string, from: Position, to: Position) => void;

	/**
	 * Undoes the last operation pushed onto the undo stack.
	 *
	 * Pops the most recent operation from `undoStack`, computes its reverse
	 * via `reverseOperation`, applies it to the current canvas state, and
	 * pushes the original operation onto `redoStack` for potential redo.
	 *
	 * If the undo stack is empty this is a no-op — no error is thrown and
	 * no state is changed.
	 */
	undo: () => void;

	/**
	 * Re-applies the last undone operation from the redo stack.
	 *
	 * Pops the most recent operation from `redoStack`, applies it to the
	 * current canvas state, and pushes it back onto `undoStack`.
	 *
	 * If the redo stack is empty this is a no-op — no error is thrown and
	 * no state is changed.
	 */
	redo: () => void;

	/**
	 * Returns `true` when there is at least one operation on the undo stack.
	 *
	 * Use to enable/disable the Undo toolbar button or menu item.
	 *
	 * @returns `true` if `undoStack` is non-empty, `false` otherwise.
	 */
	canUndo: () => boolean;

	/**
	 * Returns `true` when there is at least one operation on the redo stack.
	 *
	 * Use to enable/disable the Redo toolbar button or menu item.
	 *
	 * @returns `true` if `redoStack` is non-empty, `false` otherwise.
	 */
	canRedo: () => boolean;

	/**
	 * Replaces the entire diagram state with the provided nodes, edges, and
	 * optional viewport, and clears both undo and redo stacks.
	 *
	 * Used by the Editor to hydrate the canvas when API data loads. If no
	 * `viewport` is provided, falls back to `DEFAULT_VIEWPORT`
	 * (`{ x: 0, y: 0, zoom: 1 }`). Loading a new diagram resets history so
	 * actions from a previous diagram cannot be undone in the new one.
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

	/**
	 * Fully initialises the store from an API `DiagramResponse`.
	 *
	 * Sets `diagramId`, `title`, `version`, `nodes`, `edges`, `viewport`, and
	 * resets both undo/redo stacks. Crucially, sets `dirty = false` so the
	 * auto-save layer treats the just-loaded state as clean and does not
	 * immediately schedule a spurious save.
	 *
	 * Call this once in the Editor's data-load effect when both the diagram
	 * and catalog have finished loading, replacing the old `setDiagram` call.
	 *
	 * @param id - The ULID of the loaded diagram.
	 * @param title - The diagram's display title.
	 * @param nodes - React Flow `Node[]` converted from the API's `graph_data.nodes`.
	 * @param edges - React Flow `Edge[]` converted from the API's `graph_data.edges`.
	 * @param viewport - Optional viewport; defaults to `DEFAULT_VIEWPORT`.
	 * @param version - The server-side version number for optimistic concurrency.
	 *
	 * @example
	 * ```ts
	 * useDiagramStore.getState().loadDiagram(id, diagram.title, rfNodes, rfEdges, diagram.graph_data.viewport, diagram.version);
	 * ```
	 */
	loadDiagram: (
		id: string,
		title: string,
		nodes: Node[],
		edges: Edge[],
		viewport: Viewport | undefined,
		version: number,
	) => void;

	/**
	 * Applies a pre-built `batch` operation to the canvas and records it as a
	 * single undo/redo step.
	 *
	 * Used by the ELK auto-layout feature to apply computed node positions as a
	 * batch of `move_node` operations. Because all moves are wrapped in a single
	 * `batch`, the entire layout can be undone with one `Ctrl/Cmd+Z` keystroke.
	 *
	 * The supplied `op` must be a `batch` operation whose sub-operations are all
	 * valid `Operation` variants (most commonly `move_node`). If the batch
	 * contains no sub-operations, the call is a no-op — no undo step is pushed
	 * and `dirty` is not set.
	 *
	 * @param op - A `{ type: "batch"; operations: Operation[] }` object to apply.
	 *
	 * @example
	 * ```ts
	 * useDiagramStore.getState().applyBatchOperation({
	 *   type: "batch",
	 *   operations: [
	 *     { type: "move_node", nodeId: "a", from: { x: 0, y: 0 }, to: { x: 100, y: 50 } },
	 *     { type: "move_node", nodeId: "b", from: { x: 0, y: 0 }, to: { x: 100, y: 200 } },
	 *   ],
	 * });
	 * ```
	 */
	applyBatchOperation: (op: Extract<Operation, { type: "batch" }>) => void;

	/**
	 * Marks the diagram as clean after a successful auto-save.
	 *
	 * Updates `version` to the new value returned by the server and sets
	 * `dirty = false`. The auto-save hook calls this immediately after
	 * receiving a `{ success: true }` `SaveResult`.
	 *
	 * @param newVersion - The new version number returned by the server's PUT response.
	 *
	 * @example
	 * ```ts
	 * const result = await sync.save(diagramId, title, graphData, version);
	 * if (result.success) {
	 *   useDiagramStore.getState().markClean(result.version);
	 * }
	 * ```
	 */
	markClean: (newVersion: number) => void;
}

/**
 * Appends an operation to the undo stack, enforces the stack size cap,
 * clears the redo stack, and marks the diagram as dirty.
 *
 * This function is intentionally NOT part of the public `DiagramState`
 * interface — it is an internal helper called by every mutating action. It
 * encapsulates the four invariants that must hold after any user-initiated
 * change:
 *
 * 1. The new operation is recorded at the top of the undo stack.
 * 2. Any redo history is invalidated (new action breaks the redo branch).
 * 3. The undo stack never exceeds `maxUndoSteps`; the oldest entry is
 *    dropped when the limit is exceeded.
 * 4. `dirty` is set to `true` so the auto-save layer knows a save is needed.
 *
 * @param set - Zustand `set` function for updating store state.
 * @param get - Zustand `get` function for reading current store state.
 * @param op - The operation to push onto the undo stack.
 */
function pushUndoOperation(
	set: (partial: Partial<DiagramState>) => void,
	get: () => DiagramState,
	op: Operation,
): void {
	const { undoStack, maxUndoSteps } = get();
	const newStack = [...undoStack, op];
	// Cap the stack: discard oldest entries when limit exceeded.
	if (newStack.length > maxUndoSteps) {
		newStack.splice(0, newStack.length - maxUndoSteps);
	}
	set({ undoStack: newStack, redoStack: [], dirty: true });
}

/**
 * Zustand store that owns all canvas state for the architecture editor.
 *
 * Provides React Flow-compatible change handlers (`onNodesChange`,
 * `onEdgesChange`, `onConnect`) and imperative mutation actions (`addNode`,
 * `removeNodes`, `removeEdges`, `addEdge`, `updateEdge`, `updateNodeData`,
 * `updateEdgeData`, `moveNode`, `setDiagram`, `undo`, `redo`).
 *
 * All mutating actions (add, remove, move, update) push an `Operation` onto
 * the undo stack so they can be reversed with `undo()`. The undo stack is
 * capped at `maxUndoSteps` (default 50) entries. Any new action clears the
 * redo stack.
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
	diagramId: null,
	title: "",
	version: 1,
	dirty: false,
	undoStack: [],
	redoStack: [],
	maxUndoSteps: DEFAULT_MAX_UNDO_STEPS,

	onNodesChange: (changes) => {
		set({ nodes: applyNodeChanges(changes, get().nodes) });
	},

	onEdgesChange: (changes) => {
		set({ edges: applyEdgeChanges(changes, get().edges) });
	},

	addNode: (node) => {
		const op: Operation = { type: "add_node", node };
		set({ nodes: [...get().nodes, node] });
		pushUndoOperation(set, get, op);
	},

	deselectAllNodes: () => {
		const current = get().nodes;
		// Skip the allocation when nothing is selected.
		if (!current.some((n) => n.selected)) return;
		set({ nodes: current.map((n) => (n.selected ? { ...n, selected: false } : n)) });
	},

	removeNodes: (ids) => {
		const idSet = new Set(ids);
		const { nodes, edges } = get();

		// Build individual remove_node operations.
		// Each connected edge is assigned to the FIRST node that references it so
		// that deduplication is correct when multiple removed nodes share an edge.
		// Without this, reversing the batch would restore the shared edge twice.
		const assignedEdgeIds = new Set<string>();
		const ops: Operation[] = ids
			.map((id) => {
				const node = nodes.find((n) => n.id === id);
				if (!node) return null;
				const connectedEdges = edges.filter((e) => (e.source === id || e.target === id) && !assignedEdgeIds.has(e.id));
				for (const e of connectedEdges) {
					assignedEdgeIds.add(e.id);
				}
				return { type: "remove_node" as const, node, connectedEdges };
			})
			.filter((op): op is Extract<Operation, { type: "remove_node" }> => op !== null);

		// Apply the removal.
		set({
			nodes: nodes.filter((n) => !idSet.has(n.id)),
			edges: edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
		});

		if (ops.length === 0) return;

		// Wrap multiple operations in a batch so they undo as a single step.
		const op: Operation = ops.length === 1 ? ops[0] : { type: "batch", operations: ops };
		pushUndoOperation(set, get, op);
	},

	removeEdges: (ids) => {
		const idSet = new Set(ids);
		const { edges } = get();

		// Build individual remove_edge operations.
		const ops: Operation[] = ids
			.map((id) => {
				const edge = edges.find((e) => e.id === id);
				if (!edge) return null;
				return { type: "remove_edge" as const, edge };
			})
			.filter((op): op is Extract<Operation, { type: "remove_edge" }> => op !== null);

		set({ edges: edges.filter((e) => !idSet.has(e.id)) });

		if (ops.length === 0) return;

		// Wrap multiple operations in a batch so they undo as a single step.
		const op: Operation = ops.length === 1 ? ops[0] : { type: "batch", operations: ops };
		pushUndoOperation(set, get, op);
	},

	addEdge: (edge) => {
		const op: Operation = { type: "add_edge", edge };
		set({ edges: [...get().edges, edge] });
		pushUndoOperation(set, get, op);
	},

	updateEdge: (edgeId, updates) => {
		set({
			edges: get().edges.map((e) => (e.id === edgeId ? { ...e, ...updates } : e)),
		});
	},

	updateNodeData: (nodeId, dataUpdates) => {
		const { nodes } = get();
		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;

		const fromData = { ...node.data } as Record<string, unknown>;
		const op: Operation = {
			type: "update_node_data",
			nodeId,
			from: fromData,
			to: dataUpdates,
		};

		set({
			nodes: nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...dataUpdates } } : n)),
		});
		pushUndoOperation(set, get, op);
	},

	updateEdgeData: (edgeId, dataUpdates) => {
		const { edges } = get();
		const edge = edges.find((e) => e.id === edgeId);
		if (!edge) return;

		const fromData = { ...getValueOrDefault(edge.data, {}) } as Record<string, unknown>;
		const op: Operation = {
			type: "update_edge_data",
			edgeId,
			from: fromData,
			to: dataUpdates,
		};

		set({
			edges: edges.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, ...dataUpdates } } : e)),
		});
		pushUndoOperation(set, get, op);
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

		// Route through addEdge so the operation is tracked in the undo stack.
		get().addEdge(newEdge);
	},

	moveNode: (nodeId, from, to) => {
		// No-op if position unchanged.
		if (from.x === to.x && from.y === to.y) return;

		const op: Operation = { type: "move_node", nodeId, from, to };

		set({
			nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, position: to } : n)),
		});
		pushUndoOperation(set, get, op);
	},

	undo: () => {
		const { undoStack, redoStack, nodes, edges } = get();
		if (undoStack.length === 0) return;

		const lastOp = undoStack[undoStack.length - 1];
		const reverseOp = reverseOperation(lastOp);
		const newState = applyOperation(nodes, edges, reverseOp);

		set({
			nodes: newState.nodes,
			edges: newState.edges,
			undoStack: undoStack.slice(0, -1),
			redoStack: [...redoStack, lastOp],
			dirty: true,
		});
	},

	redo: () => {
		const { undoStack, redoStack, nodes, edges } = get();
		if (redoStack.length === 0) return;

		const lastOp = redoStack[redoStack.length - 1];
		const newState = applyOperation(nodes, edges, lastOp);

		set({
			nodes: newState.nodes,
			edges: newState.edges,
			undoStack: [...undoStack, lastOp],
			redoStack: redoStack.slice(0, -1),
			dirty: true,
		});
	},

	canUndo: () => get().undoStack.length > 0,

	canRedo: () => get().redoStack.length > 0,

	setDiagram: (nodes, edges, viewport) => {
		set({
			nodes,
			edges,
			viewport: viewport ?? DEFAULT_VIEWPORT,
			undoStack: [],
			redoStack: [],
		});
	},

	loadDiagram: (id, title, nodes, edges, viewport, version) => {
		set({
			diagramId: id,
			title,
			nodes,
			edges,
			viewport: viewport ?? DEFAULT_VIEWPORT,
			version,
			dirty: false,
			undoStack: [],
			redoStack: [],
		});
	},

	applyBatchOperation: (op) => {
		// No-op when the batch contains no sub-operations.
		if (op.operations.length === 0) return;

		const { nodes, edges } = get();
		const newState = applyOperation(nodes, edges, op);
		set({ nodes: newState.nodes, edges: newState.edges });
		pushUndoOperation(set, get, op);
	},

	markClean: (newVersion) => {
		set({ dirty: false, version: newVersion });
	},
}));
