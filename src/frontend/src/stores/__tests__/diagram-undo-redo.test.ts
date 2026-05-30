import type { Connection, Edge, Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "../diagram";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Resets the diagram store to its initial empty state between tests. */
function resetStore() {
	useDiagramStore.setState({
		nodes: [],
		edges: [],
		viewport: { x: 0, y: 0, zoom: 1 },
		undoStack: [],
		redoStack: [],
		maxUndoSteps: 50,
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

// ─── Stack Behavior Tests ─────────────────────────────────────────────────────

describe("undo/redo — stack behavior", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	it("undo reverses the last action and moves it to the redo stack", () => {
		const node = makeNode("n1");
		useDiagramStore.getState().addNode(node);

		useDiagramStore.getState().undo();

		const { nodes, undoStack, redoStack } = useDiagramStore.getState();
		expect(nodes).toHaveLength(0);
		expect(undoStack).toHaveLength(0);
		expect(redoStack).toHaveLength(1);
	});

	it("redo re-applies the last undone action and moves it back to the undo stack", () => {
		const node = makeNode("n1");
		useDiagramStore.getState().addNode(node);
		useDiagramStore.getState().undo();

		useDiagramStore.getState().redo();

		const { nodes, undoStack, redoStack } = useDiagramStore.getState();
		expect(nodes).toHaveLength(1);
		expect(nodes[0].id).toBe("n1");
		expect(undoStack).toHaveLength(1);
		expect(redoStack).toHaveLength(0);
	});

	it("new action clears the redo stack", () => {
		const nodeA = makeNode("nA");
		const nodeB = makeNode("nB");

		useDiagramStore.getState().addNode(nodeA);
		useDiagramStore.getState().undo();

		// A new action should clear the redo stack.
		useDiagramStore.getState().addNode(nodeB);

		const { nodes, redoStack, undoStack } = useDiagramStore.getState();
		// Only node B should exist; node A is gone.
		expect(nodes).toHaveLength(1);
		expect(nodes[0].id).toBe("nB");
		// Redo stack cleared; undo stack has the addNode(B) operation.
		expect(redoStack).toHaveLength(0);
		expect(undoStack).toHaveLength(1);
	});

	it("caps the undo stack at maxUndoSteps, discarding the oldest entries", () => {
		// Set a lower cap so we can test without 50+ operations.
		useDiagramStore.setState({ maxUndoSteps: 50 });

		// Push 55 operations.
		for (let i = 0; i < 55; i++) {
			useDiagramStore.getState().addNode(makeNode(`n${i}`));
		}

		const { undoStack } = useDiagramStore.getState();
		expect(undoStack).toHaveLength(50);
	});

	it("the 5 oldest operations are discarded when the cap is exceeded (55 ops, cap 50)", () => {
		useDiagramStore.setState({ maxUndoSteps: 50 });

		// Push 55 nodes; the first 5 should be unrecoverable.
		for (let i = 0; i < 55; i++) {
			useDiagramStore.getState().addNode(makeNode(`n${i}`));
		}

		// Undo 50 times — should bring us back to having only nodes n0..n4 (the 5 oldest).
		for (let i = 0; i < 50; i++) {
			useDiagramStore.getState().undo();
		}

		// Only n0..n4 remain (5 nodes); we cannot undo further because those 5
		// operations were dropped when the stack was capped.
		expect(useDiagramStore.getState().nodes).toHaveLength(5);
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
	});

	it("canUndo is false initially, true after an action, false after undo", () => {
		expect(useDiagramStore.getState().canUndo()).toBe(false);

		useDiagramStore.getState().addNode(makeNode("n1"));
		expect(useDiagramStore.getState().canUndo()).toBe(true);

		useDiagramStore.getState().undo();
		expect(useDiagramStore.getState().canUndo()).toBe(false);
	});

	it("canRedo is false initially, true after undo, false after redo", () => {
		expect(useDiagramStore.getState().canRedo()).toBe(false);

		useDiagramStore.getState().addNode(makeNode("n1"));
		useDiagramStore.getState().undo();
		expect(useDiagramStore.getState().canRedo()).toBe(true);

		useDiagramStore.getState().redo();
		expect(useDiagramStore.getState().canRedo()).toBe(false);
	});

	it("undo on an empty stack is a no-op — no error, state unchanged", () => {
		useDiagramStore.getState().addNode(makeNode("n1"));
		useDiagramStore.getState().undo(); // pops the only entry

		// Stack is now empty — calling undo again should be safe.
		expect(() => {
			useDiagramStore.getState().undo();
		}).not.toThrow();

		// State is unchanged from after the first undo.
		expect(useDiagramStore.getState().nodes).toHaveLength(0);
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
	});

	it("redo on an empty stack is a no-op — no error, state unchanged", () => {
		// No actions performed — redo stack is empty.
		expect(() => {
			useDiagramStore.getState().redo();
		}).not.toThrow();

		expect(useDiagramStore.getState().nodes).toHaveLength(0);
	});

	it("multiple undos work in sequence, restoring initial state", () => {
		const n1 = makeNode("n1");
		const n2 = makeNode("n2");
		const n3 = makeNode("n3");

		useDiagramStore.getState().addNode(n1);
		useDiagramStore.getState().addNode(n2);
		useDiagramStore.getState().addNode(n3);

		useDiagramStore.getState().undo();
		useDiagramStore.getState().undo();
		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().nodes).toHaveLength(0);
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
	});
});

// ─── Operation-Specific Integration Tests ────────────────────────────────────

describe("undo/redo — operation-specific", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	it("undo addNode removes the node", () => {
		const node = makeNode("n1");
		useDiagramStore.getState().addNode(node);

		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().nodes).toHaveLength(0);
	});

	it("undo removeNodes restores the node AND its connected edges", () => {
		const nodeA = makeNode("nA");
		const nodeB = makeNode("nB");
		const edge = makeEdge("e1", "nA", "nB");

		useDiagramStore.setState({ nodes: [nodeA, nodeB], edges: [edge] });

		// Add operations to the undo stack to simulate having added these items.
		useDiagramStore.getState().removeNodes(["nA"]);

		// After removal, nA and e1 should be gone.
		expect(useDiagramStore.getState().nodes.find((n) => n.id === "nA")).toBeUndefined();
		expect(useDiagramStore.getState().edges).toHaveLength(0);

		// Undo — both should come back.
		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().nodes.find((n) => n.id === "nA")).toBeDefined();
		expect(useDiagramStore.getState().edges).toHaveLength(1);
		expect(useDiagramStore.getState().edges[0].id).toBe("e1");
	});

	it("undo moveNode restores the original position", () => {
		const node = makeNode("n1", { position: { x: 0, y: 0 } });
		useDiagramStore.setState({ nodes: [node] });

		useDiagramStore.getState().moveNode("n1", { x: 0, y: 0 }, { x: 100, y: 200 });

		// Verify the node moved.
		expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 100, y: 200 });

		useDiagramStore.getState().undo();

		// Should be back at origin.
		expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 0, y: 0 });
	});

	it("undo addEdge removes the edge", () => {
		const edge = makeEdge("e1", "n1", "n2");
		useDiagramStore.getState().addEdge(edge);

		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().edges).toHaveLength(0);
	});

	it("undo removeEdges restores the edge", () => {
		const n1 = makeNode("n1");
		const n2 = makeNode("n2");
		const edge = makeEdge("e1", "n1", "n2");
		useDiagramStore.setState({ nodes: [n1, n2], edges: [edge] });

		useDiagramStore.getState().removeEdges(["e1"]);
		expect(useDiagramStore.getState().edges).toHaveLength(0);

		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().edges).toHaveLength(1);
		expect(useDiagramStore.getState().edges[0].id).toBe("e1");
	});

	it("undo updateNodeData restores the original data", () => {
		const node = makeNode("n1", { data: { label: "Workers" } });
		useDiagramStore.setState({ nodes: [node] });

		useDiagramStore.getState().updateNodeData("n1", { label: "D1" });
		expect(useDiagramStore.getState().nodes[0].data.label).toBe("D1");

		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().nodes[0].data.label).toBe("Workers");
	});

	it("undo updateEdgeData restores the original data", () => {
		const n1 = makeNode("n1");
		const n2 = makeNode("n2");
		const edge = makeEdge("e1", "n1", "n2", { data: { label: "HTTP" } });
		useDiagramStore.setState({ nodes: [n1, n2], edges: [edge] });

		useDiagramStore.getState().updateEdgeData("e1", { label: "gRPC" });
		expect(useDiagramStore.getState().edges[0].data?.label).toBe("gRPC");

		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().edges[0].data?.label).toBe("HTTP");
	});

	it("batch operations (removeNodes with multiple IDs) undo as a single step", () => {
		const n1 = makeNode("n1");
		const n2 = makeNode("n2");
		const n3 = makeNode("n3");
		const e12 = makeEdge("e12", "n1", "n2");
		const e23 = makeEdge("e23", "n2", "n3");

		useDiagramStore.setState({ nodes: [n1, n2, n3], edges: [e12, e23] });

		// Remove 3 nodes at once — should create a single batch operation.
		useDiagramStore.getState().removeNodes(["n1", "n2", "n3"]);

		expect(useDiagramStore.getState().nodes).toHaveLength(0);
		expect(useDiagramStore.getState().edges).toHaveLength(0);
		// A single batch operation on the undo stack.
		expect(useDiagramStore.getState().undoStack).toHaveLength(1);

		// One undo should restore all 3 nodes and both edges.
		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().nodes).toHaveLength(3);
		expect(useDiagramStore.getState().edges).toHaveLength(2);
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
	});

	it("setDiagram clears both undoStack and redoStack", () => {
		// Build some history.
		useDiagramStore.getState().addNode(makeNode("n1"));
		useDiagramStore.getState().addNode(makeNode("n2"));
		useDiagramStore.getState().undo(); // Move one to redo stack.

		expect(useDiagramStore.getState().undoStack).toHaveLength(1);
		expect(useDiagramStore.getState().redoStack).toHaveLength(1);

		// Loading a new diagram should clear all history.
		useDiagramStore.getState().setDiagram([], []);

		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		expect(useDiagramStore.getState().redoStack).toHaveLength(0);
	});

	it("onConnect pushes an add_edge operation, and undo removes the edge", () => {
		const conn: Connection = {
			source: "n1",
			target: "n2",
			sourceHandle: null,
			targetHandle: null,
		};

		useDiagramStore.getState().onConnect(conn);

		// An operation should be on the undo stack.
		expect(useDiagramStore.getState().undoStack).toHaveLength(1);
		expect(useDiagramStore.getState().edges).toHaveLength(1);

		useDiagramStore.getState().undo();

		// The edge should be gone.
		expect(useDiagramStore.getState().edges).toHaveLength(0);
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		// The operation is now on the redo stack.
		expect(useDiagramStore.getState().redoStack).toHaveLength(1);
	});
});

