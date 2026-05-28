# Service palette: categories, collapse, drag-drop + tests

## Summary

Builds the service palette sidebar that lets users browse and drag Cloudflare services onto the canvas. Services are grouped by category with collapsible sections, each headed by the category's color indicator. Individual service items are HTML5-draggable and carry their catalog `typeId` as drag data. A Zustand `ui` store tracks collapsed category state and selection state. The Editor page integrates `onDrop` and `onDragOver` handlers so that dropping a service onto the canvas creates a new node at the drop position with catalog defaults.

**Depends on:** ISSUE-13 (React Flow setup, diagram store, Editor page, custom node types)

## Relevant Skills

- `shadcn`
- `vercel-react-best-practices`
- `web-component-design`
- `vercel-composition-patterns`

## Requirements Coverage

- [F4-US1](../REQUIREMENTS.md): Drag a service from a categorised palette onto the canvas — node dropped at cursor position; receives catalog default label; immediately selectable. This issue implements the full drag-from-palette-to-canvas flow.
- [F4-US3](../REQUIREMENTS.md): Collapse/expand palette categories — state persists in user preferences (ui store); search overrides collapsed state is deferred (F4-US2 is post-MVP).
- [F3-US1](../REQUIREMENTS.md): Each service rendered with the correct icon, category colour — the palette displays services with their catalog icon and grouped under category-colored headers.

## Acceptance Criteria

- [ ] `ServicePalette` renders all catalog services grouped by category.
- [ ] Each category section has a header showing a color dot (matching category color), the category label, and a chevron toggle.
- [ ] Clicking a category header toggles the section between collapsed and expanded.
- [ ] Collapsed/expanded state is tracked per category in the `ui` Zustand store.
- [ ] Each service item displays the service's SVG icon and short name.
- [ ] Each service item is draggable (HTML5 drag-and-drop, `draggable="true"`).
- [ ] Dragging a service item sets transfer data containing at minimum the `typeId`.
- [ ] The category collapse/expand uses an animated height transition.
- [ ] Dropping a service on the canvas creates a new node at the drop position.
- [ ] The new node has: a ULID id, `type: "cloudflareService"`, position from drop coordinates, `data.label` from the service's `shortName`, and catalog-enriched icon/color data.
- [ ] The new node is immediately selectable after being added.
- [ ] `onDragOver` on the ReactFlow canvas sets `event.dataTransfer.dropEffect = "move"` to allow the drop.
- [ ] The `ui` Zustand store has: `collapsedCategories`, `selectedNodeId`, `selectedEdgeId`, `panelVisible` state fields.
- [ ] The `ui` store has: `toggleCategory`, `setSelectedNode`, `setSelectedEdge` actions.
- [ ] The palette uses catalog data from the `useCatalog` TanStack Query hook (from ISSUE-11).
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Create the UI Zustand Store

Create `src/frontend/src/stores/ui.ts`:

```typescript
import { create } from "zustand";

interface UIState {
  /** Set of category IDs that are currently collapsed */
  collapsedCategories: Set<string>;
  /** Currently selected node ID (null if none) */
  selectedNodeId: string | null;
  /** Currently selected edge ID (null if none) */
  selectedEdgeId: string | null;
  /** Whether the properties panel is visible */
  panelVisible: boolean;

  // Actions
  toggleCategory: (categoryId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setPanelVisible: (visible: boolean) => void;
  clearSelection: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  collapsedCategories: new Set(),
  selectedNodeId: null,
  selectedEdgeId: null,
  panelVisible: true,

  toggleCategory: (categoryId) => {
    const current = get().collapsedCategories;
    const next = new Set(current);
    if (next.has(categoryId)) {
      next.delete(categoryId);
    } else {
      next.add(categoryId);
    }
    set({ collapsedCategories: next });
  },

  setSelectedNode: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: null, // Clear edge selection when a node is selected
    });
  },

  setSelectedEdge: (edgeId) => {
    set({
      selectedEdgeId: edgeId,
      selectedNodeId: null, // Clear node selection when an edge is selected
    });
  },

  setPanelVisible: (visible) => {
    set({ panelVisible: visible });
  },

  clearSelection: () => {
    set({ selectedNodeId: null, selectedEdgeId: null });
  },
}));
```

**Design notes:**

- `collapsedCategories` is a `Set<string>` — by default all categories are expanded (empty set). Toggling adds/removes the category ID from the set.
- Selection is mutually exclusive: selecting a node clears edge selection and vice versa. Only one item can be "inspected" in the properties panel at a time.
- The `panelVisible` flag lets users toggle the properties panel on/off (future enhancement). Defaults to `true`.

