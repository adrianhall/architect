import type { CatalogData } from "@architect/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "@/stores/diagram";
import { createQueryWrapper } from "@/test/query-wrapper";

// ── Mock useCatalog ────────────────────────────────────────────────────────────

vi.mock("@/api", () => ({
	useCatalog: vi.fn(),
}));

import { useCatalog } from "@/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Minimal catalog data for tests. */
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
		{
			typeId: "d1",
			officialName: "Cloudflare D1",
			shortName: "D1",
			category: "developer-platform",
			iconPath: "d1.svg",
			docUrl: "",
		},
	],
	edgeTypes: [],
};

/** Creates a minimal React Flow Node for NodeProperties tests. */
function makeNode(overrides: Partial<Node> = {}): Node {
	return {
		id: "node-1",
		type: "cloudflareService",
		position: { x: 0, y: 0 },
		data: {
			label: "Workers",
			serviceTypeId: "workers",
			categoryColor: "#2563eb",
		},
		...overrides,
	};
}

/** Renders NodeProperties with all required providers. */
async function renderNodeProperties(node: Node) {
	// Lazily import after vi.mock is hoisted.
	const { default: NodeProperties } = await import("../NodeProperties");
	const { Wrapper } = createQueryWrapper();
	return render(
		<Wrapper>
			<NodeProperties node={node} />
		</Wrapper>,
	);
}