// ─── moveNode-specific tests ──────────────────────────────────────────────────

describe("moveNode", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	it("updates the node position in the store", () => {
		const node = makeNode("n1", { position: { x: 10, y: 20 } });
		useDiagramStore.setState({ nodes: [node] });

		useDiagramStore.getState().moveNode("n1", { x: 10, y: 20 }, { x: 50, y: 80 });

		expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 50, y: 80 });
	});

	it("pushes a move_node operation onto the undo stack", () => {
		const node = makeNode("n1");
		useDiagramStore.setState({ nodes: [node] });

		useDiagramStore.getState().moveNode("n1", { x: 0, y: 0 }, { x: 100, y: 100 });

		expect(useDiagramStore.getState().undoStack).toHaveLength(1);
		expect(useDiagramStore.getState().undoStack[0].type).toBe("move_node");
	});

	it("is a no-op when from and to positions are identical", () => {
		const node = makeNode("n1", { position: { x: 5, y: 5 } });
		useDiagramStore.setState({ nodes: [node] });

		useDiagramStore.getState().moveNode("n1", { x: 5, y: 5 }, { x: 5, y: 5 });

		// No undo operation should have been pushed.
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		// Node position unchanged.
		expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 5, y: 5 });
	});
});

// ─── canUndo / canRedo reflect combined stack state ───────────────────────────

