# Operation types, apply/reverse pure functions + unit tests

## Summary

Defines the operation-based undo/redo data model as a standalone, pure-logic module with no store or UI dependencies. A discriminated union of operation types covers every canvas mutation (add/remove node, move node, add/remove edge, update node data, update edge data, batch). Two pure functions — `applyOperation` and `reverseOperation` — transform canvas state and invert operations respectively. Comprehensive unit tests verify every operation type, its reverse, and round-trip correctness.

This issue is the first half of the original ISSUE-17, split for manageability. ISSUE-17B integrates these types and functions into the Zustand diagram store, wires keyboard shortcuts, and adds React Flow drag tracking.

**Depends on:** ISSUE-14 (diagram store with `addNode`, `removeNodes`, `addEdge`, `removeEdges`, `updateNodeData`, `updateEdgeData`)

## Relevant Skills

- `react-state-management`
- `typescript-advanced-types`

## Requirements Coverage

- [F4-US8](../REQUIREMENTS.md): Defines the operation data model that underpins the undo/redo system (≥50 steps). The actual stack management and keyboard shortcuts are in ISSUE-17B.

## Acceptance Criteria

- [ ] `Operation` discriminated union is defined in `src/frontend/src/stores/operations.ts`.
- [ ] `Position` interface is defined with `x` and `y` number fields.
- [ ] `add_node` operation type stores a React Flow `Node`.
- [ ] `remove_node` operation type stores a React Flow `Node` and its `connectedEdges: Edge[]`.
- [ ] `move_node` operation type stores `nodeId`, `from: Position`, and `to: Position`.
- [ ] `add_edge` operation type stores a React Flow `Edge`.
- [ ] `remove_edge` operation type stores a React Flow `Edge`.
- [ ] `update_node_data` operation type stores `nodeId`, `from: Record<string, unknown>`, and `to: Record<string, unknown>`.
- [ ] `update_edge_data` operation type stores `edgeId`, `from: Record<string, unknown>`, and `to: Record<string, unknown>`.
- [ ] `batch` operation type stores an `operations: Operation[]` array.
- [ ] `reverseOperation(op)` returns the inverse `Operation` for every operation type.
- [ ] `reverseOperation` for `add_node` returns a `remove_node` (with empty `connectedEdges`).
- [ ] `reverseOperation` for `remove_node` returns a `batch` containing `add_node` + `add_edge` for each connected edge.
- [ ] `reverseOperation` for `move_node` swaps `from` and `to`.
- [ ] `reverseOperation` for `add_edge` returns `remove_edge`.
- [ ] `reverseOperation` for `remove_edge` returns `add_edge`.
- [ ] `reverseOperation` for `update_node_data` swaps `from` and `to`.
- [ ] `reverseOperation` for `update_edge_data` swaps `from` and `to`.
- [ ] `reverseOperation` for `batch` reverses sub-operation order and reverses each sub-operation.
- [ ] `applyOperation(nodes, edges, op)` correctly mutates state for every operation type.
- [ ] `applyOperation` for `add_node` adds the node to the nodes array.
- [ ] `applyOperation` for `remove_node` removes the node and its connected edges.
- [ ] `applyOperation` for `move_node` updates the node's position.
- [ ] `applyOperation` for `add_edge` adds the edge to the edges array.
- [ ] `applyOperation` for `remove_edge` removes the edge.
- [ ] `applyOperation` for `update_node_data` merges the `to` data onto the node.
- [ ] `applyOperation` for `update_edge_data` merges the `to` data onto the edge.
- [ ] `applyOperation` for `batch` applies all sub-operations in order.
- [ ] Round-trip: applying an operation then its reverse restores original state for every type.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Important Type Decision: React Flow Types, Not Shared Types

The diagram store operates on React Flow's `Node` and `Edge` types (from `@xyflow/react`), not `DiagramNode` and `DiagramEdge` from `@architect/shared`. The shared types are the API wire format; the store uses React Flow types for canvas rendering. Operations must use the same types as the store since `applyOperation` will be called against store state.

For `update_node_data` and `update_edge_data`, use `Record<string, unknown>` for the `from` and `to` fields. This matches the existing `updateNodeData` and `updateEdgeData` signatures in the diagram store, which already accept `Record<string, unknown>`.

### 2. Define the Operation Types

Create `src/frontend/src/stores/operations.ts` with:

```typescript
import type { Edge, Node } from "@xyflow/react";

/** Canvas position — used by move operations to record from/to coordinates. */
export interface Position {
  x: number;
  y: number;
}

/**
 * Discriminated union of all reversible canvas operations.
 *
 * Each variant captures enough state to both apply the operation forward
 * and compute its inverse via `reverseOperation`.
 */
export type Operation =
  | { type: "add_node"; node: Node }
  | { type: "remove_node"; node: Node; connectedEdges: Edge[] }
  | { type: "move_node"; nodeId: string; from: Position; to: Position }
  | { type: "add_edge"; edge: Edge }
  | { type: "remove_edge"; edge: Edge }
  | { type: "update_node_data"; nodeId: string; from: Record<string, unknown>; to: Record<string, unknown> }
  | { type: "update_edge_data"; edgeId: string; from: Record<string, unknown>; to: Record<string, unknown> }
  | { type: "batch"; operations: Operation[] };
```

