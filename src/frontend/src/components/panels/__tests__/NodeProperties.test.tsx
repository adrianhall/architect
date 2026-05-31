import type { CatalogData } from "@architect/shared";
import { fireEvent, render, screen } from "@testing-library/react";
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

	it("updates the store node label when the label input changes", async () => {
		const node = makeNode();
		useDiagramStore.setState({ nodes: [node] });

		await renderNodeProperties(node);

		// fireEvent.change sets the full value in one event — the correct way to
		// test controlled inputs where onChange fires with e.target.value.
		const input = screen.getByLabelText("Label");
		fireEvent.change(input, { target: { value: "My Workers" } });

		// Assert on observable side effect: the store's node label has been updated.
		expect(useDiagramStore.getState().nodes[0].data.label).toBe("My Workers");
	});

	it("rejects label values over 80 characters (store label does not exceed 80 chars)", async () => {
		const existingLabel = "A".repeat(80);
		const node = makeNode({ data: { label: existingLabel, serviceTypeId: "workers" } });
		useDiagramStore.setState({ nodes: [node] });

		await renderNodeProperties(node);

		const input = screen.getByLabelText("Label") as HTMLInputElement;
		// Attempt to set a value that exceeds the 80-char limit.
		fireEvent.change(input, { target: { value: "A".repeat(81) } });

		// Assert on observable side effect: the store's label must not exceed 80 chars.
		// The component guard (value.length <= 80) blocks the update, so the store
		// retains the original 80-char label.
		const storedLabel = useDiagramStore.getState().nodes[0].data.label as string | undefined;
		expect((storedLabel ?? "").length).toBeLessThanOrEqual(80);
	});

	it("renders the description textarea with the current node description", async () => {
		const node = makeNode({
			data: { label: "Workers", serviceTypeId: "workers", description: "My desc" },
		});
		await renderNodeProperties(node);
		const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;
		expect(textarea.value).toBe("My desc");
	});

	it("updates the store node description when the description textarea changes", async () => {
		const node = makeNode();
		useDiagramStore.setState({ nodes: [node] });

		await renderNodeProperties(node);

		const textarea = screen.getByLabelText("Description");
		fireEvent.change(textarea, { target: { value: "Hello" } });

		// Assert on observable side effect: the store's node description has been updated.
		expect(useDiagramStore.getState().nodes[0].data.description).toBe("Hello");
	});

	it("rejects description values over 500 characters", async () => {
		const existingDesc = "A".repeat(500);
		const node = makeNode({
			data: { label: "Workers", serviceTypeId: "workers", description: existingDesc },
		});
		useDiagramStore.setState({ nodes: [node] });

		await renderNodeProperties(node);

		const textarea = screen.getByLabelText("Description");
		// Attempt to set a value that exceeds the 500-char limit.
		fireEvent.change(textarea, { target: { value: "A".repeat(501) } });

		// Assert on observable side effect: the store's description must not exceed 500 chars.
		const storedDesc = useDiagramStore.getState().nodes[0].data.description as string | undefined;
		expect((storedDesc ?? "").length).toBeLessThanOrEqual(500);
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

	it("clears the accentColor in the store when the reset button is clicked", async () => {
		const node = makeNode({
			data: { label: "Workers", serviceTypeId: "workers", accentColor: "#ff0000" },
		});
		useDiagramStore.setState({ nodes: [node] });

		await renderNodeProperties(node);

		const resetBtn = screen.getByTitle("Reset to category default");
		await userEvent.click(resetBtn);

		// Assert on observable side effect: accentColor is cleared in the store.
		expect(useDiagramStore.getState().nodes[0].data.accentColor).toBeUndefined();
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
