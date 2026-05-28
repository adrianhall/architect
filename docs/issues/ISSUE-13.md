# React Flow setup + custom node types + keyboard shortcuts

## Summary

Sets up React Flow v12 as the canvas engine for the architecture editor. Creates a custom `CloudflareServiceNode` component that renders catalog services with their SVG icon, label, category-colored border, and connection handles. Builds the `Editor.tsx` page with ReactFlow, minimap, controls, background grid, and keyboard shortcuts (Delete/Backspace, +/-, Ctrl+Shift+F). Introduces the Zustand `diagram` store for nodes/edges/viewport state with React Flow change handlers wired in. Loads diagram data from the API when the editor mounts.

**Depends on:** ISSUE-08 (service catalog types + API), ISSUE-10 (routing, app shell, auth context)

## Relevant Skills

- `vercel-react-best-practices`
- `web-component-design`
- `typescript-advanced-types`
- `shadcn`

## Requirements Coverage

- [F4-US1](../REQUIREMENTS.md): Drag a service from a categorised palette onto the canvas — this issue provides the ReactFlow canvas surface and custom node type that palette-dropped nodes will render as (palette drag-drop itself is ISSUE-15, but the node rendering and `addNode` store action are here).
- [F4-US7](../REQUIREMENTS.md): Delete selected nodes/edges with Delete or Backspace — keyboard shortcut is implemented here, with the guard that it must not fire when focus is in a text input or textarea.
- [F4-US12](../REQUIREMENTS.md): Zoom in/out/fit-to-view and pan the canvas — keyboard shortcuts (+, -, Ctrl+Shift+F) and the React Flow Controls component (toolbar buttons) are implemented here.
- [F3-US1](../REQUIREMENTS.md): Each service rendered with correct icon, category colour, and connection handles — the `CloudflareServiceNode` custom node renders the service's SVG icon, label, and category-colored border with four connection handles.

## Acceptance Criteria

- [ ] `@xyflow/react` (React Flow v12) is installed in `src/frontend`.
- [ ] `CloudflareServiceNode` renders a box with: SVG icon centered in the top 2/3, label centered in the bottom 1/3, border color matching the service's category color.
- [ ] `CloudflareServiceNode` renders four `Handle` components (top, bottom, left, right) for edge connections.
- [ ] `CloudflareServiceNode` visually indicates when the node is selected (e.g., thicker border or shadow).
- [ ] Custom node types are registered via `nodeTypes.ts` and passed to `ReactFlow`.
- [ ] `Editor.tsx` renders a full-page `ReactFlow` component with minimap, controls, and background grid.
- [ ] The Zustand `diagram` store manages `nodes`, `edges`, and `viewport` state.
- [ ] `onNodesChange` and `onEdgesChange` from React Flow are wired to the diagram store.
- [ ] `addNode` action adds a node to the store's `nodes` array.
- [ ] `removeNodes` action removes one or more nodes by id from the store.
- [ ] `removeEdges` action removes one or more edges by id from the store.
- [ ] Pressing Delete or Backspace removes all currently selected nodes and edges.
- [ ] Delete/Backspace does NOT trigger deletion when focus is in a text `<input>` or `<textarea>`.
- [ ] `+` key zooms in, `-` key zooms out, `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac) fits the view.
- [ ] Minimap is visible and reflects the current graph layout.
- [ ] Controls component provides zoom-in, zoom-out, and fit-view buttons.
- [ ] Editor loads diagram data from the API on mount via the `useDiagram` TanStack Query hook (from ISSUE-11).
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Install React Flow

Install `@xyflow/react` in the frontend workspace. This is the v12 package (the `react-flow-renderer` package is deprecated).

```bash
npm install @xyflow/react --workspace=src/frontend
```

Also ensure `zustand` is installed (should be from ISSUE-10, but verify):

```bash
npm install zustand --workspace=src/frontend
```

Import React Flow's required CSS in `main.tsx` or `App.tsx`:

```typescript
import "@xyflow/react/dist/style.css";
```

### 2. Create the Zustand Diagram Store

Create `src/frontend/src/stores/diagram.ts`. This store owns all canvas state: nodes, edges, and viewport. It integrates with React Flow's change handler system.

```typescript
import { create } from "zustand";
import {
  type Node,
  type Edge,
  type Viewport,
  type NodeChange,
  type EdgeChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";

interface DiagramState {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;

  // React Flow change handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  // Diagram mutations
  addNode: (node: Node) => void;
  removeNodes: (ids: string[]) => void;
  removeEdges: (ids: string[]) => void;
  setDiagram: (nodes: Node[], edges: Edge[], viewport?: Viewport) => void;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

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
      // Also remove any edges connected to the removed nodes
      edges: get().edges.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target)
      ),
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
```

**Key design decisions:**

- `onNodesChange` and `onEdgesChange` use React Flow's `applyNodeChanges` / `applyEdgeChanges` utilities. These handle position changes, selection changes, dimension changes, and removal changes from React Flow's internal event system.
- `removeNodes` also removes any connected edges (orphan cleanup).
- `setDiagram` is used to hydrate the store from API data on editor mount.
- The store does NOT include undo/redo yet — that's ISSUE-17.
- The store does NOT include `onConnect` yet — that's ISSUE-14.

### 3. Create the CloudflareServiceNode Component

Create `src/frontend/src/components/canvas/CloudflareServiceNode.tsx`. This is a custom React Flow node.

```typescript
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface CloudflareServiceNodeData {
  label: string;
  description?: string;
  accentColor?: string;
  // These are looked up from catalog at render time:
  iconUrl: string;
  categoryColor: string;
}

