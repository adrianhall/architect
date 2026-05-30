# Store undo/redo integration + keyboard shortcuts + tests

## Summary

Integrates the operation types and pure functions from ISSUE-17A into the Zustand diagram store, adding undo/redo stacks, refactoring all mutating actions to push operations, wiring keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z), and adding React Flow drag tracking for node moves. Comprehensive integration tests verify stack behavior, cap enforcement, batch operations, and edge cases.

This issue is the second half of the original ISSUE-17. It depends on ISSUE-17A for the `Operation` type, `applyOperation`, and `reverseOperation`.

**Depends on:** ISSUE-17A (operation types and pure functions)

## Relevant Skills

- `react-state-management`
- `typescript-advanced-types`

## Requirements Coverage

- [F4-US8](../REQUIREMENTS.md): Undo and redo at least 50 steps with `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`. Undo/redo covers structural changes and data-only edits; redo stack clears on new action.

## Acceptance Criteria

- [ ] `undoStack: Operation[]` and `redoStack: Operation[]` are added to the diagram store state.
- [ ] `maxUndoSteps` is configurable, defaulting to 50.
- [ ] All mutating actions in the diagram store (`addNode`, `removeNodes`, `moveNode`, `addEdge`, `removeEdge`, `updateNodeData`, `updateEdgeData`) push operations onto the undo stack.
- [ ] `onConnect` routes through the store's `addEdge` action so connections are tracked in the undo stack.
- [ ] A new `moveNode(nodeId, from, to)` action is added to the store for position-change operations.
- [ ] `undo()` pops from the undo stack, applies the reverse operation, and pushes to the redo stack.
- [ ] `redo()` pops from the redo stack, applies the forward operation, and pushes to the undo stack.
- [ ] Any new mutating action clears the redo stack.
- [ ] Undo stack is capped at 50 entries. Oldest operations are discarded when the cap is exceeded.
- [ ] `canUndo` and `canRedo` derived state correctly reflect stack emptiness.
- [ ] `undo()` on empty stack is a no-op — no error, state unchanged.
- [ ] `redo()` on empty stack is a no-op — no error, state unchanged.
- [ ] Ctrl/Cmd+Z triggers undo in `Editor.tsx`.
- [ ] Ctrl/Cmd+Shift+Z triggers redo in `Editor.tsx`.
- [ ] Ctrl/Cmd+Y triggers redo (Windows convention) in `Editor.tsx`.
- [ ] Keyboard shortcuts do NOT trigger when focus is in a text `<input>`, `<textarea>`, or `contenteditable` element. Non-text input types (`checkbox`, `radio`) do NOT block shortcuts.
- [ ] Undo after removing a node restores the node AND all its connected edges.
- [ ] `removeNodes` with multiple node IDs creates a single `batch` operation.
- [ ] `setDiagram` clears both undo and redo stacks (loading a new diagram resets history).
- [ ] `onNodeDragStart` and `onNodeDragStop` handlers are wired in `Editor.tsx` to capture drag positions and call `moveNode`.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Add Undo/Redo State to the Diagram Store

Update `src/frontend/src/stores/diagram.ts`:

```typescript
import type { Operation } from "./operations";
import { applyOperation, reverseOperation } from "./operations";

// Add to DiagramState interface:
interface DiagramState {
  // ... existing node/edge/viewport state ...
  undoStack: Operation[];
  redoStack: Operation[];
  maxUndoSteps: number; // default 50

  // ... existing actions ...
  moveNode: (nodeId: string, from: Position, to: Position) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}
```

### 2. Internal `pushOperation` Helper

Not exposed on the store interface. Called by every mutating action:

```typescript
function pushOperation(set: SetState, get: GetState, op: Operation): void {
  const { undoStack, maxUndoSteps } = get();
  const newStack = [...undoStack, op];
  // Cap the stack: discard oldest entries when limit exceeded.
  if (newStack.length > maxUndoSteps) {
    newStack.splice(0, newStack.length - maxUndoSteps);
  }
  set({ undoStack: newStack, redoStack: [] });
}
```

Key behaviors:
- Appends `op` to `undoStack`.
- Clears `redoStack` — any new action invalidates redo history.
- If `undoStack.length > maxUndoSteps`, shifts oldest entries off the front.