### 3. Implement `reverseOperation`

Returns the inverse `Operation` — not a new type, but an `Operation` that undoes the original:

```typescript
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
      return { type: "update_node_data", nodeId: op.nodeId, from: op.to, to: op.from };
    case "update_edge_data":
      return { type: "update_edge_data", edgeId: op.edgeId, from: op.to, to: op.from };
    case "batch":
      return {
        type: "batch",
        operations: [...op.operations].reverse().map(reverseOperation),
      };
  }
}
```

### 4. Implement `applyOperation`

Takes the current nodes/edges arrays and an operation, returns new arrays:

```typescript
export function applyOperation(
  nodes: Node[],
  edges: Edge[],
  op: Operation
): { nodes: Node[]; edges: Edge[] } {
  switch (op.type) {
    case "add_node":
      return { nodes: [...nodes, op.node], edges };
    case "remove_node":
      return {
        nodes: nodes.filter((n) => n.id !== op.node.id),
        edges: edges.filter(
          (e) => !op.connectedEdges.some((ce) => ce.id === e.id)
        ),
      };
    case "move_node":
      return {
        nodes: nodes.map((n) =>
          n.id === op.nodeId ? { ...n, position: op.to } : n
        ),
        edges,
      };
    case "add_edge":
      return { nodes, edges: [...edges, op.edge] };
    case "remove_edge":
      return { nodes, edges: edges.filter((e) => e.id !== op.edge.id) };
    case "update_node_data":
      return {
        nodes: nodes.map((n) =>
          n.id === op.nodeId ? { ...n, data: { ...n.data, ...op.to } } : n
        ),
        edges,
      };
    case "update_edge_data":
      return {
        nodes,
        edges: edges.map((e) =>
          e.id === op.edgeId ? { ...e, data: { ...e.data, ...op.to } } : e
        ),
      };
    case "batch":
      return op.operations.reduce(
        (state, subOp) => applyOperation(state.nodes, state.edges, subOp),
        { nodes, edges }
      );
  }
}
```

## Testing

All tests go in `src/frontend/src/stores/__tests__/operations.test.ts`.

### `reverseOperation` Tests

1. **`add_node` reverse produces `remove_node`** — Verify the reversed type is `remove_node` with the same node and empty `connectedEdges`.

2. **`remove_node` reverse produces `batch`** — Create a `remove_node` with 2 connected edges. Verify the reverse is a `batch` with `add_node` + 2 × `add_edge`.

3. **`remove_node` with no connected edges** — Verify the reverse `batch` contains only `add_node`.

4. **`move_node` reverse swaps `from` and `to`** — Verify `from` becomes `to` and vice versa, `nodeId` is preserved.

5. **`add_edge` reverse produces `remove_edge`** — Verify the edge object is preserved.

6. **`remove_edge` reverse produces `add_edge`** — Verify the edge object is preserved.

7. **`update_node_data` reverse swaps `from` and `to`** — Verify `nodeId` preserved, data swapped.

8. **`update_edge_data` reverse swaps `from` and `to`** — Verify `edgeId` preserved, data swapped.

9. **`batch` reverse reverses order and reverses each sub-operation** — Create a batch with 3 operations. Verify the reverse has them in reversed order, each individually reversed.

### `applyOperation` Tests

10. **`add_node` adds node to array** — Start with 0 nodes, apply `add_node`, verify 1 node.

11. **`remove_node` removes node and connected edges** — Start with 2 nodes + 1 edge. Apply `remove_node` for one node (listing the edge as connected). Verify 1 node, 0 edges remain.

12. **`remove_node` preserves unrelated edges** — Verify edges not listed in `connectedEdges` are kept.

13. **`move_node` updates position** — Apply `move_node` with `to: { x: 100, y: 200 }`. Verify node position changed.

14. **`move_node` preserves other nodes** — Verify non-targeted nodes keep their positions.

15. **`add_edge` adds edge to array** — Start with 0 edges, apply `add_edge`, verify 1 edge.

16. **`remove_edge` removes edge** — Start with 2 edges, apply `remove_edge` for one, verify 1 remains.

17. **`update_node_data` merges data** — Node with `{ label: "Workers" }`, apply update `to: { label: "D1" }`, verify label changed.

18. **`update_node_data` preserves other data fields** — Verify updating `label` does not remove `description`.

19. **`update_edge_data` merges data** — Edge with `{ label: "HTTP" }`, apply update `to: { protocol: "HTTPS" }`, verify protocol added.

20. **`update_edge_data` preserves other data fields** — Verify updating `protocol` does not remove `label`.

21. **`batch` applies all sub-operations in order** — Create a batch that adds a node then adds an edge. Verify both are present.

### Round-Trip Tests

22. **Round-trip for every operation type** — For each of the 8 operation types: start with known state, apply the operation, apply its reverse, verify state matches original. This is a parameterized/table-driven test covering `add_node`, `remove_node`, `move_node`, `add_edge`, `remove_edge`, `update_node_data`, `update_edge_data`, and `batch`.

### Manual Tests

This issue has no UI changes. Verification is entirely via `npm run test`.
