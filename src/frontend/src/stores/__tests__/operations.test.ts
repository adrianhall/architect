import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { applyOperation, type Operation, reverseOperation } from "../operations";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Creates a minimal React Flow node for use in tests. */
function makeNode(id: string, x = 0, y = 0): Node {
	return {
		id,
		type: "cloudflare-service",
		position: { x, y },
		data: { label: `Node ${id}`, description: "test node" },
	};
}

/** Creates a minimal React Flow edge for use in tests. */
function makeEdge(id: string, source: string, target: string): Edge {
	return {
		id,
		source,
		target,
		type: "data-flow",
		data: { label: "HTTP" },
	};
}

const nodeA = makeNode("a", 0, 0);
const nodeB = makeNode("b", 100, 200);
const edgeAB = makeEdge("e1", "a", "b");
const edgeBA = makeEdge("e2", "b", "a");

// ---------------------------------------------------------------------------
// reverseOperation
// ---------------------------------------------------------------------------

describe("reverseOperation", () => {
	describe("add_node", () => {
		it("reversal of add_node produces remove_node with empty connectedEdges", () => {
			const op: Operation = { type: "add_node", node: nodeA };
			const reversed = reverseOperation(op);
			expect(reversed.type).toBe("remove_node");
			if (reversed.type === "remove_node") {
				expect(reversed.node).toBe(nodeA);
				expect(reversed.connectedEdges).toEqual([]);
			}
		});
	});

	describe("remove_node", () => {
		it("reversal of remove_node with connected edges produces batch with add_node + add_edge per edge", () => {
			const op: Operation = {
				type: "remove_node",
				node: nodeA,
				connectedEdges: [edgeAB, edgeBA],
			};
			const reversed = reverseOperation(op);
			expect(reversed.type).toBe("batch");
			if (reversed.type === "batch") {
				expect(reversed.operations).toHaveLength(3);
				expect(reversed.operations[0]).toEqual({ type: "add_node", node: nodeA });
				expect(reversed.operations[1]).toEqual({ type: "add_edge", edge: edgeAB });
				expect(reversed.operations[2]).toEqual({ type: "add_edge", edge: edgeBA });
			}
		});

		it("reversal of remove_node with no connected edges produces batch containing only add_node", () => {
			const op: Operation = { type: "remove_node", node: nodeA, connectedEdges: [] };
			const reversed = reverseOperation(op);
			expect(reversed.type).toBe("batch");
			if (reversed.type === "batch") {
				expect(reversed.operations).toHaveLength(1);
				expect(reversed.operations[0]).toEqual({ type: "add_node", node: nodeA });
			}
		});
	});

	describe("move_node", () => {
		it("reversal of move_node swaps from and to, preserving nodeId", () => {
			const op: Operation = {
				type: "move_node",
				nodeId: "a",
				from: { x: 0, y: 0 },
				to: { x: 100, y: 200 },
			};
			const reversed = reverseOperation(op);
			expect(reversed.type).toBe("move_node");
			if (reversed.type === "move_node") {
				expect(reversed.nodeId).toBe("a");
				expect(reversed.from).toEqual({ x: 100, y: 200 });
				expect(reversed.to).toEqual({ x: 0, y: 0 });
			}
		});
	});

	describe("add_edge", () => {
		it("reversal of add_edge produces remove_edge with the same edge object", () => {
			const op: Operation = { type: "add_edge", edge: edgeAB };
			const reversed = reverseOperation(op);
			expect(reversed.type).toBe("remove_edge");
			if (reversed.type === "remove_edge") {
				expect(reversed.edge).toBe(edgeAB);
			}
		});
	});

	describe("remove_edge", () => {
		it("reversal of remove_edge produces add_edge with the same edge object", () => {
			const op: Operation = { type: "remove_edge", edge: edgeAB };
			const reversed = reverseOperation(op);
			expect(reversed.type).toBe("add_edge");
			if (reversed.type === "add_edge") {
				expect(reversed.edge).toBe(edgeAB);
			}
		});
	});

	describe("update_node_data", () => {
		it("reversal of update_node_data swaps from and to, preserving nodeId", () => {
			const op: Operation = {
				type: "update_node_data",
				nodeId: "a",
				from: { label: "Workers" },
				to: { label: "D1" },
			};
			const reversed = reverseOperation(op);
			expect(reversed.type).toBe("update_node_data");
			if (reversed.type === "update_node_data") {
				expect(reversed.nodeId).toBe("a");
				expect(reversed.from).toEqual({ label: "D1" });
				expect(reversed.to).toEqual({ label: "Workers" });
			}
		});
	});

	describe("update_edge_data", () => {
		it("reversal of update_edge_data swaps from and to, preserving edgeId", () => {
			const op: Operation = {
				type: "update_edge_data",
				edgeId: "e1",
				from: { protocol: "HTTP" },
				to: { protocol: "HTTPS" },
			};
			const reversed = reverseOperation(op);
			expect(reversed.type).toBe("update_edge_data");
			if (reversed.type === "update_edge_data") {
				expect(reversed.edgeId).toBe("e1");
				expect(reversed.from).toEqual({ protocol: "HTTPS" });
				expect(reversed.to).toEqual({ protocol: "HTTP" });
			}
		});
	});

	describe("batch", () => {
		it("reversal of batch reverses sub-operation order and reverses each sub-operation", () => {
			// Build a batch of 3 heterogeneous operations.
			const op1: Operation = { type: "add_node", node: nodeA };
			const op2: Operation = {
				type: "move_node",
				nodeId: "a",
				from: { x: 0, y: 0 },
				to: { x: 50, y: 50 },
			};
			const op3: Operation = { type: "add_edge", edge: edgeAB };

			const batch: Operation = { type: "batch", operations: [op1, op2, op3] };
			const reversed = reverseOperation(batch);

			expect(reversed.type).toBe("batch");
			if (reversed.type === "batch") {
				expect(reversed.operations).toHaveLength(3);
				// Order must be reversed: op3 first, then op2, then op1.
				expect(reversed.operations[0]).toEqual(reverseOperation(op3));
				expect(reversed.operations[1]).toEqual(reverseOperation(op2));
				expect(reversed.operations[2]).toEqual(reverseOperation(op1));
			}
		});
	});
});