**Zustand and Set:** Zustand's equality check is reference-based. Creating a `new Set(...)` each time in `toggleCategory` ensures React re-renders. This works correctly but note that `Set` is not JSON-serializable by default — if persistence (e.g., localStorage via Zustand middleware) is added later, the Set must be serialized as an array. For MVP, in-memory state is sufficient.

### 2. Create the PaletteItem Component

Create `src/frontend/src/components/palette/PaletteItem.tsx`:

```typescript
import { memo, type DragEvent } from "react";
import type { CatalogService } from "@architect/shared";

interface PaletteItemProps {
  service: CatalogService;
}

function PaletteItem({ service }: PaletteItemProps) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    // Set the drag data with the service typeId
    event.dataTransfer.setData("application/cf-architect-service", service.typeId);
    event.dataTransfer.setData("text/plain", service.shortName); // Fallback
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent active:cursor-grabbing"
      title={service.officialName}
    >
      <img
        src={`/catalog/icons/${service.iconPath}`}
        alt={`${service.shortName} icon`}
        className="h-5 w-5 flex-shrink-0 object-contain"
        draggable={false}
      />
      <span className="truncate text-sm">{service.shortName}</span>
    </div>
  );
}

export default memo(PaletteItem);
```

**Key details:**

- The MIME type `application/cf-architect-service` is a custom type that carries the `typeId`. The `onDrop` handler in the Editor reads this specific key.
- `text/plain` is set as a fallback for debugging/accessibility.
- `effectAllowed = "move"` signals this is a move operation.
- `draggable={false}` on the `<img>` prevents the browser from trying to drag the image separately.
- The `cursor-grab` / `active:cursor-grabbing` classes provide visual feedback for the drag affordance.

### 3. Create the PaletteCategory Component

Create `src/frontend/src/components/palette/PaletteCategory.tsx`:

```typescript
import { memo, useRef } from "react";
import { ChevronRight } from "lucide-react"; // or use a simple SVG
import type { CatalogService, CatalogCategory } from "@architect/shared";
import { useUIStore } from "../../stores/ui";
import PaletteItem from "./PaletteItem";
import { cn } from "../../lib/utils";

interface PaletteCategoryProps {
  category: CatalogCategory;
  services: CatalogService[];
}

function PaletteCategory({ category, services }: PaletteCategoryProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isCollapsed = useUIStore((s) => s.collapsedCategories.has(category.id));
  const toggleCategory = useUIStore((s) => s.toggleCategory);

  return (
    <div className="mb-1">
      {/* Category header — clickable to toggle */}
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent"
        onClick={() => toggleCategory(category.id)}
        aria-expanded={!isCollapsed}
        aria-controls={`palette-category-${category.id}`}
      >
        {/* Color dot */}
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
          aria-hidden="true"
        />

        {/* Category label */}
        <span className="flex-1 text-left">{category.label}</span>

        {/* Chevron toggle */}
        <ChevronRight
          className={cn(
            "h-4 w-4 flex-shrink-0 transition-transform duration-200",
            !isCollapsed && "rotate-90"
          )}
          aria-hidden="true"
        />
      </button>

      {/* Collapsible service list */}
      <div
        id={`palette-category-${category.id}`}
        ref={contentRef}
        className={cn(
          "overflow-hidden transition-[max-height] duration-200 ease-in-out",
          isCollapsed ? "max-h-0" : "max-h-[2000px]"
        )}
        role="region"
        aria-label={`${category.label} services`}
      >
        <div className="py-1 pl-2">
          {services.map((service) => (
            <PaletteItem key={service.typeId} service={service} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(PaletteCategory);
```

**Animation approach:** The `max-h-0` / `max-h-[2000px]` with `transition-[max-height]` is a simple CSS-only collapse animation. The `2000px` value is a generous upper bound — since `max-height` transitions from `0` to the max value, the actual content height determines the visible result. The transition duration is proportional to the ratio of actual height to max-height, so it won't pause at the top. An alternative is to use `grid-template-rows: 0fr` / `1fr` with CSS grid for a smoother animation, but the max-height approach is simpler and works well for short lists.

**Accessibility:** The `aria-expanded` attribute on the button communicates the collapsed state to screen readers. The `aria-controls` links the button to the collapsible region.

### 4. Create the ServicePalette Component

Create `src/frontend/src/components/palette/ServicePalette.tsx`:

