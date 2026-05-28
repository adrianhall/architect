# Properties panel: node and edge editing + tests

## Summary

Builds the properties panel that appears on the right side of the editor when a node or edge is selected. For nodes, it provides editable fields for label, description, and accent color, plus a read-only service type display and a documentation link button. For edges, it provides an edge type selector with visual indicators for all 4 types, plus editable label, protocol, and description fields. All edits update the diagram store in real-time via controlled inputs. Selection state flows from the `ui` Zustand store.

**Depends on:** ISSUE-14 (custom edge types, updateEdge in diagram store)

## Relevant Skills

- `shadcn`
- `vercel-react-best-practices`
- `web-component-design`

## Requirements Coverage

- [F4-US5](../REQUIREMENTS.md): Select a node and edit its label, description, and accent colour — label 1-80 chars; description ≤500 chars; accent colour resets to category default on clear. This issue implements the full node properties editing UI with validation.
- [F4-US6](../REQUIREMENTS.md): Select an edge and change its type, label, protocol, and description — edge type selector shows all 4 types with visual indicator; label ≤80 chars. This issue implements the full edge properties editing UI.
- [F3-US4](../REQUIREMENTS.md): Click a Documentation link in the properties panel to read the official Cloudflare docs — the node properties panel includes a documentation link button that opens the service's `docUrl` from the catalog in a new tab.

## Acceptance Criteria

- [ ] `PropertiesPanel` renders conditionally: shows `NodeProperties` when a node is selected, `EdgeProperties` when an edge is selected, and nothing (or a "no selection" hint) when nothing is selected.
- [ ] `PropertiesPanel` is positioned as a fixed-width panel on the right side of the editor.
- [ ] `NodeProperties` displays the service type (official name from catalog) as read-only text.
- [ ] `NodeProperties` has a label text input with 1-80 character validation.
- [ ] `NodeProperties` has a description textarea with ≤500 character validation.
- [ ] `NodeProperties` has an accent color picker with a reset button that resets to the category default color.
- [ ] `NodeProperties` has a documentation link button that opens the service's `docUrl` in a new tab.
- [ ] All node property edits update the diagram store in real-time (controlled inputs, no save button).
- [ ] `EdgeProperties` has an edge type selector showing all 4 types with a visual indicator for each (line style preview).
- [ ] `EdgeProperties` has a label text input with ≤80 character validation.
- [ ] `EdgeProperties` has a protocol text input (optional field).
- [ ] `EdgeProperties` has a description textarea (optional field).
- [ ] All edge property edits update the diagram store in real-time.
- [ ] Clicking a node in the editor shows `NodeProperties` for that node.
- [ ] Clicking an edge in the editor shows `EdgeProperties` for that edge.
- [ ] Clicking on the empty canvas (pane click) hides the properties content (clears selection).
- [ ] The diagram store has `updateNodeData(nodeId, data)` and `updateEdgeData(edgeId, data)` actions.
- [ ] Required shadcn components are installed: Input, Textarea, Select (or RadioGroup), Label, Button, Popover (for color picker).
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Update the Diagram Store

Add `updateNodeData` and `updateEdgeData` actions to `src/frontend/src/stores/diagram.ts`:

```typescript
// Add to DiagramState interface:
interface DiagramState {
  // ... existing fields ...
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  updateEdgeData: (edgeId: string, data: Record<string, unknown>) => void;
}

// Add to store implementation:
export const useDiagramStore = create<DiagramState>((set, get) => ({
  // ... existing ...

  updateNodeData: (nodeId, dataUpdates) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...dataUpdates } }
          : node
      ),
    });
  },

  updateEdgeData: (edgeId, dataUpdates) => {
    set({
      edges: get().edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              data: { ...edge.data, ...dataUpdates },
              // If the update includes `type`, set it at edge level (not nested in data)
              ...(dataUpdates.type ? { type: dataUpdates.type as string } : {}),
            }
          : edge
      ),
    });
  },
}));
```

**Note on `updateEdgeData`:** The edge `type` field (data-flow, binding, etc.) is a top-level property on the React Flow Edge object, not nested inside `edge.data`. However, other properties like `label`, `protocol`, and `description` are inside `edge.data`. The implementation handles this by checking for `type` in the updates and applying it at the edge root level. An alternative cleaner API:

```typescript
updateEdgeType: (edgeId: string, type: string) => void;
updateEdgeData: (edgeId: string, data: Record<string, unknown>) => void;
```

This separates the concerns and avoids the conditional logic. Provide both actions.

