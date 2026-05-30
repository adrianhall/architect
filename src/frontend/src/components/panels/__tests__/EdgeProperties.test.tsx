import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Edge } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "@/stores/diagram";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Creates a minimal React Flow Edge for EdgeProperties tests. */
function makeEdge(overrides: Partial<Edge> = {}): Edge {
	return {
		id: "edge-1",
		source: "n1",
		target: "n2",
		type: "data-flow",
		data: {},
		...overrides,
	};
}

/** Helper to reset diagram store state between tests. */
function resetStore() {
	useDiagramStore.setState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
}

/** Renders EdgeProperties without any providers (no external dependencies). */
async function renderEdgeProperties(edge: Edge) {
	const { default: EdgeProperties } = await import("../EdgeProperties");
	return render(<EdgeProperties edge={edge} />);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("EdgeProperties", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetStore();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetStore();
	});

	it("renders all 4 edge type options", async () => {
		const edge = makeEdge();
		await renderEdgeProperties(edge);
		expect(screen.getByText("Data Flow")).toBeInTheDocument();
		expect(screen.getByText("Binding")).toBeInTheDocument();
		expect(screen.getByText("Trigger")).toBeInTheDocument();
		expect(screen.getByText("Dependency")).toBeInTheDocument();
	});

	it("highlights the currently selected edge type", async () => {
		const edge = makeEdge({ type: "binding" });
		await renderEdgeProperties(edge);

		// The binding button should have the border-primary class (selected state).
		// Find all type-selector buttons — the "Binding" one should have selected styling.
		const bindingButton = screen.getByText("Binding").closest("button") as HTMLButtonElement;
		expect(bindingButton.className).toMatch(/border-primary/);

		// Other type buttons should NOT have the selected styling.
		const dataFlowButton = screen.getByText("Data Flow").closest("button") as HTMLButtonElement;
		expect(dataFlowButton.className).not.toMatch(/border-primary/);
	});

	it("calls updateEdge with the selected type when an edge type button is clicked", async () => {
		const edge = makeEdge({ type: "data-flow" });
		useDiagramStore.setState({ edges: [edge] });
		const updateEdge = vi.spyOn(useDiagramStore.getState(), "updateEdge");

		await renderEdgeProperties(edge);

		const triggerButton = screen.getByText("Trigger").closest("button") as HTMLButtonElement;
		await userEvent.click(triggerButton);

		expect(updateEdge).toHaveBeenCalledWith("edge-1", { type: "trigger" });
	});

	it("renders the label input with the current edge label", async () => {
		const edge = makeEdge({ data: { label: "HTTP" } });
		await renderEdgeProperties(edge);
		const input = screen.getByLabelText("Label") as HTMLInputElement;
		expect(input.value).toBe("HTTP");
	});

	it("calls updateEdgeData with the new label on label input change", async () => {
		const edge = makeEdge();
		useDiagramStore.setState({ edges: [edge] });
		const updateEdgeData = vi.spyOn(useDiagramStore.getState(), "updateEdgeData");

		await renderEdgeProperties(edge);

		const input = screen.getByLabelText("Label");
		await userEvent.type(input, "HTTPS");

		expect(updateEdgeData).toHaveBeenCalledWith("edge-1", { label: expect.any(String) });
	});

	it("renders the protocol input with the current edge protocol", async () => {
		const edge = makeEdge({ data: { protocol: "HTTPS" } });
		await renderEdgeProperties(edge);
		const input = screen.getByLabelText("Protocol") as HTMLInputElement;
		expect(input.value).toBe("HTTPS");
	});

	it("calls updateEdgeData with the new protocol on protocol input change", async () => {
		const edge = makeEdge();
		useDiagramStore.setState({ edges: [edge] });
		const updateEdgeData = vi.spyOn(useDiagramStore.getState(), "updateEdgeData");

		await renderEdgeProperties(edge);

		const input = screen.getByLabelText("Protocol");
		await userEvent.type(input, "HTTPS");

		expect(updateEdgeData).toHaveBeenCalledWith("edge-1", { protocol: expect.any(String) });
	});

	it("renders the description textarea with the current edge description", async () => {
		const edge = makeEdge({ data: { description: "Connection between services" } });
		await renderEdgeProperties(edge);
		const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;
		expect(textarea.value).toBe("Connection between services");
	});

	it("calls updateEdgeData with the new description on description textarea change", async () => {
		const edge = makeEdge();
		useDiagramStore.setState({ edges: [edge] });
		const updateEdgeData = vi.spyOn(useDiagramStore.getState(), "updateEdgeData");

		await renderEdgeProperties(edge);

		const textarea = screen.getByLabelText("Description");
		await userEvent.type(textarea, "My description");

		expect(updateEdgeData).toHaveBeenCalledWith("edge-1", { description: expect.any(String) });
	});

	it("rejects label values over 80 characters", async () => {
		const existingLabel = "A".repeat(80);
		const edge = makeEdge({ data: { label: existingLabel } });
		useDiagramStore.setState({ edges: [edge] });
		const updateEdgeData = vi.spyOn(useDiagramStore.getState(), "updateEdgeData");

		await renderEdgeProperties(edge);

		const input = screen.getByLabelText("Label") as HTMLInputElement;
		await userEvent.type(input, "Z");

		// Should not have been called with a label exceeding 80 chars.
		expect(updateEdgeData).not.toHaveBeenCalledWith("edge-1", {
			label: "A".repeat(81),
		});
	});
});
