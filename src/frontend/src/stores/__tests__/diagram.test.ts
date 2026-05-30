import type { Connection, Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
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

/** ULID pattern: 26 characters, Crockford Base32 alphabet. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

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

	// ── addEdge ────────────────────────────────────────────────────────────────

	describe("addEdge", () => {
		it("adds an edge to the store", () => {
			const edge = makeEdge("e1", "n1", "n2");
			useDiagramStore.getState().addEdge(edge);
			expect(useDiagramStore.getState().edges).toHaveLength(1);
			expect(useDiagramStore.getState().edges[0]).toEqual(edge);
		});

		it("appends edges sequentially", () => {
			const e1 = makeEdge("e1", "n1", "n2");
			const e2 = makeEdge("e2", "n2", "n3");
			useDiagramStore.getState().addEdge(e1);
			useDiagramStore.getState().addEdge(e2);
			expect(useDiagramStore.getState().edges).toHaveLength(2);
			expect(useDiagramStore.getState().edges[1].id).toBe("e2");
		});
	});

	// ── updateEdge ─────────────────────────────────────────────────────────────

	describe("updateEdge", () => {
		it("merges updates onto the existing edge", () => {
			const edge = makeEdge("e1", "n1", "n2", { type: "data-flow" });
			useDiagramStore.setState({ edges: [edge] });

			useDiagramStore.getState().updateEdge("e1", { type: "binding" });

			const updated = useDiagramStore.getState().edges[0];
			expect(updated.type).toBe("binding");
			// Other fields remain unchanged.
			expect(updated.source).toBe("n1");
			expect(updated.target).toBe("n2");
		});

		it("merges data updates onto the existing edge data", () => {
			const edge = makeEdge("e1", "n1", "n2");
			useDiagramStore.setState({ edges: [edge] });

			useDiagramStore.getState().updateEdge("e1", { data: { label: "HTTP" } });

			const updated = useDiagramStore.getState().edges[0];
			expect(updated.data).toEqual({ label: "HTTP" });
		});

		it("is a no-op when the edgeId does not exist", () => {
			const edge = makeEdge("e1", "n1", "n2");
			useDiagramStore.setState({ edges: [edge] });

			useDiagramStore.getState().updateEdge("nonexistent", { type: "binding" });

			// The existing edge is unchanged.
			expect(useDiagramStore.getState().edges).toHaveLength(1);
			expect(useDiagramStore.getState().edges[0].type).toBe("data-flow");
		});

		it("leaves other edges unchanged when updating one edge", () => {
			const e1 = makeEdge("e1", "n1", "n2", { type: "data-flow" });
			const e2 = makeEdge("e2", "n2", "n3", { type: "trigger" });
			useDiagramStore.setState({ edges: [e1, e2] });

			useDiagramStore.getState().updateEdge("e1", { type: "binding" });

			expect(useDiagramStore.getState().edges[0].type).toBe("binding");
			expect(useDiagramStore.getState().edges[1].type).toBe("trigger");
		});
	});

	// ── updateNodeData ─────────────────────────────────────────────────────────

	describe("updateNodeData", () => {
		it("merges data updates onto the existing node, preserving other fields", () => {
			const node = makeNode("n1", {
				data: { label: "Workers", serviceTypeId: "workers" },
			});
			useDiagramStore.setState({ nodes: [node] });

			useDiagramStore.getState().updateNodeData("n1", { label: "My Worker" });

			const updated = useDiagramStore.getState().nodes[0];
			// Label is updated.
			expect(updated.data.label).toBe("My Worker");
			// Other data fields are preserved.
			expect(updated.data.serviceTypeId).toBe("workers");
		});

		it("can set a new data field without affecting existing fields", () => {
			const node = makeNode("n1", { data: { label: "Workers" } });
			useDiagramStore.setState({ nodes: [node] });

			useDiagramStore.getState().updateNodeData("n1", { description: "My description" });

			const updated = useDiagramStore.getState().nodes[0];
			expect(updated.data.label).toBe("Workers");
			expect(updated.data.description).toBe("My description");
		});

		it("can clear a data field by setting it to undefined", () => {
			const node = makeNode("n1", {
				data: { label: "Workers", accentColor: "#ff0000" },
			});
			useDiagramStore.setState({ nodes: [node] });

			useDiagramStore.getState().updateNodeData("n1", { accentColor: undefined });

			const updated = useDiagramStore.getState().nodes[0];
			// accentColor is explicitly set to undefined (key present, value undefined).
			expect(Object.keys(updated.data)).toContain("accentColor");
			expect(updated.data.accentColor).toBeUndefined();
			// label is unaffected.
			expect(updated.data.label).toBe("Workers");
		});

		it("is a no-op when the nodeId does not exist", () => {
			const node = makeNode("n1", { data: { label: "Workers" } });
			useDiagramStore.setState({ nodes: [node] });

			useDiagramStore.getState().updateNodeData("nonexistent", { label: "test" });

			// The existing node is unchanged.
			expect(useDiagramStore.getState().nodes).toHaveLength(1);
			expect(useDiagramStore.getState().nodes[0].data.label).toBe("Workers");
		});

		it("leaves other nodes unchanged when updating one node", () => {
			const n1 = makeNode("n1", { data: { label: "Workers" } });
			const n2 = makeNode("n2", { data: { label: "Pages" } });
			useDiagramStore.setState({ nodes: [n1, n2] });

			useDiagramStore.getState().updateNodeData("n1", { label: "My Worker" });

			expect(useDiagramStore.getState().nodes[0].data.label).toBe("My Worker");
			expect(useDiagramStore.getState().nodes[1].data.label).toBe("Pages");
		});
	});

	// ── updateEdgeData ─────────────────────────────────────────────────────────

	describe("updateEdgeData", () => {
		it("merges data updates onto the existing edge, preserving other data fields", () => {
			const edge = makeEdge("e1", "n1", "n2", { data: { label: "HTTP" } });
			useDiagramStore.setState({ edges: [edge] });

			useDiagramStore.getState().updateEdgeData("e1", { protocol: "HTTPS" });

			const updated = useDiagramStore.getState().edges[0];
			// Protocol was added.
			expect(updated.data?.protocol).toBe("HTTPS");
			// Label is preserved.
			expect(updated.data?.label).toBe("HTTP");
		});

		it("does not change the top-level edge type", () => {
			const edge = makeEdge("e1", "n1", "n2", { type: "data-flow" });
			useDiagramStore.setState({ edges: [edge] });

			// Passing type inside dataUpdates should NOT change the top-level type.
			// updateEdgeData only touches edge.data, not edge.type.
			useDiagramStore.getState().updateEdgeData("e1", { label: "test" });

			const updated = useDiagramStore.getState().edges[0];
			expect(updated.type).toBe("data-flow");
		});

		it("is a no-op when the edgeId does not exist", () => {
			const edge = makeEdge("e1", "n1", "n2", { data: { label: "HTTP" } });
			useDiagramStore.setState({ edges: [edge] });

			useDiagramStore.getState().updateEdgeData("nonexistent", { label: "test" });

			// The existing edge is unchanged.
			expect(useDiagramStore.getState().edges).toHaveLength(1);
			expect(useDiagramStore.getState().edges[0].data?.label).toBe("HTTP");
		});

		it("leaves other edges unchanged when updating one edge", () => {
			const e1 = makeEdge("e1", "n1", "n2", { data: { label: "HTTP" } });
			const e2 = makeEdge("e2", "n2", "n3", { data: { label: "gRPC" } });
			useDiagramStore.setState({ edges: [e1, e2] });

			useDiagramStore.getState().updateEdgeData("e1", { protocol: "HTTPS" });

			expect(useDiagramStore.getState().edges[0].data?.protocol).toBe("HTTPS");
			expect(useDiagramStore.getState().edges[1].data?.label).toBe("gRPC");
			expect(useDiagramStore.getState().edges[1].data?.protocol).toBeUndefined();
		});
	});

	// ── onConnect ──────────────────────────────────────────────────────────────

	describe("onConnect", () => {
		it("creates a data-flow edge between two different nodes", () => {
			const conn: Connection = {
				source: "a",
				target: "b",
				sourceHandle: "bottom",
				targetHandle: "top",
			};
			useDiagramStore.getState().onConnect(conn);

			const { edges } = useDiagramStore.getState();
			expect(edges).toHaveLength(1);
			expect(edges[0].source).toBe("a");
			expect(edges[0].target).toBe("b");
			expect(edges[0].type).toBe("data-flow");
		});

		it("assigns the correct source and target handles", () => {
			const conn: Connection = {
				source: "a",
				target: "b",
				sourceHandle: "bottom",
				targetHandle: "top",
			};
			useDiagramStore.getState().onConnect(conn);

			const edge = useDiagramStore.getState().edges[0];
			expect(edge.sourceHandle).toBe("bottom");
			expect(edge.targetHandle).toBe("top");
		});

		it("generates a ULID id for new edges", () => {
			const conn: Connection = { source: "a", target: "b", sourceHandle: null, targetHandle: null };
			useDiagramStore.getState().onConnect(conn);

			const edge = useDiagramStore.getState().edges[0];
			expect(edge.id).toMatch(ULID_PATTERN);
		});

		it("generates unique ULID ids for each new edge", () => {
			const conn1: Connection = { source: "a", target: "b", sourceHandle: null, targetHandle: null };
			const conn2: Connection = { source: "b", target: "c", sourceHandle: null, targetHandle: null };
			useDiagramStore.getState().onConnect(conn1);
			useDiagramStore.getState().onConnect(conn2);

			const { edges } = useDiagramStore.getState();
			expect(edges).toHaveLength(2);
			expect(edges[0].id).not.toBe(edges[1].id);
			expect(edges[0].id).toMatch(ULID_PATTERN);
			expect(edges[1].id).toMatch(ULID_PATTERN);
		});

		it("silently rejects self-loop connections (source === target)", () => {
			const conn: Connection = {
				source: "a",
				target: "a",
				sourceHandle: null,
				targetHandle: null,
			};
			useDiagramStore.getState().onConnect(conn);

			expect(useDiagramStore.getState().edges).toHaveLength(0);
		});

		it("does not add any edge when source is null", () => {
			const conn = {
				source: null,
				target: "b",
				sourceHandle: null,
				targetHandle: null,
			} as unknown as Connection;
			useDiagramStore.getState().onConnect(conn);

			expect(useDiagramStore.getState().edges).toHaveLength(0);
		});

		it("does not add any edge when target is null", () => {
			const conn = {
				source: "a",
				target: null,
				sourceHandle: null,
				targetHandle: null,
			} as unknown as Connection;
			useDiagramStore.getState().onConnect(conn);

			expect(useDiagramStore.getState().edges).toHaveLength(0);
		});

		it("handles null sourceHandle and targetHandle gracefully", () => {
			const conn: Connection = { source: "a", target: "b", sourceHandle: null, targetHandle: null };
			useDiagramStore.getState().onConnect(conn);

			const edge = useDiagramStore.getState().edges[0];
			// null handles should be stored as undefined (consistent with Edge type).
			expect(edge.sourceHandle).toBeUndefined();
			expect(edge.targetHandle).toBeUndefined();
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
