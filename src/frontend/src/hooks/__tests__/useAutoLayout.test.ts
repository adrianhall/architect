/**
 * Tests for the `useAutoLayout` hook.
 *
 * `computeLayout` is mocked via `vi.mock` so these tests verify only the
 * hook's state management and store integration, not ELK's layout algorithm
 * (which is covered by elk-layout-logic.test.ts). The mock returns a resolved
 * Promise immediately so tests run synchronously without real ELK computation.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "../../stores/diagram";
import { useAutoLayout } from "../useAutoLayout";

// ---------------------------------------------------------------------------
// Mock computeLayout
// ---------------------------------------------------------------------------

const mockComputeLayout = vi.fn();

vi.mock("../../workers/elk-layout-logic", () => ({
	computeLayout: (...args: unknown[]) => mockComputeLayout(...args),
}));

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
	mockComputeLayout.mockReset();
	// Default: return an empty positions array (no-op layout).
	mockComputeLayout.mockResolvedValue([]);

	// Reset the Zustand store to a clean state.
	useDiagramStore.getState().loadDiagram("test-id", "Test", [], [], undefined, 1);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAutoLayout", () => {
	it("isLayouting is true while computeLayout is in progress", async () => {
		// Make the mock never resolve so we can check the intermediate state.
		mockComputeLayout.mockReturnValue(new Promise(() => {}));

		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("TB");
		});

		expect(result.current.isLayouting).toBe(true);
	});

	it("isLayouting returns to false after a successful layout", async () => {
		mockComputeLayout.mockResolvedValue([]);

		const { result } = renderHook(() => useAutoLayout());

		await act(async () => {
			await result.current.applyLayout("TB");
		});

		expect(result.current.isLayouting).toBe(false);
	});

	it("passes the correct direction and node/edge data to computeLayout", async () => {
		useDiagramStore.getState().loadDiagram(
			"test-id",
			"Test",
			[
				{ id: "n1", position: { x: 10, y: 20 }, type: "cloudflareService", data: {} },
				{ id: "n2", position: { x: 30, y: 40 }, type: "cloudflareService", data: {} },
			],
			[{ id: "e1", source: "n1", target: "n2", type: "data-flow", data: {} }],
			undefined,
			1,
		);

		mockComputeLayout.mockResolvedValue([]);

		const { result } = renderHook(() => useAutoLayout());

		await act(async () => {
			await result.current.applyLayout("LR");
		});

		expect(mockComputeLayout).toHaveBeenCalledOnce();
		const [nodes, edges, direction] = mockComputeLayout.mock.calls[0];
		expect(direction).toBe("LR");
		expect(nodes).toHaveLength(2);
		expect(nodes[0].id).toBe("n1");
		expect(edges).toHaveLength(1);
		expect(edges[0].id).toBe("e1");
	});

	it("moves nodes in the store and pushes a single undo step", async () => {
		useDiagramStore.getState().loadDiagram(
			"test-id",
			"Test",
			[
				{ id: "a", position: { x: 0, y: 0 }, type: "cloudflareService", data: {} },
				{ id: "b", position: { x: 0, y: 0 }, type: "cloudflareService", data: {} },
			],
			[],
			undefined,
			1,
		);

		mockComputeLayout.mockResolvedValue([
			{ nodeId: "a", position: { x: 10, y: 20 } },
			{ nodeId: "b", position: { x: 10, y: 150 } },
		]);

		const { result } = renderHook(() => useAutoLayout());

		await act(async () => {
			await result.current.applyLayout("TB");
		});

		const state = useDiagramStore.getState();
		expect(state.nodes.find((n) => n.id === "a")?.position).toEqual({ x: 10, y: 20 });
		expect(state.nodes.find((n) => n.id === "b")?.position).toEqual({ x: 10, y: 150 });
		expect(state.undoStack).toHaveLength(1);
		expect(state.undoStack[0].type).toBe("batch");
	});

	it("does not push an undo step when no positions changed", async () => {
		useDiagramStore
			.getState()
			.loadDiagram(
				"test-id",
				"Test",
				[{ id: "a", position: { x: 10, y: 20 }, type: "cloudflareService", data: {} }],
				[],
				undefined,
				1,
			);

		// Worker returns the same position the node already has — no change.
		mockComputeLayout.mockResolvedValue([{ nodeId: "a", position: { x: 10, y: 20 } }]);

		const { result } = renderHook(() => useAutoLayout());

		await act(async () => {
			await result.current.applyLayout("TB");
		});

		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 10, y: 20 });
	});

	it("resets isLayouting to false when computeLayout throws", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		mockComputeLayout.mockRejectedValue(new Error("ELK exploded"));

		const { result } = renderHook(() => useAutoLayout());

		await act(async () => {
			await result.current.applyLayout("TB");
		});

		expect(result.current.isLayouting).toBe(false);
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		expect(consoleSpy).toHaveBeenCalledWith("ELK layout failed:", "ELK exploded");
	});

	it("ignores a second applyLayout call while a layout is already in progress", async () => {
		mockComputeLayout.mockReturnValue(new Promise(() => {}));

		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("TB");
		});

		// Second call while isLayouting is true — should be a no-op.
		act(() => {
			result.current.applyLayout("LR");
		});

		// computeLayout should only have been called once.
		expect(mockComputeLayout).toHaveBeenCalledOnce();
	});

	it("clears pinned sourceHandle/targetHandle on all edges as part of the layout batch", async () => {
		// Set up a node and an edge with explicit handles (simulating a LR-drawn edge).
		useDiagramStore.getState().loadDiagram(
			"test-id",
			"Test",
			[
				{ id: "a", position: { x: 0, y: 0 }, type: "cloudflareService", data: {} },
				{ id: "b", position: { x: 200, y: 0 }, type: "cloudflareService", data: {} },
			],
			[
				{
					id: "e1",
					source: "a",
					target: "b",
					type: "data-flow",
					sourceHandle: "right",
					targetHandle: "left",
					data: {},
				},
			],
			undefined,
			1,
		);

		// ELK returns new TB positions.
		mockComputeLayout.mockResolvedValue([
			{ nodeId: "a", position: { x: 0, y: 0 } },
			{ nodeId: "b", position: { x: 0, y: 180 } },
		]);

		const { result } = renderHook(() => useAutoLayout());

		await act(async () => {
			await result.current.applyLayout("TB");
		});

		// Edge handles must be cleared so React Flow auto-routes for the new layout.
		const edge = useDiagramStore.getState().edges[0];
		expect(edge.sourceHandle).toBeUndefined();
		expect(edge.targetHandle).toBeUndefined();

		// The entire layout (moves + handle clears) is a single undo step.
		expect(useDiagramStore.getState().undoStack).toHaveLength(1);
		expect(useDiagramStore.getState().undoStack[0].type).toBe("batch");
	});

	it("does not push a handle-clear op for edges that already have no handles", async () => {
		useDiagramStore.getState().loadDiagram(
			"test-id",
			"Test",
			[{ id: "a", position: { x: 0, y: 0 }, type: "cloudflareService", data: {} }],
			// Edge with no sourceHandle/targetHandle (React Flow auto-routed).
			[{ id: "e1", source: "a", target: "a", type: "data-flow", data: {} }],
			undefined,
			1,
		);

		// Layout moves no nodes (positions unchanged) and has no handle ops to push.
		mockComputeLayout.mockResolvedValue([{ nodeId: "a", position: { x: 0, y: 0 } }]);

		const { result } = renderHook(() => useAutoLayout());

		await act(async () => {
			await result.current.applyLayout("TB");
		});

		// Nothing changed — no undo step should have been pushed.
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
	});
});
