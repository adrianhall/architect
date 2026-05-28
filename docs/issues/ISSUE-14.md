# Custom edge types + connection handling + tests

## Summary

Implements the four custom edge types (data-flow, binding, trigger, dependency) as visually distinct React Flow edge components and wires up connection handling. Each edge type has a unique visual style matching the catalog `EdgeType` definitions: solid with animated dots (data-flow), dashed (binding), dotted with arrowhead (trigger), and thin solid (dependency). All edges render an optional label. Connection creation uses an `onConnect` handler in the diagram store that validates no self-loops and defaults new connections to the `data-flow` type with a ULID id.

**Depends on:** ISSUE-13 (React Flow setup, diagram store, Editor page)

## Relevant Skills

- `vercel-react-best-practices`
- `web-component-design`

## Requirements Coverage

- [F4-US4](../REQUIREMENTS.md): Connect two nodes by dragging from a handle — default edge type is `data-flow`; connection must start from a handle; no self-loops. This issue implements the `onConnect` handler, self-loop validation, and handle-based connection creation.
- [F4-US6](../REQUIREMENTS.md): Select an edge and change its type, label, protocol, and description — this issue provides the 4 custom edge type renderers with visual indicators. The actual edge editing UI is in ISSUE-16, but the edge types and their visual rendering are defined here.

## Acceptance Criteria

- [ ] Four custom edge components exist: `DataFlowEdge`, `BindingEdge`, `TriggerEdge`, `DependencyEdge`.
- [ ] `DataFlowEdge` renders as a solid line with animated dots along the path.
- [ ] `BindingEdge` renders as a dashed line.
- [ ] `TriggerEdge` renders as a dotted line with an arrowhead marker.
- [ ] `DependencyEdge` renders as a thin solid line.
- [ ] All edge types render a label when `data.label` is present.
- [ ] All edge types hide the label area when no label is set.
- [ ] Custom edge types are registered via `edgeTypes.ts` and passed to `ReactFlow` in `Editor.tsx`.
- [ ] Dragging from a handle to another node creates a new edge with type `data-flow`.
- [ ] New edges receive a ULID as their `id`.
- [ ] Self-loop connections (source === target) are rejected (no edge is created).
- [ ] Connections must originate from a handle (React Flow enforces this by default).
- [ ] The diagram store has `addEdge`, `updateEdge`, and `onConnect` actions.
- [ ] `Editor.tsx` is updated to register custom edge types and wire `onConnect` to the store.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Install ULID Package in Frontend

Install a ULID generator in the frontend workspace (if not already available from a shared utility):

```bash
npm install ulid --workspace=src/frontend
```

### 2. Create Custom Edge Components

Create `src/frontend/src/components/canvas/edges/` directory with five files:

#### 2a. DataFlowEdge.tsx

The default edge type. Solid line with animated dots flowing along the path.

```typescript
import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

function DataFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#3b82f6" : "#64748b",
          strokeWidth: 2,
          strokeDasharray: "none",
        }}
      />
      {/* Animated dot along the path */}
      <circle r="3" fill="#3b82f6">
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-white px-1.5 py-0.5 text-xs shadow dark:bg-gray-800"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(DataFlowEdge);
```

**Animation note:** The `<circle>` with `<animateMotion>` creates a dot that travels along the bezier path. This respects `prefers-reduced-motion` via CSS:

```css
@media (prefers-reduced-motion: reduce) {
  circle animateMotion {
    animation: none;
  }
  /* SVG animateMotion doesn't respond to CSS; use JS check instead */
}
```

For proper `prefers-reduced-motion` support, conditionally render the animated circle:

```typescript
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Only render <circle> with <animateMotion> when !prefersReducedMotion
```

Or use a shared hook:

```typescript
// src/frontend/src/hooks/useReducedMotion.ts
import { useState, useEffect } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
```

Then in DataFlowEdge: `const reducedMotion = useReducedMotion();` and conditionally render the animated circle.

#### 2b. BindingEdge.tsx

Dashed line style.

```typescript
import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

function BindingEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected, markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#3b82f6" : "#8b5cf6",
          strokeWidth: 2,
          strokeDasharray: "8 4",
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-white px-1.5 py-0.5 text-xs shadow dark:bg-gray-800"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(BindingEdge);
```

#### 2c. TriggerEdge.tsx

Dotted line with an arrowhead marker.

