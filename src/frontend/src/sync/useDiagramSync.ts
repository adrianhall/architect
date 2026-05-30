import { useEffect, useRef, useState } from "react";
import { fromReactFlowEdge, fromReactFlowNode } from "@/components/canvas/utils";
import { useDiagramStore } from "@/stores/diagram";
import type { DiagramSync } from "./types";

/**
 * The set of possible save-status values exposed by `useDiagramSync`.
 *
 * - `"idle"` — no save has been attempted yet (initial state after load).
 * - `"saving"` — a PUT request is in-flight.
 * - `"saved"` — the last save succeeded; `lastSavedAt` is set.
 * - `"error"` — the last save failed; `errorMessage` contains the reason.
 * - `"conflict"` — the server rejected the save with 409; another session
 *   holds a newer version. The user should reload to see the latest state.
 */
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

/**
 * Value returned by `useDiagramSync`.
 */
export interface UseDiagramSyncResult {
	/** Current save status. */
	status: SaveStatus;
	/**
	 * Unix timestamp (ms) of the last successful save, or `null` if no save
	 * has succeeded since the component mounted.
	 */
	lastSavedAt: number | null;
	/**
	 * Error message from the most recent failed save, or `null` when the
	 * status is not `"error"`.
	 */
	errorMessage: string | null;
}

/**
 * Watches the diagram store for changes and debounces saves through the
 * provided `DiagramSync` implementation.
 *
 * Responsibilities:
 * - Subscribes to the Zustand diagram store and schedules a save 500 ms after
 *   any change to `nodes`, `edges`, or `title` when `dirty` is `true`.
 * - Multiple rapid changes collapse into a single save (debounce resets the
 *   timer on each change).
 * - Transitions save status: idle → saving → saved | error | conflict.
 * - On success, calls `markClean(newVersion)` on the store and updates
 *   `lastSavedAt`.
 * - Registers a `beforeunload` listener that warns the user when the diagram
 *   is dirty (i.e. there are unsaved changes pending). The warning is
 *   suppressed when the diagram is clean.
 *
 * @param diagramId - The ULID of the diagram being edited. Passed to
 *   `sync.save` so it can construct the correct URL.
 * @param sync - The `DiagramSync` implementation to use for saving. The
 *   REST implementation is used in production; a mock can be passed in tests.
 * @returns An object with the current `status`, `lastSavedAt` timestamp, and
 *   `errorMessage`.
 *
 * @example
 * ```tsx
 * const restSync = createRestSync();
 *
 * function EditorCanvas({ diagramId }: { diagramId: string }) {
 *   const { status, lastSavedAt, errorMessage } = useDiagramSync(diagramId, restSync);
 *   return (
 *     <>
 *       <ReactFlowCanvas />
 *       <SaveStatus status={status} lastSavedAt={lastSavedAt} errorMessage={errorMessage} />
 *     </>
 *   );
 * }
 * ```
 */
export function useDiagramSync(diagramId: string, sync: DiagramSync): UseDiagramSyncResult {
	const [status, setStatus] = useState<SaveStatus>("idle");
	const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	/**
	 * Timer ID of the pending debounce. Cleared on each new change so that
	 * rapid successive changes collapse into a single save call.
	 */
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/**
	 * Guards against concurrent saves. If a save is already in-flight when the
	 * next debounce fires, the new save is skipped. The next store change will
	 * re-arm the debounce once the in-flight save completes.
	 */
	const isSavingRef = useRef(false);

	// ── Debounced auto-save ────────────────────────────────────────────────────

	useEffect(() => {
		/**
		 * Zustand store subscriber. Fires whenever any store slice changes.
		 * Checks whether a save-relevant field changed and, if so, arms a
		 * 500 ms debounce timer.
		 *
		 * **Implementation note:** Most mutating actions (e.g. `addNode`) do
		 * TWO Zustand `set` calls — the first updates `nodes`/`edges` while
		 * `dirty` is still false, and the second (inside `pushUndoOperation`)
		 * sets `dirty = true` and updates the undo stack. Checking both
		 * "content changed" AND "dirty=true" in a single guard would miss the
		 * content change (first set) because dirty isn't set yet.
		 *
		 * The guard below arms the debounce when:
		 * - `dirty` is true AND
		 * - at least one of {nodes, edges, title, dirty} changed since the last
		 *   notification (ensures we do not arm it for identical snapshots).
		 *
		 * This correctly handles both the first-set (dirty still false → skip)
		 * and second-set (dirty just became true → arm) phases of a mutation.
		 */
		const unsubscribe = useDiagramStore.subscribe((state, prevState) => {
			// Skip entirely when diagram is clean (no pending changes).
			if (!state.dirty) return;

			// Skip if nothing relevant changed since the last notification.
			// This prevents the debounce being armed multiple times for a
			// single logical mutation (e.g. the undoStack-only second set).
			if (
				state.nodes === prevState.nodes &&
				state.edges === prevState.edges &&
				state.title === prevState.title &&
				state.dirty === prevState.dirty
			) {
				return;
			}

			// Reset the debounce timer on every qualifying change.
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
			}

			debounceTimerRef.current = setTimeout(async () => {
				// Skip if another save is already in-flight.
				if (isSavingRef.current) return;
				isSavingRef.current = true;
				setStatus("saving");

				// Read the latest state snapshot immediately before the fetch,
				// not from the closure, to capture any changes that arrived
				// during the debounce window.
				const { title, nodes, edges, viewport, version } = useDiagramStore.getState();

				const graphData = {
					nodes: nodes.map(fromReactFlowNode),
					edges: edges.map(fromReactFlowEdge),
					viewport,
				};

				const result = await sync.save(diagramId, title, graphData, version);

				if (result.success) {
					useDiagramStore.getState().markClean(result.version);
					setStatus("saved");
					setLastSavedAt(Date.now());
					setErrorMessage(null);
				} else if (result.conflict) {
					setStatus("conflict");
					setErrorMessage("Another session saved changes. Please reload to see the latest version.");
				} else {
					setStatus("error");
					setErrorMessage(result.error);
				}

				isSavingRef.current = false;
			}, 500);
		});

		return () => {
			unsubscribe();
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, [diagramId, sync]);

	// ── beforeunload guard ─────────────────────────────────────────────────────

	useEffect(() => {
		/**
		 * Warns the user when they try to close/navigate away with unsaved
		 * changes. Modern browsers ignore custom messages but require
		 * `e.preventDefault()` and `e.returnValue = ""` to show the built-in
		 * confirmation dialog.
		 */
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			const { dirty } = useDiagramStore.getState();
			if (dirty) {
				e.preventDefault();
				// Kept for legacy browsers that still read returnValue.
				e.returnValue = "You have unsaved changes.";
			}
		}

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, []);

	return { status, lastSavedAt, errorMessage };
}
