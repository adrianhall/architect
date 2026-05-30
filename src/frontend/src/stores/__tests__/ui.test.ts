import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "../ui";

/** Resets the UI store to its initial empty state between tests. */
function resetStore() {
	useUIStore.setState({
		collapsedCategories: new Set(),
		selectedNodeId: null,
		selectedEdgeId: null,
		panelVisible: true,
	});
}

describe("useUIStore", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	// ── Initial state ──────────────────────────────────────────────────────────

	describe("initial state", () => {
		it("has all categories expanded by default (empty collapsedCategories set)", () => {
			const { collapsedCategories } = useUIStore.getState();
			expect(collapsedCategories.size).toBe(0);
		});

		it("has no selected node by default", () => {
			expect(useUIStore.getState().selectedNodeId).toBeNull();
		});

		it("has no selected edge by default", () => {
			expect(useUIStore.getState().selectedEdgeId).toBeNull();
		});

		it("has the properties panel visible by default", () => {
			expect(useUIStore.getState().panelVisible).toBe(true);
		});
	});

	// ── toggleCategory ─────────────────────────────────────────────────────────

	describe("toggleCategory", () => {
		it("adds a category to collapsedCategories when toggled from expanded", () => {
			useUIStore.getState().toggleCategory("developer-platform");
			expect(useUIStore.getState().collapsedCategories.has("developer-platform")).toBe(true);
		});

		it("removes a category from collapsedCategories when toggled from collapsed", () => {
			// First collapse the category.
			useUIStore.getState().toggleCategory("developer-platform");
			expect(useUIStore.getState().collapsedCategories.has("developer-platform")).toBe(true);

			// Toggle again — should expand (remove from set).
			useUIStore.getState().toggleCategory("developer-platform");
			expect(useUIStore.getState().collapsedCategories.has("developer-platform")).toBe(false);
		});

		it("creates a new Set reference on each toggle (ensures React re-renders)", () => {
			const before = useUIStore.getState().collapsedCategories;
			useUIStore.getState().toggleCategory("storage");
			const after = useUIStore.getState().collapsedCategories;
			expect(after).not.toBe(before);
		});

		it("toggles multiple categories independently", () => {
			useUIStore.getState().toggleCategory("ai");
			useUIStore.getState().toggleCategory("networking");

			const { collapsedCategories } = useUIStore.getState();
			expect(collapsedCategories.has("ai")).toBe(true);
			expect(collapsedCategories.has("networking")).toBe(true);
			expect(collapsedCategories.has("storage")).toBe(false);
		});
	});

	// ── setSelectedNode ────────────────────────────────────────────────────────

	describe("setSelectedNode", () => {
		it("sets selectedNodeId and clears selectedEdgeId", () => {
			// Set an edge selection first.
			useUIStore.getState().setSelectedEdge("edge-1");
			expect(useUIStore.getState().selectedEdgeId).toBe("edge-1");

			// Select a node — edge selection must be cleared.
			useUIStore.getState().setSelectedNode("node-1");
			expect(useUIStore.getState().selectedNodeId).toBe("node-1");
			expect(useUIStore.getState().selectedEdgeId).toBeNull();
		});

		it("accepts null to clear node selection without selecting another", () => {
			useUIStore.getState().setSelectedNode("node-1");
			useUIStore.getState().setSelectedNode(null);
			expect(useUIStore.getState().selectedNodeId).toBeNull();
		});
	});

	// ── setSelectedEdge ────────────────────────────────────────────────────────

	describe("setSelectedEdge", () => {
		it("sets selectedEdgeId and clears selectedNodeId", () => {
			// Set a node selection first.
			useUIStore.getState().setSelectedNode("node-1");
			expect(useUIStore.getState().selectedNodeId).toBe("node-1");

			// Select an edge — node selection must be cleared.
			useUIStore.getState().setSelectedEdge("edge-1");
			expect(useUIStore.getState().selectedEdgeId).toBe("edge-1");
			expect(useUIStore.getState().selectedNodeId).toBeNull();
		});

		it("accepts null to clear edge selection without selecting another", () => {
			useUIStore.getState().setSelectedEdge("edge-1");
			useUIStore.getState().setSelectedEdge(null);
			expect(useUIStore.getState().selectedEdgeId).toBeNull();
		});
	});

	// ── clearSelection ─────────────────────────────────────────────────────────

	describe("clearSelection", () => {
		it("clears both selectedNodeId and selectedEdgeId", () => {
			// Seed both selections via direct state injection.
			useUIStore.setState({ selectedNodeId: "node-1", selectedEdgeId: "edge-1" });

			useUIStore.getState().clearSelection();

			expect(useUIStore.getState().selectedNodeId).toBeNull();
			expect(useUIStore.getState().selectedEdgeId).toBeNull();
		});

		it("is safe to call when nothing is selected", () => {
			expect(() => useUIStore.getState().clearSelection()).not.toThrow();
			expect(useUIStore.getState().selectedNodeId).toBeNull();
			expect(useUIStore.getState().selectedEdgeId).toBeNull();
		});
	});

	// ── setPanelVisible ────────────────────────────────────────────────────────

	describe("setPanelVisible", () => {
		it("sets panelVisible to false", () => {
			useUIStore.getState().setPanelVisible(false);
			expect(useUIStore.getState().panelVisible).toBe(false);
		});

		it("sets panelVisible back to true", () => {
			useUIStore.setState({ panelVisible: false });
			useUIStore.getState().setPanelVisible(true);
			expect(useUIStore.getState().panelVisible).toBe(true);
		});
	});
});