```typescript
import { useMemo } from "react";
import { useCatalog } from "../../api/hooks"; // From ISSUE-11
import type { CatalogService, CatalogCategory } from "@architect/shared";
import PaletteCategory from "./PaletteCategory";

export default function ServicePalette() {
  const { data: catalog, isLoading } = useCatalog();

  // Group services by category
  const groupedServices = useMemo(() => {
    if (!catalog) return [];

    const servicesByCategory = new Map<string, CatalogService[]>();
    for (const service of catalog.services) {
      const existing = servicesByCategory.get(service.category) ?? [];
      existing.push(service);
      servicesByCategory.set(service.category, existing);
    }

    // Return categories in catalog order, with their services
    return catalog.categories
      .filter((cat) => servicesByCategory.has(cat.id))
      .map((cat) => ({
        category: cat,
        services: servicesByCategory.get(cat.id)!,
      }));
  }, [catalog]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <span className="text-sm text-muted-foreground">Loading catalog...</span>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <span className="text-sm text-destructive">Failed to load catalog</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Services</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {groupedServices.map(({ category, services }) => (
          <PaletteCategory
            key={category.id}
            category={category}
            services={services}
          />
        ))}
      </div>
    </div>
  );
}
```

**Design notes:**

- The palette header is a simple "Services" title. Search is deferred (F4-US2 is post-MVP).
- Categories are rendered in catalog order (the order they appear in `services.json` from ISSUE-08).
- Categories with zero services are filtered out (shouldn't happen in practice but defensive).
- The service list is scrollable (`overflow-y-auto`) for catalogs with many services.

### 5. Integrate Drag-and-Drop in Editor.tsx

Update `src/frontend/src/pages/Editor.tsx` to add the palette sidebar and the `onDrop` / `onDragOver` handlers:

```typescript
import { useCallback, type DragEvent } from "react";
import { ulid } from "ulid";
import { useReactFlow } from "@xyflow/react";
import ServicePalette from "../components/palette/ServicePalette";
import { useCatalog } from "../api/hooks";
import { useUIStore } from "../stores/ui";

// Inside EditorCanvas component:
function EditorCanvas() {
  const reactFlowInstance = useReactFlow();
  const { data: catalog } = useCatalog();
  const addNode = useDiagramStore((s) => s.addNode);

  // Handle drag over — allow drop
  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle drop — create a new node at the drop position
  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const typeId = event.dataTransfer.getData("application/cf-architect-service");
      if (!typeId || !catalog) return;

      // Look up the service in the catalog
      const service = catalog.services.find((s) => s.typeId === typeId);
      if (!service) return;

      const category = catalog.categories.find((c) => c.id === service.category);

      // Convert screen coordinates to flow coordinates
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: ulid(),
        type: "cloudflareService",
        position,
        data: {
          label: service.shortName,
          serviceTypeId: typeId,
          iconUrl: `/catalog/icons/${service.iconPath}`,
          categoryColor: category?.color ?? "#6b7280",
        },
        selected: true, // Immediately selectable per F4-US1 AC
      };

      addNode(newNode);
    },
    [catalog, reactFlowInstance, addNode]
  );

  // Wire into ReactFlow:
  return (
    <div className="flex h-full">
      {/* Palette sidebar */}
      <aside className="w-60 flex-shrink-0 border-r bg-background">
        <ServicePalette />
      </aside>

      {/* Canvas area */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          fitView
          deleteKeyCode={null}
          defaultEdgeOptions={{ type: "data-flow" }}
        >
          <MiniMap zoomable pannable />
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
```

**Key implementation details:**

- `reactFlowInstance.screenToFlowPosition()` converts browser viewport coordinates (from `event.clientX/clientY`) to React Flow canvas coordinates, accounting for pan and zoom. This ensures the node is placed exactly where the user drops it.
- The new node has `selected: true` so it's immediately selected after drop (per F4-US1 acceptance criteria).
- The sidebar is 240px wide (`w-60`) with a border separator. It uses the standard background color and is not scrollable separately from the palette content within it.

### 6. Wire Selection Events in Editor.tsx

Add selection event handlers to track the selected node/edge in the `ui` store:

```typescript
const setSelectedNode = useUIStore((s) => s.setSelectedNode);
const setSelectedEdge = useUIStore((s) => s.setSelectedEdge);
const clearSelection = useUIStore((s) => s.clearSelection);

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

// Wire into ReactFlow:
<ReactFlow
  // ... existing props ...
  onNodeClick={handleNodeClick}
  onEdgeClick={handleEdgeClick}
  onPaneClick={handlePaneClick}
/>
```

These selection handlers feed the properties panel (ISSUE-16) with the currently selected item.

### 7. Lucide Icons Dependency

The `PaletteCategory` component uses `ChevronRight` from `lucide-react`. If not already installed (should be from shadcn/ui setup in ISSUE-09):

```bash
npm install lucide-react --workspace=src/frontend
```

If `lucide-react` is not desired, replace with a simple inline SVG chevron.

## Testing

### UI Store Tests

Create `src/frontend/src/stores/__tests__/ui.test.ts`:

1. **toggleCategory adds a category to collapsedCategories**
   - Call `toggleCategory("developer-platform")`. Assert `collapsedCategories` contains `"developer-platform"`.

2. **toggleCategory removes a previously collapsed category**
   - Collapse a category, then toggle again. Assert it's removed from the set.

3. **setSelectedNode sets nodeId and clears edgeId**
   - Set a selected edge first. Call `setSelectedNode("node-1")`. Assert `selectedNodeId` is `"node-1"` and `selectedEdgeId` is `null`.

4. **setSelectedEdge sets edgeId and clears nodeId**
   - Set a selected node first. Call `setSelectedEdge("edge-1")`. Assert `selectedEdgeId` is `"edge-1"` and `selectedNodeId` is `null`.

5. **clearSelection clears both nodeId and edgeId**
   - Set both selections. Call `clearSelection()`. Assert both are `null`.

6. **Default state has all categories expanded**
   - Assert `collapsedCategories` is an empty Set on initial store state.

### PaletteItem Tests

Create `src/frontend/src/components/palette/__tests__/PaletteItem.test.tsx`:

1. **Renders service icon and short name**
   - Render `PaletteItem` with a mock service. Assert the icon `src` contains the `iconPath` and the short name text is displayed.

1. **Sets correct drag data on drag start**
   - Simulate a `dragstart` event on the item. Assert `event.dataTransfer.setData` was called with `"application/cf-architect-service"` and the service's `typeId`.

1. **Item is draggable**
   - Render and assert the root element has `draggable="true"`.

### PaletteCategory Tests

Create `src/frontend/src/components/palette/__tests__/PaletteCategory.test.tsx`:

1. **Renders category label and color dot**
    - Render with a mock category. Assert the label text and a dot element with the correct background color are present.

1. **Shows all services when expanded**
    - Render with category not in `collapsedCategories`. Assert all service items are visible.

1. **Hides services when collapsed**
    - Pre-populate `collapsedCategories` with the category id. Render. Assert the services container has `max-h-0` (or is not visible).

1. **Clicking header toggles collapsed state**
    - Render expanded. Click the header button. Assert the category is now in `collapsedCategories`. Click again, assert it's removed.

### ServicePalette Tests

Create `src/frontend/src/components/palette/__tests__/ServicePalette.test.tsx`:

1. **Renders all categories from catalog**
    - Mock `useCatalog` to return mock catalog data with 3 categories. Assert all 3 category headers are rendered.

1. **Groups services under correct categories**
    - Mock catalog with services in different categories. Assert each category section contains only the services belonging to that category.

1. **Shows loading state**
    - Mock `useCatalog` with `isLoading: true`. Assert loading text is displayed.

### Drop Handler Tests

Create `src/frontend/src/pages/__tests__/EditorDrop.test.ts` (or add to Editor test file):

1. **Dropping a service creates a node at the correct position**
    - Mock `reactFlowInstance.screenToFlowPosition` to return `{ x: 100, y: 200 }`. Simulate a drop event with `dataTransfer.getData` returning a valid `typeId`. Assert `addNode` was called with a node at position `{ x: 100, y: 200 }`.

1. **Dropped node has ULID id and catalog defaults**
    - After a simulated drop, assert the created node has a ULID-format id, `type: "cloudflareService"`, and `data.label` matching the service's `shortName`.

1. **Drop with unknown typeId is ignored**
    - Simulate drop with a `typeId` not in the catalog. Assert `addNode` was NOT called.

1. **Drop with empty transfer data is ignored**
    - Simulate drop with empty `dataTransfer`. Assert `addNode` was NOT called.

### Manual Tests

After deploying locally with `npm start`:

1. Navigate to a diagram editor page.
2. Verify the service palette sidebar is visible on the left.
3. Verify services are grouped by category with colored dot headers.
4. Click a category header — verify the section collapses with an animation.
5. Click again — verify it expands.
6. Drag a service from the palette onto the canvas — verify a new node appears at the drop location with the service's icon and short name as the label.
7. Verify the newly dropped node is selected (has the selection indicator).
8. Drag several different services — verify each gets the correct icon and label.
9. Check that the palette scrolls if there are many services.
