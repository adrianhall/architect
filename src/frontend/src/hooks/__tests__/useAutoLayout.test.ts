/**
 * Tests for the `useAutoLayout` hook.
 *
 * jsdom does not support the `Worker` constructor. The tests mock the global
 * `Worker` class with a minimal fake that captures `postMessage` calls and
 * lets the test control `message` event delivery via `fireMessage`.
 *
 * Store assertions use OBSERVABLE SIDE EFFECTS (node positions, undo stack)
 * instead of spying on Zustand store methods. This avoids a subtle bug where
 * vi.spyOn on a Zustand state method persists across tests via Object.assign
 * state merging, causing spurious call counts.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "../../stores/diagram";
import type { LayoutError, LayoutResult } from "../../workers/elk-layout-logic";
import { useAutoLayout } from "../useAutoLayout";

// ---------------------------------------------------------------------------
// Fake Worker implementation
// ---------------------------------------------------------------------------

/** Captured state from the most recently created fake Worker instance. */
let fakeWorkerInstance: FakeWorker | null = null;

/**
 * A minimal in-memory Worker mock that:
 * - Exposes `postMessage` as a spy so tests can assert what was posted.
 * - Exposes `terminate` as a spy so tests can assert cleanup.
 * - Stores registered `message` listeners so tests can fire them manually.
 */
class FakeWorker {
	postMessage = vi.fn();
	terminate = vi.fn();

	private messageListeners: Array<(event: MessageEvent) => void> = [];

	constructor(_url: string | URL, _opts?: WorkerOptions) {
		// Track the latest instance so tests can access it.
		fakeWorkerInstance = this;
	}

	addEventListener(type: string, listener: (event: MessageEvent) => void) {
		if (type === "message") {
			this.messageListeners.push(listener);
		}
	}

	removeEventListener(type: string, listener: (event: MessageEvent) => void) {
		if (type === "message") {
			this.messageListeners = this.messageListeners.filter((l) => l !== listener);
		}
	}

	/** Test helper: simulate the worker posting a message back. */
	fireMessage(data: LayoutResult | LayoutError) {
		const event = { data } as MessageEvent<LayoutResult | LayoutError>;
		for (const listener of [...this.messageListeners]) {
			listener(event);
		}
	}
}

/**
 * Returns the current `fakeWorkerInstance`, throwing an assertion error if it
 * has not been created yet. Avoids the non-null assertion operator while
 * giving clear diagnostics on failure.
 */
function getWorker(): FakeWorker {
	if (!fakeWorkerInstance) {
		throw new Error("FakeWorker was not instantiated — did the hook create a Worker?");
	}
	return fakeWorkerInstance;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
	fakeWorkerInstance = null;
	// Install the fake Worker globally so `new Worker(...)` inside the hook
	// returns our FakeWorker.
	Object.defineProperty(globalThis, "Worker", {
		writable: true,
		configurable: true,
		value: FakeWorker,
	});

	// Reset the Zustand store to a clean state using loadDiagram, which
	// completely reinitialises the store including all undo/redo state.
	// Using loadDiagram (instead of setState) avoids the issue where
	// vi.spyOn-wrapped functions persist in the new Zustand state via
	// Object.assign when setState is called.
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
	it("creates a Worker on mount and terminates it on unmount", () => {
		const { unmount } = renderHook(() => useAutoLayout());

		expect(fakeWorkerInstance).not.toBeNull();

		unmount();

		expect(getWorker().terminate).toHaveBeenCalledOnce();
	});

	it("applyLayout sends a postMessage with the correct structure", () => {
		// Seed the store with some nodes so we can assert the message payload.
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

		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("TB");
		});

		const worker = getWorker();
		expect(worker.postMessage).toHaveBeenCalledOnce();

		const payload = worker.postMessage.mock.calls[0][0];
		expect(payload.direction).toBe("TB");
		expect(payload.nodes).toHaveLength(2);
		expect(payload.nodes[0].id).toBe("n1");
		expect(payload.edges).toHaveLength(1);
		expect(payload.edges[0].id).toBe("e1");
	});

	it("isLayouting is true while waiting for worker response", () => {
		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("TB");
		});

		expect(result.current.isLayouting).toBe(true);
	});

	it("isLayouting resets to false after receiving a result", () => {
		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("LR");
		});

		expect(result.current.isLayouting).toBe(true);

		act(() => {
			getWorker().fireMessage({ type: "result", positions: [] });
		});

		expect(result.current.isLayouting).toBe(false);
	});

	it("layout result moves nodes in the store and pushes a single undo step", () => {
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

		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("TB");
		});

		act(() => {
			getWorker().fireMessage({
				type: "result",
				positions: [
					{ nodeId: "a", position: { x: 10, y: 20 } },
					{ nodeId: "b", position: { x: 10, y: 150 } },
				],
			});
		});

		// Check observable effects: node positions updated.
		const state = useDiagramStore.getState();
		const nodeA = state.nodes.find((n) => n.id === "a");
		const nodeB = state.nodes.find((n) => n.id === "b");
		expect(nodeA?.position).toEqual({ x: 10, y: 20 });
		expect(nodeB?.position).toEqual({ x: 10, y: 150 });

		// Exactly one undo step recorded (the batch).
		expect(state.undoStack).toHaveLength(1);
		expect(state.undoStack[0].type).toBe("batch");
	});

	it("does not push an undo step when no positions changed", () => {
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

		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("TB");
		});

		act(() => {
			// Worker returns the same position the node already has — no change.
			getWorker().fireMessage({
				type: "result",
				positions: [{ nodeId: "a", position: { x: 10, y: 20 } }],
			});
		});

		// No undo step pushed (batch was empty / no-op).
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		// Node position unchanged.
		expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 10, y: 20 });
	});

	it("resets isLayouting to false on worker error and leaves store unchanged", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		useDiagramStore
			.getState()
			.loadDiagram(
				"test-id",
				"Test",
				[{ id: "a", position: { x: 5, y: 5 }, type: "cloudflareService", data: {} }],
				[],
				undefined,
				1,
			);

		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("TB");
		});

		act(() => {
			getWorker().fireMessage({ type: "error", message: "ELK exploded" });
		});

		expect(result.current.isLayouting).toBe(false);

		// Store is unchanged: no undo step, node still at original position.
		expect(useDiagramStore.getState().undoStack).toHaveLength(0);
		expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 5, y: 5 });
		expect(consoleSpy).toHaveBeenCalledWith("ELK layout failed:", "ELK exploded");
	});

	it("ignores a second applyLayout call while a layout is already in progress", () => {
		const { result } = renderHook(() => useAutoLayout());

		act(() => {
			result.current.applyLayout("TB");
		});

		// Second call while isLayouting is true — should be a no-op.
		act(() => {
			result.current.applyLayout("LR");
		});

		// postMessage should have been called only once (for the first call).
		expect(getWorker().postMessage).toHaveBeenCalledOnce();
	});
});
