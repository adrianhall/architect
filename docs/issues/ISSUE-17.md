# Undo/redo system (>=50 steps, operation-based) + tests

## Summary

Implements an operation-based undo/redo system for the diagram editor supporting at least 50 steps. Each user action (add node, move node, connect, delete, edit properties) is a discrete, reversible operation pushed onto a stack. No full-document snapshots per undo step — this keeps memory efficient and maps directly to the operation stream a Durable Object would broadcast for future real-time collaboration. Keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) are wired into the editor. Comprehensive tests cover every operation type, stack behavior, edge cases, and batch operations.

## Relevant Skills

- `react-state-management`
- `typescript-advanced-types`

## Requirements Coverage

- [F4-US8](../REQUIREMENTS.md): Undo and redo at least 50 steps with `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`. Undo/redo covers structural changes and data-only edits; redo stack clears on new action.

## Acceptance Criteria

- [ ] Operation types are defined as a discriminated union in `src/frontend/src/stores/operations.ts`.
- [ ] Each operation type has `apply(state)` and `reverse(state)` functions that correctly mutate diagram state.
- [ ] `AddNode` operation adds a node; its reverse removes the node.
- [ ] `RemoveNode` operation removes a node and captures its connected edges; its reverse restores both the node and its edges.
- [ ] `MoveNode` operation records from/to positions; its reverse restores the original position.
- [ ] `AddEdge` operation adds an edge; its reverse removes the edge.
- [ ] `RemoveEdge` operation removes an edge; its reverse restores the edge.
- [ ] `UpdateNodeData` operation records from/to data; its reverse restores the original data.
- [ ] `UpdateEdgeData` operation records from/to data; its reverse restores the original data.
- [ ] `BatchOperation` groups multiple operations; undo/redo applies/reverses them as a single unit.
- [ ] All mutating actions in the diagram store (`addNode`, `removeNodes`, `moveNode`, `addEdge`, `removeEdge`, `updateNodeData`, `updateEdgeData`) push operations onto the undo stack.
- [ ] `undo()` pops from the undo stack, applies the reverse operation, and pushes to the redo stack.
- [ ] `redo()` pops from the redo stack, applies the forward operation, and pushes to the undo stack.
- [ ] Any new mutating action clears the redo stack.
- [ ] Undo stack is capped at 50 entries (configurable). Oldest operations are discarded when the cap is exceeded.
- [ ] `canUndo` and `canRedo` derived state correctly reflect stack emptiness.
- [ ] Ctrl/Cmd+Z triggers undo; Ctrl/Cmd+Shift+Z triggers redo.
- [ ] Keyboard shortcuts do NOT trigger when focus is in a text input, textarea, or contenteditable element.
- [ ] Undo after removing a node restores the node AND all its connected edges.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Define Operation Types

Create `src/frontend/src/stores/operations.ts` with a discriminated union of all operation types:

```typescript
// src/frontend/src/stores/operations.ts
import type { DiagramNode, DiagramEdge } from "@architect/shared";

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  label: string;
  description?: string;
  accentColor?: string;
}

export interface EdgeData {
  label?: string;
  protocol?: string;
  description?: string;
}

export type Operation =
  | { type: "add_node"; node: DiagramNode }
  | { type: "remove_node"; node: DiagramNode; connectedEdges: DiagramEdge[] }
  | { type: "move_node"; nodeId: string; from: Position; to: Position }
  | { type: "add_edge"; edge: DiagramEdge }
  | { type: "remove_edge"; edge: DiagramEdge }
  | { type: "update_node_data"; nodeId: string; from: NodeData; to: NodeData }
  | { type: "update_edge_data"; edgeId: string; from: EdgeData; to: EdgeData }
  | { type: "batch"; operations: Operation[] };
```

### 2. Implement Apply and Reverse Functions

Create `applyOperation(state, operation)` and `reverseOperation(operation)` functions. The `reverseOperation` function returns the inverse operation (not a new type — it returns an `Operation` that undoes the original):