/** Helper to reset diagram store state before each test. */
function resetStore() {
	useDiagramStore.setState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("NodeProperties", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetStore();
		vi.mocked(useCatalog).mockReturnValue({
			data: mockCatalog,
			isLoading: false,
		} as unknown as ReturnType<typeof useCatalog>);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetStore();
	});

	it("renders the official service name from the catalog", async () => {
		const node = makeNode();
		await renderNodeProperties(node);
		expect(screen.getByText("Cloudflare Workers")).toBeInTheDocument();
	});

	it("falls back to serviceTypeId when the service is not found in catalog", async () => {
		const node = makeNode({ data: { label: "Unknown", serviceTypeId: "unknown-service" } });
		await renderNodeProperties(node);
		expect(screen.getByText("unknown-service")).toBeInTheDocument();
	});

	it("renders the label input with the current node label", async () => {
		const node = makeNode({ data: { label: "My Worker", serviceTypeId: "workers" } });
		await renderNodeProperties(node);
		const input = screen.getByLabelText("Label") as HTMLInputElement;
		expect(input.value).toBe("My Worker");
	});

	it("calls updateNodeData with the new label on input change", async () => {
		const node = makeNode();
		useDiagramStore.setState({ nodes: [node] });
		const updateNodeData = vi.spyOn(useDiagramStore.getState(), "updateNodeData");

		await renderNodeProperties(node);

		const input = screen.getByLabelText("Label");
		await userEvent.clear(input);
		await userEvent.type(input, "My Workers");

		expect(updateNodeData).toHaveBeenCalledWith("node-1", { label: expect.any(String) });
	});

	it("rejects label values over 80 characters (does not call updateNodeData)", async () => {
		const existingLabel = "A".repeat(80);
		const node = makeNode({ data: { label: existingLabel, serviceTypeId: "workers" } });
		useDiagramStore.setState({ nodes: [node] });
		const updateNodeData = vi.spyOn(useDiagramStore.getState(), "updateNodeData");

		await renderNodeProperties(node);

		const input = screen.getByLabelText("Label") as HTMLInputElement;
		// Type one more character beyond the limit — it should be rejected.
		await userEvent.type(input, "Z");

		// updateNodeData should not have been called because the value would exceed 80 chars.
		expect(updateNodeData).not.toHaveBeenCalledWith("node-1", { label: "A".repeat(81) });
	});

	it("renders the description textarea with the current node description", async () => {
		const node = makeNode({
			data: { label: "Workers", serviceTypeId: "workers", description: "My desc" },
		});
		await renderNodeProperties(node);
		const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;
		expect(textarea.value).toBe("My desc");
	});

	it("calls updateNodeData with the new description on textarea change", async () => {
		const node = makeNode();
		useDiagramStore.setState({ nodes: [node] });
		const updateNodeData = vi.spyOn(useDiagramStore.getState(), "updateNodeData");

		await renderNodeProperties(node);

		const textarea = screen.getByLabelText("Description");
		await userEvent.type(textarea, "Hello");

		expect(updateNodeData).toHaveBeenCalledWith("node-1", { description: expect.any(String) });
	});

	it("rejects description values over 500 characters", async () => {
		const existingDesc = "A".repeat(500);
		const node = makeNode({
			data: { label: "Workers", serviceTypeId: "workers", description: existingDesc },
		});
		useDiagramStore.setState({ nodes: [node] });
		const updateNodeData = vi.spyOn(useDiagramStore.getState(), "updateNodeData");

		await renderNodeProperties(node);

		const textarea = screen.getByLabelText("Description");
		await userEvent.type(textarea, "Z");

		// Should not have been called with a description exceeding 500 chars.
		expect(updateNodeData).not.toHaveBeenCalledWith("node-1", { description: "A".repeat(501) });
	});

	it("shows the category default color when no accentColor override is set", async () => {
		const node = makeNode({ data: { label: "Workers", serviceTypeId: "workers" } });
		await renderNodeProperties(node);
		const colorInput = screen.getByLabelText("Accent Color") as HTMLInputElement;
		// Category default is "#2563eb" from mockCatalog.
		expect(colorInput.value).toBe("#2563eb");
	});

	it("shows the accent color override when accentColor is set", async () => {
		const node = makeNode({
			data: { label: "Workers", serviceTypeId: "workers", accentColor: "#ff0000" },
		});
		await renderNodeProperties(node);
		const colorInput = screen.getByLabelText("Accent Color") as HTMLInputElement;
		expect(colorInput.value).toBe("#ff0000");
	});

	it("hides the reset button when no accentColor override is set", async () => {
		const node = makeNode({ data: { label: "Workers", serviceTypeId: "workers" } });
		await renderNodeProperties(node);
		expect(screen.queryByTitle("Reset to category default")).not.toBeInTheDocument();
	});

	it("shows the reset button when an accentColor override is set", async () => {
		const node = makeNode({
			data: { label: "Workers", serviceTypeId: "workers", accentColor: "#ff0000" },
		});
		await renderNodeProperties(node);
		expect(screen.getByTitle("Reset to category default")).toBeInTheDocument();
	});

	it("calls updateNodeData with accentColor: undefined when reset button is clicked", async () => {
		const node = makeNode({
			data: { label: "Workers", serviceTypeId: "workers", accentColor: "#ff0000" },
		});
		useDiagramStore.setState({ nodes: [node] });
		const updateNodeData = vi.spyOn(useDiagramStore.getState(), "updateNodeData");

		await renderNodeProperties(node);

		const resetBtn = screen.getByTitle("Reset to category default");
		await userEvent.click(resetBtn);

		expect(updateNodeData).toHaveBeenCalledWith("node-1", { accentColor: undefined });
	});

	it("renders the documentation link button when the service has a docUrl", async () => {
		const node = makeNode();
		await renderNodeProperties(node);
		expect(screen.getByRole("button", { name: /documentation/i })).toBeInTheDocument();
	});

	it("does not render the documentation link button when the service has no docUrl", async () => {
		// d1 service has an empty docUrl string.
		const node = makeNode({ data: { label: "D1", serviceTypeId: "d1" } });
		await renderNodeProperties(node);
		expect(screen.queryByRole("button", { name: /documentation/i })).not.toBeInTheDocument();
	});

	it("opens the docUrl in a new tab when the documentation button is clicked", async () => {
		const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
		const node = makeNode();
		await renderNodeProperties(node);

		const docsBtn = screen.getByRole("button", { name: /documentation/i });
		await userEvent.click(docsBtn);

		expect(openSpy).toHaveBeenCalledWith("https://developers.cloudflare.com/workers/", "_blank", "noopener,noreferrer");
	});
});