### 2. Install Required shadcn Components

Add shadcn components needed for the properties panel. Using the shadcn CLI (or copying from the registry):

```bash
# Run from src/frontend
npx shadcn@latest add input textarea label button popover select
```

These provide accessible, styled form components. If shadcn is already configured (from ISSUE-09), the components are added to `src/frontend/src/components/ui/`.

If shadcn is not yet configured, create the components manually using Radix primitives + Tailwind, or use plain HTML form elements with Tailwind styling. The exact installation method depends on ISSUE-09's shadcn setup.

### 3. Create the NodeProperties Component

Create `src/frontend/src/components/panels/NodeProperties.tsx`:

```typescript
import { useCallback, useMemo } from "react";
import { ExternalLink, RotateCcw } from "lucide-react";
import type { Node } from "@xyflow/react";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { useDiagramStore } from "../../stores/diagram";
import { useCatalog } from "../../api/hooks";

interface NodePropertiesProps {
  node: Node;
}

export default function NodeProperties({ node }: NodePropertiesProps) {
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  const { data: catalog } = useCatalog();

  // Look up service and category from catalog
  const service = useMemo(
    () => catalog?.services.find((s) => s.typeId === node.data.serviceTypeId),
    [catalog, node.data.serviceTypeId]
  );
  const category = useMemo(
    () => catalog?.categories.find((c) => c.id === service?.category),
    [catalog, service]
  );

  const categoryDefaultColor = category?.color ?? "#6b7280";

  // Handlers — update store on every change (controlled inputs)
  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value.length <= 80) {
        updateNodeData(node.id, { label: value });
      }
    },
    [node.id, updateNodeData]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length <= 500) {
        updateNodeData(node.id, { description: value });
      }
    },
    [node.id, updateNodeData]
  );

  const handleAccentColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(node.id, { accentColor: e.target.value });
    },
    [node.id, updateNodeData]
  );

  const handleResetColor = useCallback(() => {
    updateNodeData(node.id, { accentColor: undefined });
  }, [node.id, updateNodeData]);

  const handleOpenDocs = useCallback(() => {
    if (service?.docUrl) {
      window.open(service.docUrl, "_blank", "noopener,noreferrer");
    }
  }, [service]);

  return (
    <div className="space-y-4">
      {/* Service type (read-only) */}
      <div>
        <Label className="text-xs text-muted-foreground">Service Type</Label>
        <p className="text-sm font-medium">
          {service?.officialName ?? node.data.serviceTypeId}
        </p>
      </div>

      {/* Label */}
      <div>
        <Label htmlFor="node-label">Label</Label>
        <Input
          id="node-label"
          value={(node.data.label as string) ?? ""}
          onChange={handleLabelChange}
          maxLength={80}
          placeholder="Node label"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {((node.data.label as string) ?? "").length}/80
        </p>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="node-description">Description</Label>
        <Textarea
          id="node-description"
          value={(node.data.description as string) ?? ""}
          onChange={handleDescriptionChange}
          maxLength={500}
          placeholder="Optional description"
          rows={3}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {((node.data.description as string) ?? "").length}/500
        </p>
      </div>

      {/* Accent color */}
      <div>
        <Label htmlFor="node-color">Accent Color</Label>
        <div className="flex items-center gap-2">
          <input
            id="node-color"
            type="color"
            value={(node.data.accentColor as string) ?? categoryDefaultColor}
            onChange={handleAccentColorChange}
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <span className="text-xs text-muted-foreground">
            {(node.data.accentColor as string) ?? categoryDefaultColor}
          </span>
          {node.data.accentColor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetColor}
              title="Reset to category default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="sr-only">Reset color</span>
            </Button>
          )}
        </div>
      </div>

      {/* Documentation link */}
      {service?.docUrl && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleOpenDocs}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Documentation
        </Button>
      )}
    </div>
  );
}
```

**Key design decisions:**

- All inputs are controlled — their values come from the React Flow node's `data` object, and changes immediately update the diagram store via `updateNodeData`. No save button is needed.
- The label input enforces max 80 chars by rejecting keystrokes beyond the limit (in addition to `maxLength` on the input). The same pattern applies to description (500 chars).
- The accent color picker uses a native HTML `<input type="color">`. This is sufficient for MVP. A more polished color picker (e.g., via a Popover with a color palette) can be added later. The Popover import is available if needed.
- The reset button only appears when `accentColor` is set (overridden from default). Clicking it sets `accentColor` to `undefined`, which causes the node to fall back to the category default color.
- The documentation link opens in a new tab with `noopener,noreferrer` for security.
- The character count display (`23/80`) provides feedback without blocking input.

