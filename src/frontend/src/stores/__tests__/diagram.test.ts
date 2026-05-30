import type { Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "../diagram";

/** Helper: reset the diagram store to its initial empty state between tests. */
function resetStore() {
	useDiagramStore.setState({
		nodes: [],
		edges: [],
		viewport: { x: 0, y: 0, zoom: 1 },
	});
}

/** Creates a minimal React Flow Node for use in tests. */
function makeNode(id: string, overrides: Partial<Node> = {}): Node {
	return {
		id,
		type: "cloudflareService",
		position: { x: 0, y: 0 },
		data: { label: `Node ${id}` },
		...overrides,
	};
}

/** Creates a minimal React Flow Edge for use in tests. */
function makeEdge(id: string, source: string, target: string, overrides: Partial<Edge> = {}): Edge {
	return {
		id,
		source,
		target,
		type: "data-flow",
		data: {},
		...overrides,
	};
}

describe("useDiagramStore", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	// ── addNode ────────────────────────────────────────────────────────────────

	describe("addNode", () => {
		it("adds a node to the store", () => {
			const node = makeNode("n1");
			useDiagramStore.getState().addNode(node);
			expect(useDiagramStore.getState().nodes).toHaveLength(1);
			expect(useDiagramStore.getState().nodes[0]).toEqual(node);
		});

		it("appends nodes sequentially", () => {
			const n1 = makeNode("n1");
			const n2 = makeNode("n2");
			useDiagramStore.getState().addNode(n1);
			useDiagramStore.getState().addNode(n2);
			expect(useDiagramStore.getState().nodes).toHaveLength(2);
			expect(useDiagramStore.getState().nodes[1].id).toBe("n2");
		});
	});

	// ── removeNodes ────────────────────────────────────────────────────────────

	describe("removeNodes", () => {
		it("removes nodes by id, leaving others intact", () => {
			const n1 = makeNode("n1");
			const n2 = makeNode("n2");
			useDiagramStore.getState().addNode(n1);
			useDiagramStore.getState().addNode(n2);

			useDiagramStore.getState().removeNodes(["n1"]);

			const { nodes } = useDiagramStore.getState();
			expect(nodes).toHaveLength(1);
			expect(nodes[0].id).toBe("n2");
		});

		it("also removes edges connected to the removed node", () => {
			const n1 = makeNode("n1");
			const n2 = makeNode("n2");
			const edge = makeEdge("e1", "n1", "n2");
			useDiagramStore.setState({ nodes: [n1, n2], edges: [edge] });

			useDiagramStore.getState().removeNodes(["n1"]);

			expect(useDiagramStore.getState().nodes).toHaveLength(1);
			expect(useDiagramStore.getState().edges).toHaveLength(0);
		});

		it("removes edges where the node is the target", () => {
			const n1 = makeNode("n1");
			const n2 = makeNode("n2");
			const edge = makeEdge("e1", "n1", "n2");
			useDiagramStore.setState({ nodes: [n1, n2], edges: [edge] });

			useDiagramStore.getState().removeNodes(["n2"]);

			expect(useDiagramStore.getState().edges).toHaveLength(0);
		});

		it("is a no-op when the id does not exist", () => {
			useDiagramStore.getState().addNode(makeNode("n1"));
			useDiagramStore.getState().removeNodes(["does-not-exist"]);
			expect(useDiagramStore.getState().nodes).toHaveLength(1);
		});
	});

	// ── removeEdges ────────────────────────────────────────────────────────────

	describe("removeEdges", () => {
		it("removes edges by id, leaving nodes intact", () => {
			const n1 = makeNode("n1");
			const n2 = makeNode("n2");
			const edge = makeEdge("e1", "n1", "n2");
			useDiagramStore.setState({ nodes: [n1, n2], edges: [edge] });

			useDiagramStore.getState().removeEdges(["e1"]);

			expect(useDiagramStore.getState().edges).toHaveLength(0);
			expect(useDiagramStore.getState().nodes).toHaveLength(2);
		});

		it("leaves unrelated edges intact", () => {
			const n1 = makeNode("n1");
			const n2 = makeNode("n2");
			const n3 = makeNode("n3");
			const e1 = makeEdge("e1", "n1", "n2");
			const e2 = makeEdge("e2", "n2", "n3");
			useDiagramStore.setState({ nodes: [n1, n2, n3], edges: [e1, e2] });

			useDiagramStore.getState().removeEdges(["e1"]);

			expect(useDiagramStore.getState().edges).toHaveLength(1);
			expect(useDiagramStore.getState().edges[0].id).toBe("e2");
		});
	});

	// ── setDiagram ─────────────────────────────────────────────────────────────

	describe("setDiagram", () => {
		it("replaces all nodes and edges", () => {
			// Pre-populate with old data.
			useDiagramStore.setState({ nodes: [makeNode("old")], edges: [makeEdge("oe1", "a", "b")] });

			const newNodes = [makeNode("n1"), makeNode("n2")];
			const newEdges = [makeEdge("e1", "n1", "n2")];
			useDiagramStore.getState().setDiagram(newNodes, newEdges);

			expect(useDiagramStore.getState().nodes).toHaveLength(2);
			expect(useDiagramStore.getState().edges).toHaveLength(1);
			expect(useDiagramStore.getState().nodes[0].id).toBe("n1");
		});

		it("sets the provided viewport", () => {
			const viewport = { x: 100, y: 200, zoom: 1.5 };
			useDiagramStore.getState().setDiagram([], [], viewport);
			expect(useDiagramStore.getState().viewport).toEqual(viewport);
		});

		it("uses the default viewport when none is provided", () => {
			useDiagramStore.getState().setDiagram([], []);
			expect(useDiagramStore.getState().viewport).toEqual({ x: 0, y: 0, zoom: 1 });
		});

		it("uses the default viewport when undefined is passed explicitly", () => {
			useDiagramStore.getState().setDiagram([], [], undefined);
			expect(useDiagramStore.getState().viewport).toEqual({ x: 0, y: 0, zoom: 1 });
		});
	});

	// ── onNodesChange ──────────────────────────────────────────────────────────

	describe("onNodesChange", () => {
		it("applies position changes from React Flow", () => {
			const node = makeNode("n1", { position: { x: 0, y: 0 } });
			useDiagramStore.setState({ nodes: [node] });

			const change: NodeChange = {
				type: "position",
				id: "n1",
				position: { x: 100, y: 200 },
			};
			useDiagramStore.getState().onNodesChange([change]);

			expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 100, y: 200 });
		});

		it("applies selection changes from React Flow", () => {
			const node = makeNode("n1", { selected: false });
			useDiagramStore.setState({ nodes: [node] });

			const change: NodeChange = {
				type: "select",
				id: "n1",
				selected: true,
			};
			useDiagramStore.getState().onNodesChange([change]);

			expect(useDiagramStore.getState().nodes[0].selected).toBe(true);
		});
	});

	// ── onEdgesChange ──────────────────────────────────────────────────────────

	describe("onEdgesChange", () => {
		it("applies selection changes from React Flow", () => {
			const n1 = makeNode("n1");
			const n2 = makeNode("n2");
			const edge = makeEdge("e1", "n1", "n2", { selected: false });
			useDiagramStore.setState({ nodes: [n1, n2], edges: [edge] });

			const change: EdgeChange = {
				type: "select",
				id: "e1",
				selected: true,
			};
			useDiagramStore.getState().onEdgesChange([change]);

			expect(useDiagramStore.getState().edges[0].selected).toBe(true);
		});
	});
});