```typescript
export function reverseOperation(op: Operation): Operation {
  switch (op.type) {
    case "add_node":
      // Reverse of add is remove (with no connected edges, since it was just added)
      return { type: "remove_node", node: op.node, connectedEdges: [] };
    case "remove_node":
      // Reverse of remove is: re-add the node, then re-add all its connected edges
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
      // Reverse a batch: reverse each operation in reverse order
      return {
        type: "batch",
        operations: [...op.operations].reverse().map(reverseOperation),
      };
  }
}

export function applyOperation(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  op: Operation
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
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

### 3. Refactor the Diagram Store

Update `src/frontend/src/stores/diagram.ts` to integrate the operation-based undo/redo system:

```typescript
// Add to the store state
interface DiagramState {
  // ... existing node/edge state
  undoStack: Operation[];
  redoStack: Operation[];
  maxUndoSteps: number; // default 50
}

// Add derived state
interface DiagramActions {
  // ... existing actions refactored to push operations
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}
```

Key implementation details for the store refactoring:

1. **`pushOperation(op: Operation)` internal helper:**
   - Pushes `op` onto `undoStack`.
   - Clears `redoStack` (any new action invalidates the redo history).
   - If `undoStack.length > maxUndoSteps`, shift the oldest entry off the front.

2. **Refactor existing mutating actions** to create an operation, apply it to state, and call `pushOperation`:
   - `addNode(node)` → creates `{ type: 'add_node', node }`, applies, pushes.
   - `removeNodes(nodeIds)` → for each node, captures the node and its connected edges, creates either a single `remove_node` or a `batch` operation if multiple nodes, applies, pushes.
   - `moveNode(nodeId, from, to)` → creates `{ type: 'move_node', nodeId, from, to }`, applies, pushes.
   - `addEdge(edge)` → creates `{ type: 'add_edge', edge }`, applies, pushes.
   - `removeEdge(edgeId)` → captures the edge, creates `{ type: 'remove_edge', edge }`, applies, pushes.
   - `updateNodeData(nodeId, data)` → captures old data, creates `{ type: 'update_node_data', nodeId, from: oldData, to: data }`, applies, pushes.
   - `updateEdgeData(edgeId, data)` → captures old data, creates `{ type: 'update_edge_data', edgeId, from: oldData, to: data }`, applies, pushes.

3. **`undo()` action:**
   - If `undoStack` is empty, return.
   - Pop the last operation from `undoStack`.
   - Compute the reverse operation via `reverseOperation(op)`.
   - Apply the reverse to current state via `applyOperation()`.
   - Push the original operation onto `redoStack`.

4. **`redo()` action:**
   - If `redoStack` is empty, return.
   - Pop the last operation from `redoStack`.
   - Apply it forward via `applyOperation()`.
   - Push it onto `undoStack`.

5. **`canUndo()` / `canRedo()`:** Return `undoStack.length > 0` / `redoStack.length > 0`.

### 4. Wire Keyboard Shortcuts in Editor.tsx

Add a `useEffect` in `Editor.tsx` (or a dedicated `useUndoRedoShortcuts` hook) that listens for keydown events:

```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // Skip if focus is in a text input, textarea, or contenteditable
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      useDiagramStore.getState().undo();
    } else if (mod && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      useDiagramStore.getState().redo();
    } else if (mod && e.key === "y") {
      // Alternative redo shortcut (Windows convention)
      e.preventDefault();
      useDiagramStore.getState().redo();
    }
  }

  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, []);
```

**Important:** Also check for `<input>` types that accept text input. Some input types like `checkbox` or `radio` should not block undo/redo. Refine the check:

```typescript
const isTextInput =
  (target.tagName === "INPUT" &&
    ["text", "search", "url", "tel", "password", "number", "email"].includes(
      (target as HTMLInputElement).type
    )) ||
  target.tagName === "TEXTAREA" ||
  target.isContentEditable;
```

### 5. Integration with React Flow

React Flow manages its own internal node/edge state. The diagram store must be the source of truth. When React Flow fires `onNodesChange` or `onEdgesChange`, filter for the changes that should produce operations:

- **Node position change (drag end):** React Flow fires `onNodeDragStop` with the node and its new position. Capture the `from` position (stored before drag start via `onNodeDragStart`) and the `to` position. Push a `move_node` operation.
- **Node/edge removal via React Flow:** Intercept `onNodesDelete` and `onEdgesDelete` callbacks to create the appropriate operations rather than letting React Flow directly mutate state.

Use `onNodeDragStart` to snapshot the starting position:

```typescript
const [dragStartPositions, setDragStartPositions] = useState<
  Map<string, Position>