### 3. Refactor Mutating Actions

Each mutating action creates an operation, applies it to the state, and calls `pushOperation`. The existing action signatures remain the same for backward compatibility:

- **`addNode(node)`** — Creates `{ type: "add_node", node }`. Adds the node to the array. Pushes operation.

- **`removeNodes(ids)`** — For each node ID, captures the node object and all edges where the node is source or target. Creates individual `remove_node` operations. If multiple IDs, wraps them in a `batch`. Applies the removal. Pushes the (possibly batched) operation.

- **`moveNode(nodeId, from, to)`** — New action. Creates `{ type: "move_node", nodeId, from, to }`. Updates the node's position. Pushes operation. This action is called from the `onNodeDragStop` handler, not from `onNodesChange`.

- **`addEdge(edge)`** — Creates `{ type: "add_edge", edge }`. Adds the edge. Pushes operation.

- **`removeEdges(ids)`** — For each edge ID, captures the edge object. Creates individual `remove_edge` operations. If multiple IDs, wraps them in a `batch`. Applies the removal. Pushes the (possibly batched) operation.

- **`onConnect(connection)`** — After validation (no self-loops, source/target present), creates the new edge object, then calls `addEdge(newEdge)` internally so the operation is tracked. Does NOT call `pushOperation` directly — `addEdge` handles that.

- **`updateNodeData(nodeId, dataUpdates)`** — Captures the current `node.data` as `from`. Creates `{ type: "update_node_data", nodeId, from: currentData, to: dataUpdates }`. Applies the merge. Pushes operation.

- **`updateEdgeData(edgeId, dataUpdates)`** — Captures the current `edge.data` as `from`. Creates `{ type: "update_edge_data", edgeId, from: currentData, to: dataUpdates }`. Applies the merge. Pushes operation.

**Actions that do NOT push operations:**
- `onNodesChange` — React Flow continuous position/selection updates. Not undoable.
- `onEdgesChange` — React Flow selection updates. Not undoable.
- `deselectAllNodes` — UI-only state change. Not undoable.
- `setDiagram` — Hydration from API. Clears both stacks instead of pushing.
- `updateEdge` — Top-level edge field changes (type, etc.). The properties panel uses `updateEdgeData` for data changes, and `updateEdge` can optionally remain non-tracked, or tracked in a future follow-up.

### 4. Implement `undo()` and `redo()`

```typescript
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
  });
},

canUndo: () => get().undoStack.length > 0,
canRedo: () => get().redoStack.length > 0,
```

### 5. Wire Keyboard Shortcuts in Editor.tsx

Add undo/redo shortcuts to the existing `handleKeyDown` in `Editor.tsx`:

```typescript
const mod = e.metaKey || e.ctrlKey;

// Check for text input focus — refined to allow shortcuts from non-text inputs
const isTextInput =
  (target.tagName === "INPUT" &&
    ["text", "search", "url", "tel", "password", "number", "email"].includes(
      (target as HTMLInputElement).type
    )) ||
  target.tagName === "TEXTAREA" ||
  target.isContentEditable;

if (isTextInput) return;

if (mod && e.key === "z" && !e.shiftKey) {
  e.preventDefault();
  useDiagramStore.getState().undo();
} else if (mod && e.key === "z" && e.shiftKey) {
  e.preventDefault();
  useDiagramStore.getState().redo();
} else if (mod && e.key === "y") {
  e.preventDefault();
  useDiagramStore.getState().redo();
}
```

**Important:** The undo/redo shortcut block must be placed BEFORE the existing Delete/Backspace and zoom handlers in the function. The text-input guard must be refined to use the `isTextInput` check (allowing `checkbox` and `radio` inputs to pass through) rather than the existing blanket `target.tagName === "INPUT"` check. This refinement applies to ALL shortcuts, not just undo/redo.

### 6. Wire Node Drag Handlers in Editor.tsx

Add drag start/stop tracking for the `moveNode` operation:

