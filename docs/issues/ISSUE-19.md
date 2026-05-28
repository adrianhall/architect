# ELK auto-layout in Web Worker + tests

## Summary

Implements auto-layout for the diagram canvas using ELK.js running in a Web Worker so layout computation never blocks the main thread. Users can trigger layout via a toolbar button with a direction dropdown (Top-to-Bottom or Left-to-Right). The resulting node positions are applied to the diagram store as a batch operation so the entire layout change is a single undo/redo step. Vite's native Web Worker support is used for the worker import.

## Relevant Skills

- `web-perf`

## Requirements Coverage

- [F4-US9](../REQUIREMENTS.md): Auto-layout the diagram top-to-bottom or left-to-right. Layout runs off the main thread; UI remains responsive during layout; edges re-routed to matching handles; two directions selectable.

## Acceptance Criteria

- [ ] `elkjs` is installed as a dependency in `src/frontend`.
- [ ] `src/frontend/src/workers/elk-layout.worker.ts` receives diagram nodes and edges, runs ELK layout, and returns positioned nodes.
- [ ] The worker uses ELK's `layered` algorithm with configurable direction (`TB` or `LR`).
- [ ] The worker posts an error message back on failure rather than crashing silently.
- [ ] `useAutoLayout` hook creates the Web Worker, exposes `applyLayout(direction)`, tracks `isLayouting` state, and cleans up the worker on unmount.
- [ ] Layout results are applied to the diagram store via a batch `move_node` operation (from ISSUE-17) so the layout is a single undo/redo step.
- [ ] `LayoutButton` component renders a toolbar button with a dropdown for direction selection (Top-to-Bottom, Left-to-Right).
- [ ] The layout button is disabled and shows a spinner while layout is in progress.
- [ ] The layout button is wired into the `Editor.tsx` toolbar.
- [ ] Vite configuration supports the `new Worker(new URL(...), { type: 'module' })` import pattern.
- [ ] Layout produces valid, non-overlapping positions for nodes.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Install elkjs

Install `elkjs` in the frontend workspace:

```bash
npm install elkjs --workspace=src/frontend
```

The `elkjs` package ships with `elkjs/lib/elk.bundled.js` which is a self-contained bundle suitable for use in Web Workers (no additional dependencies or dynamic imports).

### 2. Create the ELK Layout Worker

Create `src/frontend/src/workers/elk-layout.worker.ts`:

```typescript
// src/frontend/src/workers/elk-layout.worker.ts
import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

export interface LayoutRequest {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
  direction: "TB" | "LR";
}

export interface LayoutResult {
  type: "result";
  positions: Array<{
    nodeId: string;
    position: { x: number; y: number };
  }>;
}

export interface LayoutError {
  type: "error";
  message: string;
}

self.onmessage = async (event: MessageEvent<LayoutRequest>) => {
  try {
    const { nodes, edges, direction } = event.data;

    // Map to ELK graph format
    const elkGraph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction === "TB" ? "DOWN" : "RIGHT",
        "elk.spacing.nodeNode": "50",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
        "elk.spacing.edgeNode": "30",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      },
      children: nodes.map((node) => ({
        id: node.id,
        width: node.width,
        height: node.height,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    const layout = await elk.layout(elkGraph);

    const positions: LayoutResult["positions"] =
      layout.children?.map((child) => ({
        nodeId: child.id,
        position: { x: child.x ?? 0, y: child.y ?? 0 },
      })) ?? [];

    const response: LayoutResult = { type: "result", positions };
    self.postMessage(response);
  } catch (err) {
    const response: LayoutError = {
      type: "error",
      message: err instanceof Error ? err.message : "Layout failed",
    };
    self.postMessage(response);
  }
};
```

### 3. Create the useAutoLayout Hook

Create `src/frontend/src/hooks/useAutoLayout.ts`:

```typescript
// src/frontend/src/hooks/useAutoLayout.ts
import { useRef, useState, useCallback, useEffect } from "react";
import { useDiagramStore } from "../stores/diagram";
import type { LayoutResult, LayoutError } from "../workers/elk-layout.worker";

// Default node dimensions (should match the custom node component)
const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 100;

export function useAutoLayout() {
  const workerRef = useRef<Worker | null>(null);
  const [isLayouting, setIsLayouting] = useState(false);

  // Create worker on mount
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/elk-layout.worker.ts", import.meta.url),
      { type: "module" }
    );

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const applyLayout = useCallback(
    (direction: "TB" | "LR") => {
      const worker = workerRef.current;
      if (!worker || isLayouting) return;

      setIsLayouting(true);

      const { nodes, edges } = useDiagramStore.getState();

      // Send layout request to worker
      worker.postMessage({
        nodes: nodes.map((node) => ({
          id: node.id,
          position: node.position,
          width: DEFAULT_NODE_WIDTH,
          height: DEFAULT_NODE_HEIGHT,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
        })),
        direction,
      });

      // Listen for the result (one-shot)
      const handleMessage = (
        event: MessageEvent<LayoutResult | LayoutError>
      ) => {
        worker.removeEventListener("message", handleMessage);

        if (event.data.type === "result") {
          // Apply positions as a batch operation for undo/redo
          const currentNodes = useDiagramStore.getState().nodes;
          const moveOperations = event.data.positions
            .map((pos) => {
              const node = currentNodes.find((n) => n.id === pos.nodeId);
              if (!node) return null;
              // Only create a move operation if the position actually changed
              if (
                node.position.x === pos.position.x &&
                node.position.y === pos.position.y
              ) {
                return null;
              }
              return {
                type: "move_node" as const,
                nodeId: pos.nodeId,
                from: { ...node.position },
                to: pos.position,
              };
            })
            .filter(Boolean);

          if (moveOperations.length > 0) {
            // Use the store's batch move method or push a batch operation directly
            useDiagramStore.getState().applyBatchOperation({
              type: "batch",
              operations: moveOperations,
            });
          }
        } else {
          // Handle error — log or show a toast notification
          console.error("Layout failed:", event.data.message);
        }

        setIsLayouting(false);
      };

      worker.addEventListener("message", handleMessage);
    },
    [isLayouting]
  );

  return { applyLayout, isLayouting };
}
```

**Note:** The diagram store (from ISSUE-17) needs an `applyBatchOperation(op: BatchOperation)` action that applies the operation and pushes it to the undo stack. This is the integration point between the auto-layout feature and the undo/redo system. If ISSUE-17 does not expose this directly, add it as part of this issue.

### 4. Create the LayoutButton Component

Create `src/frontend/src/components/canvas/LayoutButton.tsx`:

```typescript
// src/frontend/src/components/canvas/LayoutButton.tsx
import { useAutoLayout } from "../../hooks/useAutoLayout";
// Import shadcn/ui components for dropdown menu and button
// import { Button } from "../ui/button";
// import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../ui/dropdown-menu";

export function LayoutButton() {
  const { applyLayout, isLayouting } = useAutoLayout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isLayouting}
          aria-label="Auto-layout"
        >
          {isLayouting ? (
            <>
              {/* Spinner icon */}
              <LoaderIcon className="h-4 w-4 animate-spin mr-1" />
              Layouting...
            </>
          ) : (
            <>
              {/* Layout icon */}
              <LayoutIcon className="h-4 w-4 mr-1" />
              Layout
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => applyLayout("TB")}>
          Top to Bottom
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => applyLayout("LR")}>
          Left to Right
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Use appropriate icons from `lucide-react` (already a shadcn dependency): `LayoutDashboard` or `GitBranch` for the layout icon, `Loader2` for the spinner.

### 5. Wire Into Editor.tsx

Add `<LayoutButton />` to the editor toolbar alongside other canvas controls:

```typescript
// In Editor.tsx toolbar area
<div className="flex items-center gap-2 p-2 border-b">
  {/* Other toolbar buttons */}
  <LayoutButton />
</div>
```

### 6. Vite Worker Configuration

Vite supports Web Workers out of the box with the `new Worker(new URL(...), { type: 'module' })` pattern. No additional Vite config is needed for basic worker support. However, verify:

- The worker file uses `.ts` extension and Vite will transpile it.
- The `elkjs/lib/elk.bundled.js` import resolves correctly in the worker bundle.
- If there are issues with the bundled ELK import in the worker context, use `elkjs/lib/elk-worker.min.js` instead, or configure Vite's `worker.format` to `'es'` in `vite.config.ts`:

```typescript
// vite.config.ts
export default defineConfig({
  // ... existing config
  worker: {
    format: "es",
  },
});
```

### 7. Node Dimensions

The ELK layout algorithm needs node width and height. Since React Flow custom nodes may have variable sizes, there are two approaches:

1. **Fixed dimensions (simpler, recommended for MVP):** Use constants matching the custom node component's CSS dimensions (e.g., 160x100).
2. **Measured dimensions (more accurate):** Read actual DOM dimensions from React Flow's internal node measurements via `useNodes()` or `getNodes()` which include `measured.width` and `measured.height`.

For the MVP, start with fixed dimensions. If layout accuracy becomes an issue, switch to measured dimensions by reading from React Flow's `getNodes()`:

```typescript
const rfNodes = reactFlowInstance.getNodes();
const nodesWithDimensions = rfNodes.map((n) => ({
  id: n.id,
  position: n.position,
  width: n.measured?.width ?? DEFAULT_NODE_WIDTH,
  height: n.measured?.height ?? DEFAULT_NODE_HEIGHT,
}));
```

### 8. Edge Re-routing After Layout

After ELK positions nodes, React Flow will automatically re-route edges based on the new node positions and handle positions. No manual edge re-routing is needed — React Flow handles this when node positions change. The edges will follow whatever routing algorithm React Flow uses (default: bezier curves between handles).

## Testing

Tests go in `src/frontend/src/workers/__tests__/elk-layout.test.ts`, `src/frontend/src/hooks/__tests__/useAutoLayout.test.ts`, and `src/frontend/src/components/canvas/__tests__/LayoutButton.test.ts`.

### ELK Layout Logic Tests (`elk-layout.test.ts`)

Since Web Workers are not available in jsdom, extract the layout logic into a testable pure function and test it directly. Create `src/frontend/src/workers/elk-layout-logic.ts` that the worker imports:

```typescript
// src/frontend/src/workers/elk-layout-logic.ts
import ELK from "elkjs/lib/elk.bundled.js";