```typescript
import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  MarkerType,
} from "@xyflow/react";

function TriggerEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={MarkerType.ArrowClosed}
        style={{
          stroke: selected ? "#3b82f6" : "#f59e0b",
          strokeWidth: 2,
          strokeDasharray: "3 3",
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-white px-1.5 py-0.5 text-xs shadow dark:bg-gray-800"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(TriggerEdge);
```

**Note on MarkerType:** React Flow's `MarkerType.ArrowClosed` provides a built-in arrowhead SVG marker definition. If the built-in markers are not sufficient, define a custom SVG marker in the `<ReactFlow>` component's `<defs>` section. The simpler approach is to use `markerEnd={{ type: MarkerType.ArrowClosed, color: '#f59e0b' }}` as an object.

#### 2d. DependencyEdge.tsx

Thin solid line — visually distinct from data-flow by being thinner and a different color.

```typescript
import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

function DependencyEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected, markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#3b82f6" : "#94a3b8",
          strokeWidth: 1,
          strokeDasharray: "none",
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-white px-1.5 py-0.5 text-xs shadow dark:bg-gray-800"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(DependencyEdge);
```

### 3. Register Edge Types

Create `src/frontend/src/components/canvas/edgeTypes.ts`:

```typescript
import type { EdgeTypes } from "@xyflow/react";
import DataFlowEdge from "./edges/DataFlowEdge";
import BindingEdge from "./edges/BindingEdge";
import TriggerEdge from "./edges/TriggerEdge";
import DependencyEdge from "./edges/DependencyEdge";

export const edgeTypes: EdgeTypes = {
  "data-flow": DataFlowEdge,
  binding: BindingEdge,
  trigger: TriggerEdge,
  dependency: DependencyEdge,
};
```

The edge type keys match the `DiagramEdge.type` values from the shared types (`"data-flow" | "binding" | "trigger" | "dependency"`), so edges loaded from the API render with the correct custom component automatically.

### 4. Update the Diagram Store with Connection Handling

Update `src/frontend/src/stores/diagram.ts` to add `addEdge`, `updateEdge`, and `onConnect`:

```typescript
import { ulid } from "ulid";
import type { Connection } from "@xyflow/react";

// Add to the DiagramState interface:
interface DiagramState {
  // ... existing fields from ISSUE-13 ...

  addEdge: (edge: Edge) => void;
  updateEdge: (edgeId: string, updates: Partial<Edge>) => void;
  onConnect: (connection: Connection) => void;
}

// Add to the store implementation:
export const useDiagramStore = create<DiagramState>((set, get) => ({
  // ... existing from ISSUE-13 ...

  addEdge: (edge) => {
    set({ edges: [...get().edges, edge] });
  },

  updateEdge: (edgeId, updates) => {
    set({
      edges: get().edges.map((e) =>
        e.id === edgeId ? { ...e, ...updates } : e
      ),
    });
  },

  onConnect: (connection) => {
    // Validate: no self-loops
    if (connection.source === connection.target) {
      return; // Silently reject self-loops
    }

    // Validate: must have source and target (React Flow provides these from handle connections)
    if (!connection.source || !connection.target) {
      return;
    }

    const newEdge: Edge = {
      id: ulid(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      type: "data-flow", // Default edge type per F4-US4
      data: {},
    };

    set({ edges: [...get().edges, newEdge] });
  },
}));
```

**Design decisions:**

- `onConnect` validates self-loops silently (no error toast). A self-loop is simply ignored.
- New connections always default to `"data-flow"` type. Users can change the type via the properties panel (ISSUE-16).
- Edge IDs use ULID for consistency with the rest of the system.
- `updateEdge` does a shallow merge of the updates onto the existing edge. This is used by the properties panel (ISSUE-16) to update individual edge fields.

### 5. Update Editor.tsx

Update `src/frontend/src/pages/Editor.tsx` to integrate edge types and the `onConnect` handler:

```typescript
import { edgeTypes } from "../components/canvas/edgeTypes";

// Inside EditorCanvas component:
const onConnect = useDiagramStore((s) => s.onConnect);

// In the ReactFlow component:
<ReactFlow
  nodes={nodes}
  edges={edges}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  onConnect={onConnect}
  nodeTypes={nodeTypes}
  edgeTypes={edgeTypes}
  fitView
  deleteKeyCode={null}
  defaultEdgeOptions={{ type: "data-flow" }}
  connectionLineStyle={{ stroke: "#64748b", strokeWidth: 2 }}
>
  <MiniMap zoomable pannable />
  <Controls />
  <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
</ReactFlow>
```

