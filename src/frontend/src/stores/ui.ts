import { create } from "zustand";

/**
 * Shape of the UI Zustand store.
 *
 * Tracks ephemeral UI state for the architecture editor: which palette
 * categories are collapsed, which canvas element is selected, and whether
 * the properties panel is visible. This state is intentionally kept separate
 * from the diagram store (which owns canvas graph data) so that UI preferences
 * can be reset or persisted independently.
 *
 * Selection is mutually exclusive: selecting a node clears edge selection, and
 * vice versa, because only one item can be inspected in the properties panel at
 * a time.
 *
 * **Serialisation note:** `collapsedCategories` is a `Set<string>`. Zustand's
 * default equality check is reference-based, so `toggleCategory` always creates
 * a `new Set(...)` to trigger re-renders. If localStorage persistence is added
 * in a future issue, the Set must be serialised as an array.
 */
interface UIState {
	/** Set of category IDs that are currently collapsed in the service palette. */
	collapsedCategories: Set<string>;

	/**
	 * ID of the currently selected node, or `null` when no node is selected.
	 *
	 * Cleared automatically when an edge is selected.
	 */
	selectedNodeId: string | null;

	/**
	 * ID of the currently selected edge, or `null` when no edge is selected.
	 *
	 * Cleared automatically when a node is selected.
	 */
	selectedEdgeId: string | null;

	/**
	 * Whether the properties panel (ISSUE-16) is visible.
	 *
	 * Defaults to `true`. Users can toggle it off to reclaim canvas space.
	 */
	panelVisible: boolean;

	/**
	 * Toggles a category's collapsed state.
	 *
	 * If the category is currently expanded (not in `collapsedCategories`), it
	 * is added to the set. If it is already collapsed, it is removed. A new
	 * `Set` instance is always created so React detects the reference change
	 * and re-renders subscribers.
	 *
	 * @param categoryId - The `id` of the catalog category to toggle.
	 */
	toggleCategory: (categoryId: string) => void;

	/**
	 * Sets the selected node and clears any edge selection.
	 *
	 * Pass `null` to deselect without selecting a new node.
	 *
	 * @param nodeId - The `id` of the node to select, or `null` to clear.
	 */
	setSelectedNode: (nodeId: string | null) => void;

	/**
	 * Sets the selected edge and clears any node selection.
	 *
	 * Pass `null` to deselect without selecting a new edge.
	 *
	 * @param edgeId - The `id` of the edge to select, or `null` to clear.
	 */
	setSelectedEdge: (edgeId: string | null) => void;

	/**
	 * Sets the visibility of the properties panel.
	 *
	 * @param visible - `true` to show the panel, `false` to hide it.
	 */
	setPanelVisible: (visible: boolean) => void;

	/**
	 * Clears both node and edge selection simultaneously.
	 *
	 * Used when the user clicks on empty canvas space to deselect everything.
	 */
	clearSelection: () => void;
}

/**
 * Zustand store for editor UI state.
 *
 * Provides palette collapse state, canvas selection tracking, and panel
 * visibility. Import selectors with fine-grained subscriptions so components
 * only re-render when the specific slice they care about changes.
 *
 * @example
 * ```tsx
 * const isCollapsed = useUIStore((s) => s.collapsedCategories.has(categoryId));
 * const toggleCategory = useUIStore((s) => s.toggleCategory);
 * ```
 */
export const useUIStore = create<UIState>((set, get) => ({
	// Developer Platform is open by default; the three secondary categories
	// start collapsed so the palette doesn't overwhelm new users.
	collapsedCategories: new Set(["zero-trust", "cdn-application", "other"]),
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
		// Clear edge selection when a node is selected — only one item at a time.
		set({ selectedNodeId: nodeId, selectedEdgeId: null });
	},

	setSelectedEdge: (edgeId) => {
		// Clear node selection when an edge is selected — only one item at a time.
		set({ selectedEdgeId: edgeId, selectedNodeId: null });
	},

	setPanelVisible: (visible) => {
		set({ panelVisible: visible });
	},

	clearSelection: () => {
		set({ selectedNodeId: null, selectedEdgeId: null });
	},
}));