function CloudflareServiceNode({ data, selected }: NodeProps) {
  const nodeData = data as CloudflareServiceNodeData;
  const borderColor = nodeData.accentColor ?? nodeData.categoryColor;

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border-2 bg-white dark:bg-gray-900",
        "w-[120px] h-[100px] overflow-hidden transition-shadow",
        selected && "shadow-lg ring-2 ring-blue-400"
      )}
      style={{ borderColor }}
    >
      {/* Handles - four cardinal positions */}
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />

      {/* Icon area - top 2/3 */}
      <div className="flex flex-1 items-center justify-center p-2">
        <img
          src={nodeData.iconUrl}
          alt={`${nodeData.label} icon`}
          className="h-10 w-10 object-contain"
          draggable={false}
        />
      </div>

      {/* Label area - bottom 1/3 */}
      <div
        className="w-full px-1 pb-1 text-center text-xs font-medium leading-tight truncate"
        title={nodeData.label}
      >
        {nodeData.label}
      </div>
    </div>
  );
}

export default memo(CloudflareServiceNode);
```

**Design notes:**

- The node is `120px × 100px` with the icon centered in the top ~67% and the label in the bottom ~33%. These dimensions match the design notes in REQUIREMENTS.md Section 4 (Iconography).
- The border color defaults to the category color but can be overridden by `accentColor` (per F4-US5).
- Four `Handle` components allow connections from any side. The top and left handles are `type="target"` (incoming), bottom and right are `type="source"` (outgoing). Both handle types on all positions are needed — set both `type="source"` and `type="target"` on each handle to allow bidirectional connections. Actually, the simplest approach: render two handles per position (one source, one target) stacked, or set `type="source"` on all four and let React Flow handle connection direction. **Recommended approach:** Use a single `Handle` per position with `type="source"` since React Flow allows connecting any source to any target handle by default. Provide all four positions. Alternatively, render handles with different IDs:
  - `top-target` (type=target, Position.Top)
  - `bottom-source` (type=source, Position.Bottom)
  - `left-target` (type=target, Position.Left)
  - `right-source` (type=source, Position.Right)

This gives a natural flow direction (top-to-bottom, left-to-right) while still allowing any-to-any connections.

- The component is memoized with `memo()` to avoid unnecessary re-renders when other nodes change.
- `selected` state is visually indicated with a ring and shadow.
- Icon is loaded as an `<img>` pointing to the icon URL served by the worker (e.g., `/api/catalog/icons/workers.svg` or a static path — use whatever icon serving mechanism ISSUE-08 establishes). If icons are served from `catalog/icons/` as static assets, the URL pattern will be `/catalog/icons/{iconPath}`. Check how ISSUE-08 exposes icons.

### 4. Register Custom Node Types

Create `src/frontend/src/components/canvas/nodeTypes.ts`:

```typescript
import type { NodeTypes } from "@xyflow/react";
import CloudflareServiceNode from "./CloudflareServiceNode";