>(new Map());

const onNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
  setDragStartPositions((prev) => new Map(prev).set(node.id, node.position));
}, []);

const onNodeDragStop = useCallback(
  (_event: React.MouseEvent, node: Node) => {
    const from = dragStartPositions.get(node.id);
    if (from && (from.x !== node.position.x || from.y !== node.position.y)) {
      diagramStore.moveNode(node.id, from, node.position);
    }
    setDragStartPositions((prev) => {
      const next = new Map(prev);
      next.delete(node.id);
      return next;
    });
  },
  [dragStartPositions]
);
```

## Testing

All tests go in `src/frontend/src/stores/__tests__/operations.test.ts` and `src/frontend/src/stores/__tests__/diagram-undo-redo.test.ts`. Tests use Vitest with jsdom environment.

### Operation Type Tests (`operations.test.ts`)

1. **`reverseOperation` for each operation type:**
   - `add_node` reverse produces `remove_node`.
   - `remove_node` reverse produces a `batch` with `add_node` + `add_edge` operations for each connected edge.
   - `move_node` reverse swaps `from` and `to`.
   - `add_edge` reverse produces `remove_edge`.
   - `remove_edge` reverse produces `add_edge`.
   - `update_node_data` reverse swaps `from` and `to`.
   - `update_edge_data` reverse swaps `from` and `to`.
   - `batch` reverse reverses the order and reverses each sub-operation.

1. **`applyOperation` for each operation type:**
   - `add_node` adds the node to the nodes array.
   - `remove_node` removes the node and its connected edges.
   - `move_node` updates the node's position.
   - `add_edge` adds the edge to the edges array.
   - `remove_edge` removes the edge.
   - `update_node_data` updates the node's data fields.
   - `update_edge_data` updates the edge's data fields.
   - `batch` applies all sub-operations in order.

1. **Round-trip tests:** For each operation type, apply an operation then apply its reverse — the state should return to the original.

### Diagram Store Undo/Redo Tests (`diagram-undo-redo.test.ts`)

1. **Undo reverses last action:** Add a node, undo — nodes array is empty.

1. **Redo re-applies undone action:** Add a node, undo, redo — node is back.

1. **New action clears redo stack:** Add node A, undo, add node B — redo stack is empty, undo shows only node B.

1. **Undo stack capped at 50:** Push 55 operations, assert undo stack length is 50, the first 5 operations are lost.

1. **Batch operations undo/redo as a unit:** Remove 3 selected nodes (batch operation), undo — all 3 nodes and their edges are restored in a single undo step.

1. **canUndo/canRedo reflect stack state:** Initially both false. After an action, canUndo is true. After undo, canRedo is true. After redo, canRedo is false.

1. **Undo after remove node restores node AND connected edges:** Add node A, add node B, add edge A→B. Remove node A. Undo — both node A and edge A→B are restored.

1. **Move node undo restores original position:** Add a node at (0, 0), move to (100, 200), undo — node is back at (0, 0).

1. **Update node data undo restores original data:** Change a node's label from "Workers" to "D1", undo — label is "Workers" again.

1. **Multiple undos work in sequence:** Perform 3 actions, undo 3 times — state is back to initial.

1. **Undo when stack is empty is a no-op:** Call undo on empty stack — no error, state unchanged.

1. **Redo when stack is empty is a no-op:** Call redo on empty stack — no error, state unchanged.

### Manual Tests

After running locally with `npm start`:

1. Open the editor and add several nodes to the canvas.
2. Press Ctrl/Cmd+Z — the last node should disappear.
3. Press Ctrl/Cmd+Shift+Z — the node should reappear.
4. Add a node, connect it to another node, then delete the node. Undo — the node and its edge should both reappear.
5. Perform more than 50 actions. Undo 50 times — the 51st undo should be a no-op.
6. Click into a text input (e.g., node label editor), press Ctrl/Cmd+Z — the browser's native undo should fire, not the diagram undo.
7. Add a node, undo, then add a different node — pressing Ctrl/Cmd+Shift+Z should be a no-op (redo stack cleared).