### 4. Create the EdgeProperties Component

Create `src/frontend/src/components/panels/EdgeProperties.tsx`:

```typescript
import { useCallback } from "react";
import type { Edge } from "@xyflow/react";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { useDiagramStore } from "../../stores/diagram";

const EDGE_TYPES = [
  {
    id: "data-flow",
    label: "Data Flow",
    style: "solid",
    description: "Solid line with animated dots",
  },
  {
    id: "binding",
    label: "Binding",
    style: "dashed",
    description: "Dashed line",
  },
  {
    id: "trigger",
    label: "Trigger",
    style: "dotted",
    description: "Dotted line with arrow",
  },
  {
    id: "dependency",
    label: "Dependency",
    style: "thin",
    description: "Thin solid line",
  },
] as const;

interface EdgePropertiesProps {
  edge: Edge;
}

export default function EdgeProperties({ edge }: EdgePropertiesProps) {
  const updateEdge = useDiagramStore((s) => s.updateEdge);
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData);

  const handleTypeChange = useCallback(
    (typeId: string) => {
      updateEdge(edge.id, { type: typeId });
    },
    [edge.id, updateEdge]
  );

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value.length <= 80) {
        updateEdgeData(edge.id, { label: value });
      }
    },
    [edge.id, updateEdgeData]
  );

  const handleProtocolChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateEdgeData(edge.id, { protocol: e.target.value });
    },
    [edge.id, updateEdgeData]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateEdgeData(edge.id, { description: e.target.value });
    },
    [edge.id, updateEdgeData]
  );

  return (
    <div className="space-y-4">
      {/* Edge type selector */}
      <div>
        <Label>Edge Type</Label>
        <div className="mt-1.5 space-y-1">
          {EDGE_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                edge.type === type.id
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-transparent hover:bg-accent"
              }`}
              onClick={() => handleTypeChange(type.id)}
            >
              {/* Visual line style indicator */}
              <EdgeStyleIndicator style={type.style} selected={edge.type === type.id} />
              <div>
                <span>{type.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {type.description}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Label */}
      <div>
        <Label htmlFor="edge-label">Label</Label>
        <Input
          id="edge-label"
          value={(edge.data?.label as string) ?? ""}
          onChange={handleLabelChange}
          maxLength={80}
          placeholder="e.g., HTTP, gRPC"
        />
      </div>

      {/* Protocol */}
      <div>
        <Label htmlFor="edge-protocol">Protocol</Label>
        <Input
          id="edge-protocol"
          value={(edge.data?.protocol as string) ?? ""}
          onChange={handleProtocolChange}
          placeholder="e.g., HTTPS, WebSocket"
        />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="edge-description">Description</Label>
        <Textarea
          id="edge-description"
          value={(edge.data?.description as string) ?? ""}
          onChange={handleDescriptionChange}
          placeholder="Optional description of this connection"
          rows={3}
        />
      </div>
    </div>
  );
}

/**
 * Small SVG indicator showing the line style for each edge type.
 */
function EdgeStyleIndicator({
  style,
  selected,
}: {
  style: string;
  selected: boolean;
}) {
  const color = selected ? "currentColor" : "#94a3b8";

  const dashArray: Record<string, string> = {
    solid: "none",
    dashed: "8 4",
    dotted: "3 3",
    thin: "none",
  };

  const strokeWidth = style === "thin" ? 1 : 2;

  return (
    <svg
      width="32"
      height="16"
      viewBox="0 0 32 16"
      className="flex-shrink-0"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1="8"
        x2="32"
        y2="8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray[style] ?? "none"}
      />
      {style === "dotted" && (
        <polygon points="28,4 32,8 28,12" fill={color} />
      )}
    </svg>
  );
}
```

**Key design decisions:**

- The edge type selector uses radio-button-style buttons with visual line style indicators rather than a dropdown. This makes the types easily scannable and shows the visual distinction at a glance (per F4-US6 AC: "Edge type selector shows all 4 types with visual indicator").
- The `EdgeStyleIndicator` is an inline SVG that renders a short line segment in each style. The trigger type additionally shows an arrowhead polygon.
- Edge type changes use `updateEdge` (which updates the top-level `type` property on the edge), while label/protocol/description changes use `updateEdgeData` (which updates inside `edge.data`).
- Protocol and description fields have no explicit length limit in the requirements but are reasonable text fields.

### 5. Create the PropertiesPanel Component

Create `src/frontend/src/components/panels/PropertiesPanel.tsx`:

```typescript
import { useMemo } from "react";
import { useUIStore } from "../../stores/ui";
import { useDiagramStore } from "../../stores/diagram";
import NodeProperties from "./NodeProperties";
import EdgeProperties from "./EdgeProperties";

