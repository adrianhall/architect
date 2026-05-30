import { act, renderHook } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "@/stores/diagram";
import type { DiagramSync, SaveResult } from "../types";
import { useDiagramSync } from "../useDiagramSync";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Resets the diagram store to a known state before each test. */
function resetStore() {
	useDiagramStore.setState({
		nodes: [],
		edges: [],
		viewport: { x: 0, y: 0, zoom: 1 },
		diagramId: "diag-01",
		title: "Test Diagram",
		version: 1,
		dirty: false,
		undoStack: [],
		redoStack: [],
	});
}

/** Creates a minimal mock DiagramSync that returns a configurable result. */
function makeMockSync(result: SaveResult): DiagramSync {
	return { save: vi.fn().mockResolvedValue(result) };
}

/** Minimal React Flow Node for seeding the store. */
function makeNode(id: string): Node {
	return {
		id,
		type: "cloudflareService",
		position: { x: 10, y: 20 },
		data: { label: `Node ${id}`, serviceTypeId: "workers", iconUrl: "", categoryColor: "#000" },
	};
}

describe("useDiagramSync", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetStore();
	});

	afterEach(() => {
		vi.runAllTimers();
		vi.useRealTimers();
		resetStore();
	});

	// ── Debounce behaviour ─────────────────────────────────────────────────────

	describe("debounce", () => {
		it("does not call save immediately after a store change", async () => {
			const sync = makeMockSync({ success: true, version: 2 });
			renderHook(() => useDiagramSync("diag-01", sync));

			// Trigger a store mutation (sets dirty=true and changes nodes ref)
			act(() => {
				useDiagramStore.getState().addNode(makeNode("n1"));
			});

			expect(sync.save).not.toHaveBeenCalled();
		});

		it("calls save once after 500 ms following a store change", async () => {
			const sync = makeMockSync({ success: true, version: 2 });
			renderHook(() => useDiagramSync("diag-01", sync));

			act(() => {
				useDiagramStore.getState().addNode(makeNode("n1"));
			});

			// advanceTimersByTimeAsync fires the timer AND awaits any async
			// callbacks (including the internal `await sync.save(...)` call).
			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});

			expect(sync.save).toHaveBeenCalledOnce();
		});

		it("collapses multiple rapid changes into a single save", async () => {
			const sync = makeMockSync({ success: true, version: 2 });
			renderHook(() => useDiagramSync("diag-01", sync));

			// Five rapid changes — each resets the debounce timer
			for (let i = 0; i < 5; i++) {
				act(() => {
					useDiagramStore.getState().addNode(makeNode(`n${i}`));
				});
			}

			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});

			// All five changes collapse into one save call
			expect(sync.save).toHaveBeenCalledOnce();
		});
	});

	// ── Status transitions ─────────────────────────────────────────────────────

	describe("status transitions", () => {
		it("transitions to 'saved' on a successful save", async () => {
			const sync = makeMockSync({ success: true, version: 2 });
			const { result } = renderHook(() => useDiagramSync("diag-01", sync));

			expect(result.current.status).toBe("idle");

			act(() => {
				useDiagramStore.getState().addNode(makeNode("n1"));
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});

			expect(result.current.status).toBe("saved");
			expect(result.current.lastSavedAt).not.toBeNull();
			expect(result.current.errorMessage).toBeNull();
		});

		it("transitions to 'error' when save returns an error result", async () => {
			const sync = makeMockSync({
				success: false,
				error: "Network timeout",
			});
			const { result } = renderHook(() => useDiagramSync("diag-01", sync));

			act(() => {
				useDiagramStore.getState().addNode(makeNode("n1"));
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});

			expect(result.current.status).toBe("error");
			expect(result.current.errorMessage).toBe("Network timeout");
		});

		it("transitions to 'conflict' on a 409 conflict result", async () => {
			const sync = makeMockSync({
				success: false,
				conflict: true,
				serverVersion: 5,
			});
			const { result } = renderHook(() => useDiagramSync("diag-01", sync));

			act(() => {
				useDiagramStore.getState().addNode(makeNode("n1"));
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});

			expect(result.current.status).toBe("conflict");
		});
	});

	// ── markClean ──────────────────────────────────────────────────────────────

	describe("markClean", () => {
		it("marks the store clean with the new version after a successful save", async () => {
			const sync = makeMockSync({ success: true, version: 7 });
			renderHook(() => useDiagramSync("diag-01", sync));

			act(() => {
				useDiagramStore.getState().addNode(makeNode("n1"));
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});

			const { dirty, version } = useDiagramStore.getState();
			expect(dirty).toBe(false);
			expect(version).toBe(7);
		});
	});

	// ── No spurious save when not dirty ────────────────────────────────────────

	describe("dirty guard", () => {
		it("does not save when store changes but dirty flag is false", async () => {
			// Manually flip nodes without going through a mutating action so dirty stays false
			const sync = makeMockSync({ success: true, version: 2 });
			renderHook(() => useDiagramSync("diag-01", sync));

			// Directly patch nodes without setting dirty
			act(() => {
				useDiagramStore.setState({
					nodes: [makeNode("n1")],
					dirty: false,
				});
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});

			expect(sync.save).not.toHaveBeenCalled();
		});
	});

	// ── beforeunload ───────────────────────────────────────────────────────────

	describe("beforeunload handler", () => {
		it("fires and prevents default when the diagram is dirty", () => {
			renderHook(() => useDiagramSync("diag-01", makeMockSync({ success: true, version: 2 })));

			// Set dirty without triggering a save
			act(() => {
				useDiagramStore.setState({ dirty: true });
			});

			const event = new Event("beforeunload", { cancelable: true });
			window.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(true);
		});

		it("does NOT prevent default when the diagram is clean", () => {
			renderHook(() => useDiagramSync("diag-01", makeMockSync({ success: true, version: 2 })));

			// Ensure store is clean
			act(() => {
				useDiagramStore.setState({ dirty: false });
			});

			const event = new Event("beforeunload", { cancelable: true });
			window.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(false);
		});
	});

	// ── Abstraction test ───────────────────────────────────────────────────────

	describe("DiagramSync abstraction", () => {
		it("passes correct arguments to the sync.save method", async () => {
			const mockSave = vi.fn().mockResolvedValue({ success: true, version: 2 });
			const sync: DiagramSync = { save: mockSave };

			// Seed specific store state so we can assert on what was passed
			useDiagramStore.setState({
				nodes: [makeNode("n1")],
				edges: [],
				viewport: { x: 10, y: 20, zoom: 1.5 },
				diagramId: "diag-test",
				title: "My Architecture",
				version: 3,
				dirty: true,
			});

			renderHook(() => useDiagramSync("diag-test", sync));

			// Trigger a change so the subscription fires
			act(() => {
				useDiagramStore.getState().addNode(makeNode("n2"));
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});

			expect(mockSave).toHaveBeenCalledOnce();
			const [calledId, calledTitle, calledGraphData, calledVersion] = mockSave.mock.calls[0];

			expect(calledId).toBe("diag-test");
			expect(calledTitle).toBe("My Architecture");
			// Graph data includes serialised nodes
			expect(calledGraphData.nodes).toHaveLength(2);
			expect(calledVersion).toBe(3);
		});
	});
});