```typescript
const [dragStartPositions, setDragStartPositions] = useState<
  Map<string, Position>
>(new Map());

const onNodeDragStart = useCallback(
  (_event: React.MouseEvent, node: Node) => {
    setDragStartPositions((prev) => new Map(prev).set(node.id, node.position));
  },
  []
);

const onNodeDragStop = useCallback(
  (_event: React.MouseEvent, node: Node) => {
    const from = dragStartPositions.get(node.id);
    if (from && (from.x !== node.position.x || from.y !== node.position.y)) {
      useDiagramStore.getState().moveNode(node.id, from, node.position);
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

Pass `onNodeDragStart` and `onNodeDragStop` to the `<ReactFlow>` component props.

**Note:** `moveNode` only pushes the undo operation and updates the position in the store. The visual movement during the drag is handled by React Flow's `onNodesChange` (which does NOT push operations). The operation is only recorded on drag stop, so intermediate drag positions are not individually undoable.

### 7. Update `setDiagram` to Clear Stacks

When a new diagram is loaded from the API, both undo and redo stacks should be cleared:

```typescript
setDiagram: (nodes, edges, viewport) => {
  set({
    nodes,
    edges,
    viewport: viewport ?? DEFAULT_VIEWPORT,
    undoStack: [],
    redoStack: [],
  });
},
```

## Testing

All tests go in `src/frontend/src/stores/__tests__/diagram-undo-redo.test.ts`.

### Stack Behavior Tests

1. **Undo reverses last action** — Add a node, undo. Verify nodes array is empty. Verify undo stack is empty, redo stack has 1 entry.

2. **Redo re-applies undone action** — Add a node, undo, redo. Verify the node is back. Verify undo stack has 1 entry, redo stack is empty.

3. **New action clears redo stack** — Add node A, undo, add node B. Verify redo stack is empty, only node B exists, undo stack has 1 entry.

4. **Undo stack capped at 50** — Push 55 operations. Verify undo stack length is 50. Verify the first 5 operations are lost (cannot be undone).

5. **canUndo/canRedo reflect stack state** — Initially both false. After an action, canUndo is true. After undo, canRedo is true. After redo, canRedo is false.

6. **Undo on empty stack is a no-op** — Call undo on initial state. Verify no error, state unchanged.

7. **Redo on empty stack is a no-op** — Call redo on initial state. Verify no error, state unchanged.

8. **Multiple undos work in sequence** — Perform 3 actions, undo 3 times. Verify state is back to initial.

### Operation-Specific Integration Tests

9. **Undo addNode** — Add a node, undo. Verify the node is removed.

10. **Undo removeNodes restores node AND connected edges** — Add node A, add node B, add edge A→B. Remove node A. Undo. Verify both node A and edge A→B are restored.

11. **Undo moveNode restores original position** — Add a node at (0, 0), call moveNode to (100, 200), undo. Verify node is back at (0, 0).

12. **Undo addEdge** — Add an edge, undo. Verify the edge is removed.

13. **Undo removeEdges** — Add an edge, remove it, undo. Verify the edge is restored.

14. **Undo updateNodeData restores original data** — Set a node's label to "Workers", update to "D1", undo. Verify label is "Workers" again.

15. **Undo updateEdgeData restores original data** — Set an edge's label to "HTTP", update to "gRPC", undo. Verify label is "HTTP" again.

16. **Batch operations undo as a unit** — Remove 3 nodes (which creates a batch operation). Undo once. Verify all 3 nodes and their edges are restored in a single undo step.

17. **setDiagram clears both stacks** — Perform some actions (building undo history), then call setDiagram. Verify both undoStack and redoStack are empty.

18. **onConnect pushes an add_edge operation** — Call onConnect with valid source/target. Verify an operation was pushed to the undo stack. Undo. Verify the edge is removed.

### Manual Tests

After running locally with `npm start`:

1. Open the editor and add several nodes to the canvas.
2. Press Ctrl/Cmd+Z — the last node should disappear.
3. Press Ctrl/Cmd+Shift+Z — the node should reappear.
4. Add a node, connect it to another node, then delete the node. Undo — the node and its edge should both reappear.
5. Perform more than 50 actions. Undo 50 times — the 51st undo should be a no-op.
6. Click into a text input (e.g., node label editor in the properties panel), press Ctrl/Cmd+Z — the browser's native undo should fire, not the diagram undo.
7. Add a node, undo, then add a different node — pressing Ctrl/Cmd+Shift+Z should be a no-op (redo stack cleared).
