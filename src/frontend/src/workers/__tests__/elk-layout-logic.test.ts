/**
 * Unit tests for the ELK layout pure function.
 *
 * Tests call `computeLayout` directly to avoid any Web Worker runtime
 * requirements. jsdom does not support `Worker`, so all worker testing is
 * done through the extracted pure function.
 */
import { describe, expect, it } from "vitest";
import type { LayoutEdge, LayoutNode } from "../elk-layout-logic";
import { computeLayout } from "../elk-layout-logic";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeNode(id: string): LayoutNode {
	return { id, position: { x: 0, y: 0 }, width: 160, height: 100 };
}

function makeEdge(id: string, source: string, target: string): LayoutEdge {
	return { id, source, target };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeLayout", () => {
	it("computes valid positions for a simple A → B → C graph", async () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const edges = [makeEdge("e1", "a", "b"), makeEdge("e2", "b", "c")];

		const positions = await computeLayout(nodes, edges, "TB");

		// All three nodes must have positions.
		expect(positions).toHaveLength(3);

		for (const pos of positions) {
			expect(typeof pos.position.x).toBe("number");
			expect(typeof pos.position.y).toBe("number");
			expect(Number.isNaN(pos.position.x)).toBe(false);
			expect(Number.isNaN(pos.position.y)).toBe(false);
		}

		// All positions must be distinct (no two nodes should overlap exactly).
		const posStrings = positions.map((p) => `${p.position.x},${p.position.y}`);
		const unique = new Set(posStrings);
		expect(unique.size).toBe(3);
	});

	it("TB direction places the source above the target", async () => {
		const nodes = [makeNode("src"), makeNode("tgt")];
		const edges = [makeEdge("e", "src", "tgt")];

		const positions = await computeLayout(nodes, edges, "TB");
		expect(positions).toHaveLength(2);

		const srcPos = positions.find((p) => p.nodeId === "src");
		const tgtPos = positions.find((p) => p.nodeId === "tgt");
		if (!srcPos || !tgtPos) throw new Error("Expected both nodes to have positions");

		// In a top-to-bottom layout the source node is above the target node.
		expect(srcPos.position.y).toBeLessThan(tgtPos.position.y);
	});

	it("LR direction places the source to the left of the target", async () => {
		const nodes = [makeNode("src"), makeNode("tgt")];
		const edges = [makeEdge("e", "src", "tgt")];

		const positions = await computeLayout(nodes, edges, "LR");
		expect(positions).toHaveLength(2);

		const srcPos = positions.find((p) => p.nodeId === "src");
		const tgtPos = positions.find((p) => p.nodeId === "tgt");
		if (!srcPos || !tgtPos) throw new Error("Expected both nodes to have positions");

		// In a left-to-right layout the source node is to the left of the target.
		expect(srcPos.position.x).toBeLessThan(tgtPos.position.x);
	});

	it("returns an empty array for an empty graph", async () => {
		const positions = await computeLayout([], [], "TB");
		expect(positions).toEqual([]);
	});

	it("returns a valid position for a single node with no edges", async () => {
		const nodes = [makeNode("solo")];
		const positions = await computeLayout(nodes, [], "TB");

		expect(positions).toHaveLength(1);
		expect(positions[0].nodeId).toBe("solo");
		expect(typeof positions[0].position.x).toBe("number");
		expect(typeof positions[0].position.y).toBe("number");
	});

	it("positions all nodes even when they are disconnected", async () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		// No edges — the three nodes are completely disconnected.
		const positions = await computeLayout(nodes, [], "TB");

		expect(positions).toHaveLength(3);

		// Positions must not overlap.
		const posStrings = positions.map((p) => `${p.position.x},${p.position.y}`);
		const unique = new Set(posStrings);
		expect(unique.size).toBe(3);
	});

	it("throws (or ELK rejects) when an edge references a non-existent node", async () => {
		// ELK should throw when sources/targets reference unknown node IDs.
		const nodes = [makeNode("a")];
		const edges = [makeEdge("e", "a", "does-not-exist")];

		await expect(computeLayout(nodes, edges, "TB")).rejects.toThrow();
	});
});