export default function PropertiesPanel() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null),
    [selectedNodeId, nodes]
  );

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null),
    [selectedEdgeId, edges]
  );

  // Nothing selected
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-sm text-muted-foreground">
          Select a node or edge to view its properties
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2">
        <h2 className="text-sm font-semibold">
          {selectedNode ? "Node Properties" : "Edge Properties"}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {selectedNode && <NodeProperties node={selectedNode} />}
        {selectedEdge && <EdgeProperties edge={selectedEdge} />}
      </div>
    </div>
  );
}
```

The panel is a simple container that delegates to `NodeProperties` or `EdgeProperties` based on the current selection.

### 6. Integrate PropertiesPanel in Editor.tsx

Update `src/frontend/src/pages/Editor.tsx` to add the properties panel on the right side:

```typescript
import PropertiesPanel from "../components/panels/PropertiesPanel";
import { useUIStore } from "../stores/ui";

// Inside EditorCanvas component:
const selectedNodeId = useUIStore((s) => s.selectedNodeId);
const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
const hasSelection = selectedNodeId !== null || selectedEdgeId !== null;

return (
  <div className="flex h-full">
    {/* Palette sidebar (from ISSUE-15) */}
    <aside className="w-60 flex-shrink-0 border-r bg-background">
      <ServicePalette />
    </aside>

    {/* Canvas area */}
    <div className="flex-1">
      <ReactFlow
        // ... all existing props ...
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
      >
        <MiniMap zoomable pannable />
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>

    {/* Properties panel */}
    {hasSelection && (
      <aside className="w-72 flex-shrink-0 border-l bg-background">
        <PropertiesPanel />
      </aside>
    )}
  </div>
);
```

**Layout:** The editor has a three-column layout:

- Left: palette sidebar (240px / `w-60`)
- Center: React Flow canvas (flex-1, takes remaining space)
- Right: properties panel (288px / `w-72`), shown only when something is selected

When nothing is selected, the canvas occupies the full remaining width. When a node or edge is selected, the properties panel slides in from the right. A CSS transition can be added for the reveal animation, but is not required for MVP.

### 7. Selection Handlers (from ISSUE-15)

The `onNodeClick`, `onEdgeClick`, and `onPaneClick` handlers were set up in ISSUE-15 and wire into the `ui` store. Ensure they are present:

```typescript
const handleNodeClick = useCallback(
  (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
  },
  [setSelectedNode]
);

const handleEdgeClick = useCallback(
  (_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge.id);
  },
  [setSelectedEdge]
);

const handlePaneClick = useCallback(() => {
  clearSelection();
}, [clearSelection]);
```

### 8. Focus Management for Text Inputs

A subtle but important detail: when the user is typing in a properties panel input (label, description, etc.), the Delete/Backspace keyboard shortcut (from ISSUE-13) must NOT delete the selected node/edge. The ISSUE-13 keyboard handler already guards against this by checking `event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA"`. This naturally works because the properties panel inputs are standard HTML input and textarea elements.

Verify this works correctly. If the properties panel uses a contentEditable div or a custom input, the guard in the keyboard handler may need updating.

## Testing

### Store Action Tests

Add to `src/frontend/src/stores/__tests__/diagram.test.ts`:

1. **updateNodeData merges data onto existing node**
   - Add a node with `data: { label: "Workers", serviceTypeId: "workers" }`. Call `updateNodeData(id, { label: "My Worker" })`. Assert `data.label` changed and `data.serviceTypeId` is preserved.

1. **updateNodeData does nothing for non-existent node**
   - Call `updateNodeData("nonexistent", { label: "test" })`. Assert nodes array is unchanged.

1. **updateEdgeData merges data onto existing edge**
   - Add an edge with `data: { label: "HTTP" }`. Call `updateEdgeData(id, { protocol: "HTTPS" })`. Assert `data.label` is preserved and `data.protocol` is `"HTTPS"`.

1. **updateEdge changes edge type at top level**
   - Add an edge with `type: "data-flow"`. Call `updateEdge(id, { type: "binding" })`. Assert `edge.type` is `"binding"`.

### NodeProperties Tests

Create `src/frontend/src/components/panels/__tests__/NodeProperties.test.tsx`:

