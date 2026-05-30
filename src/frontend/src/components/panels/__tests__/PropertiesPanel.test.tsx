import type { CatalogData } from "@architect/shared";
import { render, screen } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "@/stores/diagram";
import { useUIStore } from "@/stores/ui";
import { createQueryWrapper } from "@/test/query-wrapper";

// ── Mock useCatalog ────────────────────────────────────────────────────────────

vi.mock("@/api", () => ({
	useCatalog: vi.fn(),
}));

import { useCatalog } from "@/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Minimal catalog for tests involving NodeProperties sub-render. */
const mockCatalog: CatalogData = {
	categories: [{ id: "developer-platform", label: "Developer Platform", color: "#2563eb" }],
	services: [
		{
			typeId: "workers",
			officialName: "Cloudflare Workers",
			shortName: "Workers",
			category: "developer-platform",
			iconPath: "workers.svg",
			docUrl: "https://developers.cloudflare.com/workers/",
		},
	],
	edgeTypes: [],
};

/** A minimal node for PropertiesPanel tests. */
const testNode: Node = {
	id: "node-1",
	type: "cloudflareService",
	position: { x: 0, y: 0 },
	data: { label: "Workers", serviceTypeId: "workers" },
};

/** A minimal edge for PropertiesPanel tests. */
const testEdge: Edge = {
	id: "edge-1",
	source: "n1",
	target: "n2",
	type: "data-flow",
	data: {},
};

/** Helper to reset both stores to a clean state. */
function resetStores() {
	useDiagramStore.setState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
	useUIStore.setState({
		selectedNodeId: null,
		selectedEdgeId: null,
		collapsedCategories: new Set(),
		panelVisible: true,
	});
}

/** Renders PropertiesPanel with all required providers. */
async function renderPropertiesPanel() {
	const { default: PropertiesPanel } = await import("../PropertiesPanel");
	const { Wrapper } = createQueryWrapper();
	return render(
		<Wrapper>
			<PropertiesPanel />
		</Wrapper>,
	);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PropertiesPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetStores();
		vi.mocked(useCatalog).mockReturnValue({
			data: mockCatalog,
			isLoading: false,
		} as unknown as ReturnType<typeof useCatalog>);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetStores();
	});

	it("shows the 'no selection' hint when nothing is selected", async () => {
		// Both selectedNodeId and selectedEdgeId remain null (initial state).
		await renderPropertiesPanel();
		expect(screen.getByText(/select a node or edge/i)).toBeInTheDocument();
	});

	it("renders the 'Node Properties' header and node fields when a node is selected", async () => {
		// Seed the store with the node and select it.
		useDiagramStore.setState({ nodes: [testNode] });
		useUIStore.setState({ selectedNodeId: "node-1", selectedEdgeId: null });

		await renderPropertiesPanel();

		expect(screen.getByRole("heading", { name: "Node Properties" })).toBeInTheDocument();
		// Label input is part of NodeProperties.
		expect(screen.getByLabelText("Label")).toBeInTheDocument();
	});

	it("renders the 'Edge Properties' header and edge fields when an edge is selected", async () => {
		useDiagramStore.setState({ edges: [testEdge] });
		useUIStore.setState({ selectedNodeId: null, selectedEdgeId: "edge-1" });

		await renderPropertiesPanel();

		expect(screen.getByRole("heading", { name: "Edge Properties" })).toBeInTheDocument();
		// Edge type buttons are part of EdgeProperties.
		expect(screen.getByText("Data Flow")).toBeInTheDocument();
	});

	it("shows the hint when the selected node no longer exists in the diagram", async () => {
		// Select a node ID that doesn't exist in the store.
		useUIStore.setState({ selectedNodeId: "nonexistent-node", selectedEdgeId: null });

		await renderPropertiesPanel();

		expect(screen.getByText(/select a node or edge/i)).toBeInTheDocument();
	});

	it("switches from node panel to edge panel when selection changes", async () => {
		useDiagramStore.setState({ nodes: [testNode], edges: [testEdge] });

		// Start with a node selected.
		useUIStore.setState({ selectedNodeId: "node-1", selectedEdgeId: null });

		const { rerender } = await renderPropertiesPanel();

		expect(screen.getByRole("heading", { name: "Node Properties" })).toBeInTheDocument();

		// Switch selection to an edge.
		useUIStore.setState({ selectedNodeId: null, selectedEdgeId: "edge-1" });

		// Re-render with the same component; React re-renders because the store changed.
		const { default: PropertiesPanel } = await import("../PropertiesPanel");
		const { Wrapper } = createQueryWrapper();
		rerender(
			<Wrapper>
				<PropertiesPanel />
			</Wrapper>,
		);

		expect(screen.getByRole("heading", { name: "Edge Properties" })).toBeInTheDocument();
	});
});