describe("canUndo / canRedo", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	it("both are false in the initial empty state", () => {
		expect(useDiagramStore.getState().canUndo()).toBe(false);
		expect(useDiagramStore.getState().canRedo()).toBe(false);
	});

	it("canUndo becomes true after any mutating action", () => {
		useDiagramStore.getState().addNode(makeNode("n1"));
		expect(useDiagramStore.getState().canUndo()).toBe(true);
	});

	it("canRedo becomes true after an undo", () => {
		useDiagramStore.getState().addNode(makeNode("n1"));
		useDiagramStore.getState().undo();
		expect(useDiagramStore.getState().canRedo()).toBe(true);
	});

	it("canRedo becomes false after performing a new action (redo stack cleared)", () => {
		useDiagramStore.getState().addNode(makeNode("n1"));
		useDiagramStore.getState().undo();
		// New action should clear redo stack.
		useDiagramStore.getState().addNode(makeNode("n2"));
		expect(useDiagramStore.getState().canRedo()).toBe(false);
	});
});

// ─── removeEdges batch behavior ──────────────────────────────────────────────

describe("removeEdges batch behavior", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	it("removing multiple edges creates a single batch operation", () => {
		const n1 = makeNode("n1");
		const n2 = makeNode("n2");
		const n3 = makeNode("n3");
		const e12 = makeEdge("e12", "n1", "n2");
		const e23 = makeEdge("e23", "n2", "n3");

		useDiagramStore.setState({ nodes: [n1, n2, n3], edges: [e12, e23] });

		useDiagramStore.getState().removeEdges(["e12", "e23"]);

		// A single batch operation on the undo stack.
		expect(useDiagramStore.getState().undoStack).toHaveLength(1);
		expect(useDiagramStore.getState().undoStack[0].type).toBe("batch");

		// Undoing the batch restores both edges.
		useDiagramStore.getState().undo();

		expect(useDiagramStore.getState().edges).toHaveLength(2);
	});

	it("removing a non-existent edge ID is a no-op (no operation pushed)", () => {
		const n1 = makeNode("n1");
		const n2 = makeNode("n2");
		const edge = makeEdge("e1", "n1", "n2");
		useDiagramStore.setState({ nodes: [n1, n2], edges: [edge] });

		// Try to remove an edge that doesn't exist.
		useDiagramStore.getState().removeEdges(["does-not-exist"]);

		// No operation pushed (all IDs were not found).
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		// Edge array unchanged.
		expect(useDiagramStore.getState().edges).toHaveLength(1);
	});

	it("removing a mix of existing and non-existing edge IDs only records the found ones", () => {
		const n1 = makeNode("n1");
		const n2 = makeNode("n2");
		const edge = makeEdge("e1", "n1", "n2");
		useDiagramStore.setState({ nodes: [n1, n2], edges: [edge] });

		useDiagramStore.getState().removeEdges(["e1", "nonexistent"]);

		// Only one operation pushed (for e1).
		expect(useDiagramStore.getState().undoStack).toHaveLength(1);
		expect(useDiagramStore.getState().edges).toHaveLength(0);
	});
});