export const nodeTypes: NodeTypes = {
  cloudflareService: CloudflareServiceNode,
};
```

All diagram nodes will use `type: "cloudflareService"` in their React Flow node data. When loading from the API, the `DiagramNode.type` field stores the catalog `typeId` (e.g., `"workers"`). The conversion from API data to React Flow nodes must map:

```typescript
// Converting API DiagramNode → React Flow Node
function toReactFlowNode(diagramNode: DiagramNode, catalog: CatalogData): Node {
  const service = catalog.services.find(s => s.typeId === diagramNode.type);
  const category = catalog.categories.find(c => c.id === service?.category);

  return {
    id: diagramNode.id,
    type: "cloudflareService", // React Flow node type key
    position: diagramNode.position,
    data: {
      label: diagramNode.data.label,
      description: diagramNode.data.description,
      accentColor: diagramNode.data.accentColor,
      serviceTypeId: diagramNode.type, // preserve catalog typeId
      iconUrl: service ? `/catalog/icons/${service.iconPath}` : "",
      categoryColor: category?.color ?? "#6b7280",
    },
  };
}
```

Place this converter function in a utility file, e.g., `src/frontend/src/components/canvas/utils.ts`, or inline in the Editor page.

### 5. Build the Editor Page

Create `src/frontend/src/pages/Editor.tsx`. This is the main editor page that composes all canvas components.

```typescript
import { useCallback, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom"; // or wouter, whatever ISSUE-10 establishes
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type Viewport,
} from "@xyflow/react";
import { nodeTypes } from "../components/canvas/nodeTypes";
import { useDiagramStore } from "../stores/diagram";
import { useDiagram, useCatalog } from "../api/hooks"; // from ISSUE-11

function EditorCanvas() {
  const { id } = useParams<{ id: string }>();
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // TanStack Query hooks from ISSUE-11
  const { data: diagram, isLoading: diagramLoading } = useDiagram(id!);
  const { data: catalog, isLoading: catalogLoading } = useCatalog();

  // Zustand store
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const onNodesChange = useDiagramStore((s) => s.onNodesChange);
  const onEdgesChange = useDiagramStore((s) => s.onEdgesChange);
  const setDiagram = useDiagramStore((s) => s.setDiagram);
  const removeNodes = useDiagramStore((s) => s.removeNodes);
  const removeEdges = useDiagramStore((s) => s.removeEdges);

  // Hydrate store when API data arrives
  useEffect(() => {
    if (diagram && catalog) {
      const rfNodes = diagram.graph_data.nodes.map((n) =>
        toReactFlowNode(n, catalog)
      );
      const rfEdges = diagram.graph_data.edges.map((e) =>
        toReactFlowEdge(e)
      );
      setDiagram(rfNodes, rfEdges, diagram.graph_data.viewport);
    }
  }, [diagram, catalog, setDiagram]);

  // Keyboard shortcut handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't handle shortcuts when focus is in an input or textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Delete / Backspace — remove selected nodes and edges
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const selectedNodeIds = nodes
          .filter((n) => n.selected)
          .map((n) => n.id);
        const selectedEdgeIds = edges
          .filter((e) => e.selected)
          .map((e) => e.id);
        if (selectedNodeIds.length > 0) removeNodes(selectedNodeIds);
        if (selectedEdgeIds.length > 0) removeEdges(selectedEdgeIds);
      }

      // + / = — zoom in (= key is the unshifted + on most keyboards)
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      }

      // - — zoom out
      if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      }

      // Ctrl+Shift+F / Cmd+Shift+F — fit view
      if (
        event.key === "f" &&
        event.shiftKey &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        fitView({ padding: 0.1 });
      }
    },
    [nodes, edges, removeNodes, removeEdges, zoomIn, zoomOut, fitView]
  );

  // Attach keyboard listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (diagramLoading || catalogLoading) {
    return <div className="flex h-full items-center justify-center">Loading...</div>;
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={null} // We handle delete ourselves to guard against text input focus
      >
        <MiniMap zoomable pannable />
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

// Wrap with ReactFlowProvider (required for useReactFlow hook)
export default function Editor() {
  return (
    <ReactFlowProvider>
      <EditorCanvas />
    </ReactFlowProvider>
  );
}
```

**Critical implementation notes:**

- `deleteKeyCode={null}` disables React Flow's built-in delete key handling. We implement our own to add the text-input guard (per F4-US7 AC: "Shortcut never triggers while focus is in a text input or textarea").
- `ReactFlowProvider` must wrap the component that calls `useReactFlow()`. The simplest pattern is to have `Editor` render the provider and `EditorCanvas` as the inner component.
- The `handleKeyDown` callback reads the current `nodes` and `edges` from the store to find selected items. This is included in the dependency array. If performance becomes an issue with many nodes, consider using `useDiagramStore.getState()` inside the callback instead.
- Diagram data is hydrated into the Zustand store via `setDiagram` when the API query resolves. The `toReactFlowNode` and `toReactFlowEdge` converters transform API types to React Flow types, enriching nodes with icon URLs and category colors from the catalog.

### 6. Create Edge Conversion Utility

Create `src/frontend/src/components/canvas/utils.ts` with both the node and edge conversion functions:

```typescript
import type { Node, Edge } from "@xyflow/react";
import type { DiagramNode, DiagramEdge, CatalogData } from "@architect/shared";