export async function computeLayout(
  nodes: ...,
  edges: ...,
  direction: "TB" | "LR"
): Promise<LayoutResult["positions"]> {
  // Same logic as in the worker
}
```

The worker becomes a thin wrapper that calls `computeLayout` and posts the result.

1. **Computes valid positions for a simple graph:**
   - 3 nodes: A → B → C with 2 edges.
   - Call `computeLayout(nodes, edges, "TB")`.
   - Assert all 3 nodes have positions, no NaN values, positions are distinct (non-overlapping).

1. **TB direction produces vertical layout:**
   - 2 connected nodes. Layout with `"TB"`.
   - Assert the source node's y is less than the target node's y (source is above target).

1. **LR direction produces horizontal layout:**
   - 2 connected nodes. Layout with `"LR"`.
   - Assert the source node's x is less than the target node's x (source is left of target).

1. **Empty graph returns empty positions:**
   - No nodes, no edges. Assert `positions` is an empty array.

1. **Single node returns a valid position:**
   - 1 node, no edges. Assert it has a position (typically `{ x: 0, y: 0 }` or similar).

1. **Disconnected nodes are still positioned:**
   - 3 nodes with no edges. Assert all 3 have positions and they don't overlap.

1. **Error handling returns error response:**
   - Pass invalid input (e.g., edge referencing non-existent node). Assert the function throws or the worker posts an error message.

### useAutoLayout Hook Tests (`useAutoLayout.test.ts`)

Since the hook creates a real Web Worker which won't work in jsdom, mock the Worker constructor:

1. **applyLayout sends a message to the worker:**
   - Mock `Worker` class. Call `applyLayout("TB")`.
   - Assert `worker.postMessage` was called with the correct structure.

1. **isLayouting is true while waiting for worker response:**
   - Call `applyLayout`. Assert `isLayouting` is `true`.
   - Simulate worker response. Assert `isLayouting` is `false`.

1. **Layout result applies batch operation to store:**
    - Mock worker to return positions. Call `applyLayout`.
    - Assert the diagram store's `applyBatchOperation` was called with a batch of `move_node` operations.

1. **Worker error sets isLayouting to false:**
    - Mock worker to return an error message.
    - Assert `isLayouting` returns to `false` and no store operations are applied.

1. **Worker is terminated on unmount:**
    - Render the hook, then unmount.
    - Assert `worker.terminate()` was called.

### LayoutButton Component Tests (`LayoutButton.test.ts`)

1. **Renders a button with "Layout" text.**
1. **Clicking "Top to Bottom" calls applyLayout("TB").**
1. **Clicking "Left to Right" calls applyLayout("LR").**
1. **Button is disabled and shows spinner when isLayouting is true.**
1. **Button is enabled when isLayouting is false.**

### Manual Tests

After running locally with `npm start`:

1. Open a diagram with several nodes. Click the Layout button → "Top to Bottom". Nodes should rearrange into a top-to-bottom layered layout. The canvas should remain interactive (no freeze) during layout.
2. Click Layout → "Left to Right". Nodes should rearrange into a left-to-right layout.
3. After a layout, press Ctrl/Cmd+Z. All nodes should return to their pre-layout positions in a single undo step.
4. Press Ctrl/Cmd+Shift+Z. Nodes should return to the laid-out positions.
5. Open a diagram with a single node. Click layout — it should succeed without errors (single node positioned).
6. Open an empty diagram. Click layout — it should be a no-op without errors.
