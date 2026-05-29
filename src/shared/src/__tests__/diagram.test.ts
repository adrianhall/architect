import { describe, expect, it } from "vitest";
import type { DiagramEdge, DiagramNode, EdgeType, GraphData, Viewport } from "../diagram.js";

describe("shared diagram types", () => {
	it("should allow constructing a valid GraphData object", () => {
		const viewport: Viewport = { x: 0, y: 0, zoom: 1 };

		const node: DiagramNode = {
			id: "node-1",
			type: "workers",
			position: { x: 100, y: 200 },
			data: { label: "My Worker" },
		};

		const edge: DiagramEdge = {
			id: "edge-1",
			source: "node-1",
			target: "node-2",
			type: "data-flow",
		};

		const graph: GraphData = {
			nodes: [node],
			edges: [edge],
			viewport,
		};

		expect(graph.nodes).toHaveLength(1);
		expect(graph.edges).toHaveLength(1);
		expect(graph.viewport).toEqual(viewport);
	});

	it("should support all edge types", () => {
		const types: EdgeType[] = ["data-flow", "binding", "trigger", "dependency"];
		expect(types).toHaveLength(4);
	});

	it("should allow optional edge data fields", () => {
		const edge: DiagramEdge = {
			id: "edge-1",
			source: "node-1",
			target: "node-2",
			type: "binding",
			data: {
				label: "KV binding",
				protocol: "binding",
				description: "Connects to KV namespace",
			},
		};

		expect(edge.data?.label).toBe("KV binding");
	});

	it("should allow optional node data fields", () => {
		const node: DiagramNode = {
			id: "node-1",
			type: "d1",
			position: { x: 0, y: 0 },
			data: {
				label: "Main DB",
				description: "Primary D1 database",
				accentColor: "#FF6633",
			},
		};

		expect(node.data.description).toBe("Primary D1 database");
		expect(node.data.accentColor).toBe("#FF6633");
	});

	it("should allow GraphData without a viewport", () => {
		const graph: GraphData = {
			nodes: [],
			edges: [],
		};
		expect(graph.viewport).toBeUndefined();
	});
});
