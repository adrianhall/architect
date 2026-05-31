import { fireEvent, render, screen } from "@testing-library/react";
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

	it("updates the store edge type when an edge type button is clicked", async () => {
		const edge = makeEdge({ type: "data-flow" });
		useDiagramStore.setState({ edges: [edge] });

		await renderEdgeProperties(edge);

		const triggerButton = screen.getByText("Trigger").closest("button") as HTMLButtonElement;
		await userEvent.click(triggerButton);

		// Assert on observable side effect: the store's edge type has changed.
		expect(useDiagramStore.getState().edges[0].type).toBe("trigger");
	});

	it("renders the label input with the current edge label", async () => {
		const edge = makeEdge({ data: { label: "HTTP" } });
		await renderEdgeProperties(edge);
		const input = screen.getByLabelText("Label") as HTMLInputElement;
		expect(input.value).toBe("HTTP");
	});

	it("updates the store edge label when the label input changes", async () => {
		const edge = makeEdge();
		useDiagramStore.setState({ edges: [edge] });

		await renderEdgeProperties(edge);

		// fireEvent.change sets the full value in one event — the correct way to
		// test controlled inputs where onChange fires with e.target.value.
		const input = screen.getByLabelText("Label");
		fireEvent.change(input, { target: { value: "HTTPS" } });

		// Assert on observable side effect: the store's edge label has been updated.
		expect(useDiagramStore.getState().edges[0].data?.label).toBe("HTTPS");
	});

	it("renders the protocol input with the current edge protocol", async () => {
		const edge = makeEdge({ data: { protocol: "HTTPS" } });
		await renderEdgeProperties(edge);
		const input = screen.getByLabelText("Protocol") as HTMLInputElement;
		expect(input.value).toBe("HTTPS");
	});

	it("updates the store edge protocol when the protocol input changes", async () => {
		const edge = makeEdge();
		useDiagramStore.setState({ edges: [edge] });

		await renderEdgeProperties(edge);

		const input = screen.getByLabelText("Protocol");
		fireEvent.change(input, { target: { value: "HTTPS" } });

		// Assert on observable side effect: the store's edge protocol has been updated.
		expect(useDiagramStore.getState().edges[0].data?.protocol).toBe("HTTPS");
	});

	it("renders the description textarea with the current edge description", async () => {
		const edge = makeEdge({ data: { description: "Connection between services" } });
		await renderEdgeProperties(edge);
		const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;
		expect(textarea.value).toBe("Connection between services");
	});

	it("updates the store edge description when the description textarea changes", async () => {
		const edge = makeEdge();
		useDiagramStore.setState({ edges: [edge] });

		await renderEdgeProperties(edge);

		const textarea = screen.getByLabelText("Description");
		fireEvent.change(textarea, { target: { value: "My description" } });

		// Assert on observable side effect: the store's edge description has been updated.
		expect(useDiagramStore.getState().edges[0].data?.description).toBe("My description");
	});

	it("rejects label values over 80 characters", async () => {
		const existingLabel = "A".repeat(80);
		const edge = makeEdge({ data: { label: existingLabel } });
		useDiagramStore.setState({ edges: [edge] });

		await renderEdgeProperties(edge);

		const input = screen.getByLabelText("Label");
		// Attempt to set a value that exceeds the 80-char limit.
		fireEvent.change(input, { target: { value: "A".repeat(81) } });

		// Assert on observable side effect: the store's label must not exceed 80 chars.
		// The component guard (value.length <= 80) blocks the update, so the store
		// retains the original 80-char label.
		const storedLabel = useDiagramStore.getState().edges[0].data?.label as string | undefined;
		expect((storedLabel ?? "").length).toBeLessThanOrEqual(80);
	});
});