- `defaultEdgeOptions={{ type: "data-flow" }}` sets the default edge type for the connection line preview.
- `connectionLineStyle` provides visual feedback during the drag-to-connect interaction.
- `onConnect` is wired directly to the store's `onConnect` action.

### 6. Reduced Motion CSS

Add to the frontend's global CSS (e.g., `src/frontend/src/index.css` or the Tailwind entry file):

```css
@media (prefers-reduced-motion: reduce) {
  .react-flow__edge circle animateMotion,
  animateMotion {
    animation-play-state: paused !important;
  }
}
```

Note: SVG `<animateMotion>` does not respect CSS `animation` properties. The proper way to handle this is the `useReducedMotion` hook approach described in step 2a, conditionally not rendering the animated element. Add the hook and use it in `DataFlowEdge`.

## Testing

### Edge Component Tests

Create tests in `src/frontend/src/components/canvas/edges/__tests__/`:

1. **DataFlowEdge renders with solid style**
   - Render `DataFlowEdge` with mock edge props. Assert the `BaseEdge` receives `strokeDasharray: "none"` and `strokeWidth: 2`.
   - Assert the animated circle element is present (when reduced motion is not active).

2. **BindingEdge renders with dashed style**
   - Render `BindingEdge`. Assert `strokeDasharray: "8 4"` is applied.

3. **TriggerEdge renders with dotted style and arrowhead**
   - Render `TriggerEdge`. Assert `strokeDasharray: "3 3"` and `markerEnd` includes an arrow marker.

4. **DependencyEdge renders with thin solid style**
   - Render `DependencyEdge`. Assert `strokeWidth: 1` and `strokeDasharray: "none"`.

5. **Edge label renders when data.label is present**
   - Render any edge type with `data.label = "HTTP"`. Assert the label text is visible in the DOM.

6. **Edge label is hidden when data.label is absent**
   - Render any edge type with `data = {}`. Assert no label element is rendered.

7. **Selected edge changes stroke color**
   - Render an edge with `selected = true`. Assert stroke color changes to the selection color (`#3b82f6`).

**Testing note:** Custom edge components receive many props from React Flow. For unit tests, create a `mockEdgeProps` factory that provides sensible defaults for all required props (`sourceX`, `sourceY`, `targetX`, `targetY`, `sourcePosition`, `targetPosition`, etc.). Mock `@xyflow/react`'s `BaseEdge`, `EdgeLabelRenderer`, and `getBezierPath` to simplify rendering. `getBezierPath` can be mocked to return `["M 0 0 L 100 100", 50, 50]`.

### Store Connection Tests

Add to `src/frontend/src/stores/__tests__/diagram.test.ts` (extending from ISSUE-13):

1. **onConnect creates a data-flow edge**
   - Call `onConnect({ source: "a", target: "b", sourceHandle: "bottom", targetHandle: "top" })`. Assert a new edge is added with `type: "data-flow"`, correct source/target, and a ULID id.

1. **onConnect rejects self-loops**
   - Call `onConnect({ source: "a", target: "a", sourceHandle: null, targetHandle: null })`. Assert no edge is added.

1. **onConnect generates unique ULID ids**
    - Create two connections. Assert the two edge IDs are different and match the ULID pattern.

1. **addEdge adds an edge to the store**
    - Call `addEdge` with a complete edge object. Assert it appears in `getState().edges`.

1. **updateEdge merges updates onto existing edge**
    - Add an edge with `type: "data-flow"`. Call `updateEdge(id, { type: "binding" })`. Assert the edge type changed but other fields remain.

1. **updateEdge does nothing for non-existent id**
    - Call `updateEdge("nonexistent", { type: "binding" })`. Assert edges array is unchanged.

### Manual Tests

After deploying locally with `npm start`:

1. Open a diagram in the editor with at least two nodes.
2. Drag from a handle on one node to a handle on another — verify a new edge appears with the solid animated-dot style (data-flow).
3. Try to drag from a node's handle back to the same node — verify no edge is created (self-loop rejected).
4. Load a diagram that has edges with different types (set via API or test data) — verify each type renders with its distinct visual style:
   - `data-flow`: solid line with animated dots
   - `binding`: dashed line
   - `trigger`: dotted line with arrowhead
   - `dependency`: thin solid line
5. Add a label to an edge (via API or properties panel from ISSUE-16) — verify the label renders centered on the edge path.
6. Select an edge by clicking it — verify the stroke color changes to indicate selection.
7. Enable "Reduce motion" in OS settings — verify the animated dots on data-flow edges are not animated.