// ─── removeNodes with non-existent IDs ───────────────────────────────────────

describe("removeNodes with non-existent IDs", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	it("removing non-existent node IDs is a no-op (no operation pushed)", () => {
		const n1 = makeNode("n1");
		useDiagramStore.setState({ nodes: [n1], edges: [] });

		// Try to remove nodes that don't exist.
		useDiagramStore.getState().removeNodes(["does-not-exist", "also-missing"]);

		// No operation pushed.
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		// Node array unchanged.
		expect(useDiagramStore.getState().nodes).toHaveLength(1);
	});
});

// ─── Stack cap enforcement with a small cap ───────────────────────────────────

describe("undo stack cap enforcement", () => {
	beforeEach(() => {
		useDiagramStore.setState({
			nodes: [],
			edges: [],
			viewport: { x: 0, y: 0, zoom: 1 },
			undoStack: [],
			redoStack: [],
			maxUndoSteps: 5,
		});
	});
	afterEach(resetStore);

	it("stack length never exceeds maxUndoSteps", () => {
		for (let i = 0; i < 10; i++) {
			useDiagramStore.getState().addNode(makeNode(`n${i}`));
		}
		expect(useDiagramStore.getState().undoStack).toHaveLength(5);
	});

	it("the oldest operations are lost when the cap is exceeded", () => {
		for (let i = 0; i < 7; i++) {
			useDiagramStore.getState().addNode(makeNode(`n${i}`));
		}

		// Undo all 5 retained operations.
		for (let i = 0; i < 5; i++) {
			useDiagramStore.getState().undo();
		}

		// 2 nodes (n0, n1) remain — those operations were discarded.
		expect(useDiagramStore.getState().nodes).toHaveLength(2);
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
	});
});