export function toReactFlowNode(
  diagramNode: DiagramNode,
  catalog: CatalogData
): Node {
  const service = catalog.services.find((s) => s.typeId === diagramNode.type);
  const category = catalog.categories.find((c) => c.id === service?.category);

  return {
    id: diagramNode.id,
    type: "cloudflareService",
    position: diagramNode.position,
    data: {
      label: diagramNode.data.label,
      description: diagramNode.data.description,
      accentColor: diagramNode.data.accentColor,
      serviceTypeId: diagramNode.type,
      iconUrl: service ? `/catalog/icons/${service.iconPath}` : "",
      categoryColor: category?.color ?? "#6b7280",
    },
  };
}

export function toReactFlowEdge(diagramEdge: DiagramEdge): Edge {
  return {
    id: diagramEdge.id,
    source: diagramEdge.source,
    target: diagramEdge.target,
    sourceHandle: diagramEdge.sourceHandle,
    targetHandle: diagramEdge.targetHandle,
    type: diagramEdge.type, // Will map to custom edge types in ISSUE-14
    data: diagramEdge.data ?? {},
  };
}

export function fromReactFlowNode(node: Node): DiagramNode {
  return {
    id: node.id,
    type: node.data.serviceTypeId as string,
    position: node.position,
    data: {
      label: node.data.label as string,
      description: node.data.description as string | undefined,
      accentColor: node.data.accentColor as string | undefined,
    },
  };
}

export function fromReactFlowEdge(edge: Edge): DiagramEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    type: edge.type as DiagramEdge["type"],
    data: edge.data as DiagramEdge["data"],
  };
}
```

These bidirectional converters are essential: `toReactFlow*` is used when loading from API, `fromReactFlow*` is used when saving back to API (ISSUE-18).

### 7. Wire the Editor Route

Ensure the router (from ISSUE-10) has a route for `/diagrams/:id` that renders the `Editor` page. This should already exist from ISSUE-10's routing setup, but verify and add if missing:

```typescript
// In App.tsx or routes config
<Route path="/diagrams/:id" element={<Editor />} />
```

### 8. Loading and Error States

The Editor should handle:

- **Loading:** Show a spinner or skeleton while the diagram and catalog are loading from the API.
- **Error:** If the diagram is not found (404) or the user doesn't own it, show an error message with a link back to the dashboard.
- **Empty diagram:** A newly created diagram has empty nodes/edges arrays. The canvas should display correctly with no nodes, showing only the background grid.

### 9. Utility: cn() helper

If not already installed (from ISSUE-09), ensure the `cn()` classname merge utility is available. This is typically part of the shadcn/ui setup:

```typescript
// src/frontend/src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Testing

All component and store tests go in `src/frontend/src/` colocated with their source files (e.g., `__tests__/` directories or `.test.tsx` suffixes). Use the frontend Vitest config with `jsdom` environment.

### Diagram Store Tests

Create `src/frontend/src/stores/__tests__/diagram.test.ts`:

1. **addNode adds a node to the store**
   - Call `addNode` with a node. Assert `getState().nodes` has length 1 and contains the node.

2. **removeNodes removes nodes by id**
   - Add two nodes. Call `removeNodes([node1.id])`. Assert only node2 remains.

3. **removeNodes also removes connected edges**
   - Add two nodes and an edge between them. Call `removeNodes([node1.id])`. Assert both the node and the connected edge are removed.

4. **removeEdges removes edges by id**
   - Add two nodes and an edge. Call `removeEdges([edge.id])`. Assert edge is removed, nodes remain.

5. **setDiagram replaces all state**
   - Add some initial data. Call `setDiagram` with new nodes/edges/viewport. Assert state is fully replaced.

6. **setDiagram uses default viewport when none provided**
   - Call `setDiagram([], [])` without a viewport. Assert viewport is `{ x: 0, y: 0, zoom: 1 }`.

7. **onNodesChange applies position changes**
   - Add a node. Dispatch a position change via `onNodesChange`. Assert the node's position is updated. Use React Flow's `NodeChange` type to construct the change object.

