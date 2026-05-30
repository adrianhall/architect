import type { Edge, Node } from "@xyflow/react";

/**
 * Canvas position — used by move operations to record from/to coordinates.
 *
 * Matches the `position` field on a React Flow `Node` so that position
 * snapshots can be read directly from node objects without any transformation.
 */
export interface Position {
	/** Horizontal position in canvas (logical) pixels. */
	x: number;
	/** Vertical position in canvas (logical) pixels. */
	y: number;
}

/**
 * Discriminated union of all reversible canvas operations.
 *
 * Each variant captures enough state to both apply the operation forward
 * (via `applyOperation`) and compute its exact inverse (via `reverseOperation`).
 * Operations use React Flow's `Node` and `Edge` types — the same types stored
 * in the Zustand diagram store — rather than the shared `DiagramNode` /
 * `DiagramEdge` wire types, so that `applyOperation` can be called directly
 * against store state without a conversion step.
 *
 * New variants added here must also be handled in `reverseOperation` and
 * `applyOperation` (TypeScript's exhaustive switch will flag the omission).
 */
export type Operation =
	| { type: "add_node"; node: Node }
	| { type: "remove_node"; node: Node; connectedEdges: Edge[] }
	| { type: "move_node"; nodeId: string; from: Position; to: Position }
	| { type: "add_edge"; edge: Edge }
	| { type: "remove_edge"; edge: Edge }
	| {
			type: "update_node_data";
			nodeId: string;
			from: Record<string, unknown>;
			to: Record<string, unknown>;
	  }
	| {
			type: "update_edge_data";
			edgeId: string;
			from: Record<string, unknown>;
			to: Record<string, unknown>;
	  }
	| { type: "batch"; operations: Operation[] };

/**
 * Computes the inverse `Operation` that exactly undoes the given operation.
 *
 * The result is always itself a valid `Operation` so it can be stored on the
 * undo stack, re-reversed for redo, or passed directly to `applyOperation`.
 *
 * Notable behaviour per variant:
 * - `add_node` → `remove_node` with an empty `connectedEdges` array. The
 *   undo/redo stack manager is responsible for capturing connected edges when
 *   recording the original deletion so the full `remove_node → batch` round-
 *   trip is lossless.
 * - `remove_node` → `batch` containing `add_node` followed by one `add_edge`
 *   per connected edge, restoring the full local topology.
 * - `batch` → reversed-order `batch` where each sub-operation is also reversed,
 *   ensuring composite operations undo in the correct sequence.
 *
 * @param op - The operation to invert.
 * @returns An `Operation` that, when applied after `op`, restores prior state.
 *
 * @example
 * ```ts
 * const forward: Operation = { type: "move_node", nodeId: "n1", from: { x: 0, y: 0 }, to: { x: 100, y: 200 } };
 * const backward = reverseOperation(forward);
 * // backward === { type: "move_node", nodeId: "n1", from: { x: 100, y: 200 }, to: { x: 0, y: 0 } }
 * ```
 */
export function reverseOperation(op: Operation): Operation {
	switch (op.type) {
		case "add_node":
			return { type: "remove_node", node: op.node, connectedEdges: [] };
		case "remove_node":
			return {
				type: "batch",
				operations: [
					{ type: "add_node", node: op.node },
					...op.connectedEdges.map((edge) => ({
						type: "add_edge" as const,
						edge,
					})),
				],
			};
		case "move_node":
			return { type: "move_node", nodeId: op.nodeId, from: op.to, to: op.from };
		case "add_edge":
			return { type: "remove_edge", edge: op.edge };
		case "remove_edge":
			return { type: "add_edge", edge: op.edge };
		case "update_node_data":
			return {
				type: "update_node_data",
				nodeId: op.nodeId,
				from: op.to,
				to: op.from,
			};
		case "update_edge_data":
			return {
				type: "update_edge_data",
				edgeId: op.edgeId,
				from: op.to,
				to: op.from,
			};
		case "batch":
			return {
				type: "batch",
				operations: [...op.operations].reverse().map(reverseOperation),
			};
	}
}

/**
 * Applies an operation to the given nodes and edges arrays, returning new
 * arrays that reflect the operation without mutating the originals.
 *
 * All updates are immutable (spread-based); the inputs are never modified.
 * For a `batch` operation, sub-operations are applied in declaration order —
 * the first element in the `operations` array is applied first.
 *
 * @param nodes - Current array of React Flow nodes.
 * @param edges - Current array of React Flow edges.
 * @param op - The operation to apply.
 * @returns A new `{ nodes, edges }` pair reflecting the applied operation.
 *
 * @example
 * ```ts
 * const { nodes: next } = applyOperation(
 *   store.nodes,
 *   store.edges,
 *   { type: "add_node", node: newNode }
 * );
 * ```
 */
export function applyOperation(nodes: Node[], edges: Edge[], op: Operation): { nodes: Node[]; edges: Edge[] } {
	switch (op.type) {
		case "add_node":
			return { nodes: [...nodes, op.node], edges };
		case "remove_node":
			return {
				nodes: nodes.filter((n) => n.id !== op.node.id),
				edges: edges.filter((e) => !op.connectedEdges.some((ce) => ce.id === e.id)),
			};
		case "move_node":
			return {
				nodes: nodes.map((n) => (n.id === op.nodeId ? { ...n, position: op.to } : n)),
				edges,
			};
		case "add_edge":
			return { nodes, edges: [...edges, op.edge] };
		case "remove_edge":
			return { nodes, edges: edges.filter((e) => e.id !== op.edge.id) };
		case "update_node_data":
			return {
				nodes: nodes.map((n) => (n.id === op.nodeId ? { ...n, data: { ...n.data, ...op.to } } : n)),
				edges,
			};
		case "update_edge_data":
			return {
				nodes,
				edges: edges.map((e) => (e.id === op.edgeId ? { ...e, data: { ...e.data, ...op.to } } : e)),
			};
		case "batch":
			return op.operations.reduce((state, subOp) => applyOperation(state.nodes, state.edges, subOp), { nodes, edges });
	}
}