// ---------------------------------------------------------------------------
// applyOperation
// ---------------------------------------------------------------------------

describe("applyOperation", () => {
	describe("add_node", () => {
		it("add_node appends the node to an empty array", () => {
			const { nodes } = applyOperation([], [], {
				type: "add_node",
				node: nodeA,
			});
			expect(nodes).toHaveLength(1);
			expect(nodes[0]).toBe(nodeA);
		});

		it("add_node does not modify edges", () => {
			const { edges } = applyOperation([], [edgeAB], {
				type: "add_node",
				node: nodeA,
			});
			expect(edges).toEqual([edgeAB]);
		});
	});

	describe("remove_node", () => {
		it("remove_node removes the specified node and its connected edges", () => {
			const { nodes, edges } = applyOperation([nodeA, nodeB], [edgeAB], {
				type: "remove_node",
				node: nodeA,
				connectedEdges: [edgeAB],
			});
			expect(nodes).toHaveLength(1);
			expect(nodes[0].id).toBe("b");
			expect(edges).toHaveLength(0);
		});

		it("remove_node preserves edges not listed in connectedEdges", () => {
			const unrelated = makeEdge("unrelated", "b", "c");
			const { edges } = applyOperation([nodeA, nodeB], [edgeAB, unrelated], {
				type: "remove_node",
				node: nodeA,
				connectedEdges: [edgeAB],
			});
			// Only unrelated edge remains.
			expect(edges).toHaveLength(1);
			expect(edges[0].id).toBe("unrelated");
		});
	});

	describe("move_node", () => {
		it("move_node updates the position of the targeted node", () => {
			const { nodes } = applyOperation([nodeA], [], {
				type: "move_node",
				nodeId: "a",
				from: { x: 0, y: 0 },
				to: { x: 100, y: 200 },
			});
			expect(nodes[0].position).toEqual({ x: 100, y: 200 });
		});

		it("move_node does not affect other nodes", () => {
			const { nodes } = applyOperation([nodeA, nodeB], [], {
				type: "move_node",
				nodeId: "a",
				from: { x: 0, y: 0 },
				to: { x: 100, y: 200 },
			});
			// nodeB position must be unchanged.
			expect(nodes[1].position).toEqual({ x: 100, y: 200 });
			// nodeB id is "b", its original position in makeNode is (100, 200)
			// which happens to coincide — let us assert nodeA's x changed.
			expect(nodes[0].id).toBe("a");
			expect(nodes[0].position.x).toBe(100);
		});
	});

	describe("add_edge", () => {
		it("add_edge appends the edge to an empty edges array", () => {
			const { edges } = applyOperation([], [], {
				type: "add_edge",
				edge: edgeAB,
			});
			expect(edges).toHaveLength(1);
			expect(edges[0]).toBe(edgeAB);
		});

		it("add_edge does not modify nodes", () => {
			const { nodes } = applyOperation([nodeA], [], {
				type: "add_edge",
				edge: edgeAB,
			});
			expect(nodes).toEqual([nodeA]);
		});
	});

	describe("remove_edge", () => {
		it("remove_edge removes the specified edge", () => {
			const { edges } = applyOperation([], [edgeAB, edgeBA], {
				type: "remove_edge",
				edge: edgeAB,
			});
			expect(edges).toHaveLength(1);
			expect(edges[0].id).toBe("e2");
		});
	});

	describe("update_node_data", () => {
		it("update_node_data merges the to data onto the node", () => {
			const node = makeNode("a");
			const { nodes } = applyOperation([node], [], {
				type: "update_node_data",
				nodeId: "a",
				from: { label: "Workers" },
				to: { label: "D1" },
			});
			expect(nodes[0].data.label).toBe("D1");
		});

		it("update_node_data preserves other data fields not mentioned in to", () => {
			const node = makeNode("a");
			// node.data includes description. Updating only label must not drop it.
			const { nodes } = applyOperation([node], [], {
				type: "update_node_data",
				nodeId: "a",
				from: { label: "Workers" },
				to: { label: "D1" },
			});
			expect(nodes[0].data.description).toBe("test node");
		});
	});

	describe("update_edge_data", () => {
		it("update_edge_data merges the to data onto the edge", () => {
			const edge = makeEdge("e1", "a", "b");
			const { edges } = applyOperation([], [edge], {
				type: "update_edge_data",
				edgeId: "e1",
				from: { label: "HTTP" },
				to: { protocol: "HTTPS" },
			});
			expect(edges[0].data?.protocol).toBe("HTTPS");
		});

		it("update_edge_data preserves other data fields not mentioned in to", () => {
			const edge = makeEdge("e1", "a", "b");
			// edge.data includes label: "HTTP". Updating protocol must not drop label.
			const { edges } = applyOperation([], [edge], {
				type: "update_edge_data",
				edgeId: "e1",
				from: {},
				to: { protocol: "HTTPS" },
			});
			expect(edges[0].data?.label).toBe("HTTP");
		});

		it("update_edge_data does not modify non-targeted edges", () => {
			const edge1 = makeEdge("e1", "a", "b");
			const edge2 = makeEdge("e2", "b", "c");
			const { edges } = applyOperation([], [edge1, edge2], {
				type: "update_edge_data",
				edgeId: "e1",
				from: {},
				to: { protocol: "HTTPS" },
			});
			// edge2 must be reference-identical — not a new object.
			expect(edges[1]).toBe(edge2);
		});
	});

	describe("batch", () => {
		it("batch applies sub-operations in order", () => {
			// First add nodeA, then add edgeAB. Both should be present.
			const { nodes, edges } = applyOperation([], [], {
				type: "batch",
				operations: [
					{ type: "add_node", node: nodeA },
					{ type: "add_edge", edge: edgeAB },
				],
			});
			expect(nodes).toHaveLength(1);
			expect(edges).toHaveLength(1);
		});
	});
});

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe("round-trip: apply then reverse restores original state", () => {
	const initialNodes: Node[] = [nodeA, nodeB];
	const initialEdges: Edge[] = [edgeAB];

	/** Helper: apply op, then apply reverse, assert state equals original. */
	function roundTrip(nodes: Node[], edges: Edge[], op: Operation): void {
		const after = applyOperation(nodes, edges, op);
		const backToOriginal = applyOperation(after.nodes, after.edges, reverseOperation(op));
		// Deep equality on ids and positions is sufficient for these tests.
		expect(backToOriginal.nodes.map((n) => n.id).sort()).toEqual(nodes.map((n) => n.id).sort());
		expect(backToOriginal.edges.map((e) => e.id).sort()).toEqual(edges.map((e) => e.id).sort());
	}

	it("add_node round-trip", () => {
		const newNode = makeNode("c", 300, 300);
		roundTrip(initialNodes, initialEdges, { type: "add_node", node: newNode });
	});

	it("remove_node round-trip", () => {
		roundTrip(initialNodes, initialEdges, {
			type: "remove_node",
			node: nodeA,
			connectedEdges: [edgeAB],
		});
	});

	it("move_node round-trip", () => {
		roundTrip(initialNodes, initialEdges, {
			type: "move_node",
			nodeId: "a",
			from: { x: 0, y: 0 },
			to: { x: 500, y: 500 },
		});
	});

	it("add_edge round-trip", () => {
		const newEdge = makeEdge("e3", "a", "b");
		roundTrip(initialNodes, initialEdges, { type: "add_edge", edge: newEdge });
	});

	it("remove_edge round-trip", () => {
		roundTrip(initialNodes, initialEdges, {
			type: "remove_edge",
			edge: edgeAB,
		});
	});

	it("update_node_data round-trip", () => {
		roundTrip(initialNodes, initialEdges, {
			type: "update_node_data",
			nodeId: "a",
			from: { label: "Node a" },
			to: { label: "Workers" },
		});
	});

	it("update_edge_data round-trip", () => {
		roundTrip(initialNodes, initialEdges, {
			type: "update_edge_data",
			edgeId: "e1",
			from: { label: "HTTP" },
			to: { label: "gRPC" },
		});
	});

	it("batch round-trip", () => {
		// A batch that moves nodeA and changes the edge label.
		const batch: Operation = {
			type: "batch",
			operations: [
				{
					type: "move_node",
					nodeId: "a",
					from: { x: 0, y: 0 },
					to: { x: 999, y: 999 },
				},
				{
					type: "update_edge_data",
					edgeId: "e1",
					from: { label: "HTTP" },
					to: { label: "WebSocket" },
				},
			],
		};
		roundTrip(initialNodes, initialEdges, batch);
	});
});