1. **Renders service type from catalog**
   - Mock `useCatalog` with a service matching the node's `serviceTypeId`. Render `NodeProperties` with a mock node. Assert the official service name is displayed.

1. **Label input displays current label and updates store on change**
   - Render with a node whose `data.label = "Workers"`. Assert input value is "Workers". Type "My Workers" — assert `updateNodeData` was called with the new label.

1. **Label input enforces 80 char max**
   - Render with a node. Set a value at 80 chars — it should be accepted. Set a value at 81 chars — it should be rejected (value stays at 80).

1. **Description textarea updates store on change**
   - Render with a node. Type in the description textarea. Assert `updateNodeData` was called with the description.

1. **Description textarea enforces 500 char max**
   - Similar to label max test but with 500 char limit.

1. **Accent color picker shows category default when no override**
    - Render with a node that has no `accentColor`. Assert the color input value matches the category default color.

1. **Accent color reset button clears accentColor**
    - Render with a node that has `accentColor = "#ff0000"`. Click the reset button. Assert `updateNodeData` was called with `accentColor: undefined`.

1. **Reset button is hidden when no accent color override**
    - Render with a node that has no `accentColor`. Assert the reset button is not in the DOM.

1. **Documentation link opens in new tab**
    - Mock `window.open`. Render with a node whose service has a `docUrl`. Click the documentation button. Assert `window.open` was called with the `docUrl`, `"_blank"`, and `"noopener,noreferrer"`.

1. **Documentation button hidden when no docUrl**
    - Render with a node whose service has no `docUrl` (or service not found). Assert the documentation button is not rendered.

### EdgeProperties Tests

Create `src/frontend/src/components/panels/__tests__/EdgeProperties.test.tsx`:

1. **Renders all 4 edge type options**
    - Render `EdgeProperties` with a mock edge. Assert 4 type buttons are present with labels: "Data Flow", "Binding", "Trigger", "Dependency".

1. **Current edge type is visually highlighted**
    - Render with an edge of `type: "binding"`. Assert the "Binding" button has the selected styling class.

1. **Clicking edge type updates store**
    - Render with a `data-flow` edge. Click the "Trigger" type button. Assert `updateEdge` was called with `{ type: "trigger" }`.

1. **Label input updates edge data**
    - Render with an edge. Type in the label input. Assert `updateEdgeData` was called with the label value.

1. **Protocol input updates edge data**
    - Render with an edge. Type in the protocol input. Assert `updateEdgeData` was called with the protocol value.

1. **Description textarea updates edge data**
    - Render with an edge. Type in the description textarea. Assert `updateEdgeData` was called with the description value.

### PropertiesPanel Tests

Create `src/frontend/src/components/panels/__tests__/PropertiesPanel.test.tsx`:

1. **Shows "no selection" message when nothing selected**
    - Set `selectedNodeId = null` and `selectedEdgeId = null` in the UI store. Render `PropertiesPanel`. Assert the hint text "Select a node or edge" is displayed.

1. **Renders NodeProperties when a node is selected**
    - Set `selectedNodeId = "node-1"` in the UI store. Add a matching node to the diagram store. Render `PropertiesPanel`. Assert the "Node Properties" header and node fields are visible.

1. **Renders EdgeProperties when an edge is selected**
    - Set `selectedEdgeId = "edge-1"` in the UI store. Add a matching edge to the diagram store. Render `PropertiesPanel`. Assert the "Edge Properties" header and edge fields are visible.

1. **Switching selection from node to edge swaps the panel content**
    - Start with a node selected. Change to an edge selection. Assert the panel switches from node to edge properties.

### Manual Tests

After deploying locally with `npm start`:

1. Open a diagram with at least one node and one edge.
2. Click a node — verify the properties panel appears on the right with the node's label, service type, and description fields.
3. Edit the node's label — verify the node label on the canvas updates in real-time.
4. Edit the description — verify no errors and character count updates.
5. Change the accent color — verify the node's border color on the canvas changes.
6. Click the reset color button — verify the color reverts to the category default.
7. Click the documentation link — verify the Cloudflare docs page opens in a new tab.
8. Click an edge — verify the panel switches to edge properties.
9. Change the edge type from Data Flow to Binding — verify the edge on the canvas changes from solid to dashed.
10. Add a label to the edge — verify the label appears on the canvas edge.
11. Click the empty canvas — verify the properties panel disappears (or shows the "no selection" message).
12. While a node is selected, click in the label input and press Delete — verify the node is NOT deleted (keyboard guard works).