8. **onEdgesChange applies selection changes**
   - Add an edge. Dispatch a selection change via `onEdgesChange`. Assert the edge's `selected` property is updated.

### CloudflareServiceNode Tests

Create `src/frontend/src/components/canvas/__tests__/CloudflareServiceNode.test.tsx`:

1. **Renders icon and label**
   - Render `CloudflareServiceNode` with mock props including `data.iconUrl` and `data.label`. Assert the image `src` matches the icon URL and the label text is displayed.

2. **Uses category color for border when no accent color**
   - Render with `data.categoryColor = "#2563eb"` and no `accentColor`. Assert the border color is `#2563eb`.

3. **Uses accent color for border when provided**
   - Render with `data.accentColor = "#ff0000"` and `data.categoryColor = "#2563eb"`. Assert the border color is `#ff0000`.

4. **Shows selected state visual indicator**
   - Render with `selected = true`. Assert the selected CSS classes (ring, shadow) are applied.

5. **Renders four handles**
   - Render the node. Assert four `Handle` elements are present (query by the React Flow handle data attributes or roles).

**Testing note for React Flow components:** Testing custom nodes requires rendering within a React Flow context. Either:

- Wrap in `<ReactFlowProvider>` for tests that need the full context.
- For simpler tests, render the component directly with mock `NodeProps` — the `Handle` component may need mocking if it requires context.

A practical approach: mock `@xyflow/react`'s `Handle` component to render a simple `<div>` and test the rest of the node logic directly.

### Keyboard Shortcut Tests

Create `src/frontend/src/pages/__tests__/Editor.test.tsx` (or test the keyboard handler in isolation):

1. **Delete key removes selected node**
   - Set up the diagram store with one selected node. Simulate a `keydown` event with `key: "Delete"`. Assert the node is removed from the store.

2. **Backspace key removes selected edge**
   - Set up with one selected edge. Simulate `keydown` with `key: "Backspace"`. Assert the edge is removed.

3. **Delete does NOT fire when focus is in an input**
   - Set up with a selected node. Create an `<input>` element, focus it, and simulate `keydown` with `key: "Delete"` targeting the input. Assert the node is NOT removed.

4. **Delete does NOT fire when focus is in a textarea**
   - Same as above but with a `<textarea>`.

5. **+ key triggers zoom in**
   - Mock `useReactFlow().zoomIn`. Simulate `keydown` with `key: "+"`. Assert `zoomIn` was called.

6. **- key triggers zoom out**
   - Mock `useReactFlow().zoomOut`. Simulate `keydown` with `key: "-"`. Assert `zoomOut` was called.

7. **Ctrl+Shift+F triggers fit view**
   - Mock `useReactFlow().fitView`. Simulate `keydown` with `key: "f"`, `shiftKey: true`, `ctrlKey: true`. Assert `fitView` was called.

### Conversion Utility Tests

Create `src/frontend/src/components/canvas/__tests__/utils.test.ts`:

1. **toReactFlowNode maps fields correctly**
   - Provide a `DiagramNode` and mock `CatalogData`. Assert the returned React Flow node has the correct `type`, `position`, `data.label`, `data.iconUrl`, and `data.categoryColor`.

2. **toReactFlowNode falls back to gray when service not found in catalog**
   - Provide a `DiagramNode` with a `type` not in the catalog. Assert `categoryColor` is `#6b7280`.

3. **toReactFlowEdge maps all fields**
   - Provide a `DiagramEdge`. Assert the returned React Flow edge has correct `id`, `source`, `target`, `type`, and `data`.

4. **fromReactFlowNode round-trips correctly**
   - Convert a `DiagramNode` to React Flow and back. Assert the result matches the original (minus the enriched catalog data).

### Manual Tests

After deploying locally with `npm start`:

1. Navigate to a diagram editor page (create a diagram from the dashboard first, or go directly to `/diagrams/<ID>`).
2. Verify the canvas renders with a dotted background grid.
3. Verify the minimap is visible in the corner.
4. Verify the controls (zoom in/out/fit) are visible and functional.
5. If the diagram has nodes (add some via the API or test data), verify they render with icons and labels.
6. Select a node by clicking it — verify the selected visual indicator appears.
7. Press Delete — verify the node is removed.
8. Click on an empty text input (e.g., in the properties panel or a form element), then press Delete — verify nothing is deleted.
9. Press `+` and `-` — verify zoom changes.
10. Press `Ctrl+Shift+F` — verify the view fits to the content.
