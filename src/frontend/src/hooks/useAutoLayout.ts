/**
 * React hook that manages the ELK Web Worker lifecycle and exposes a one-shot
 * `applyLayout(direction)` function for triggering auto-layout on the canvas.
 *
 * The worker is created once on mount and terminated on unmount to prevent
 * memory leaks. Layout requests are one-shot: the hook attaches a one-time
 * `message` listener before posting each request and removes it when the
 * response arrives, so concurrent calls are handled safely (the listener is
 * scoped to a single request).
 *
 * When a successful layout result arrives, positions are applied to the Zustand
 * diagram store as a single `batch` operation via `applyBatchOperation`, making
 * the entire layout change a single undo/redo step.
 *
 * Errors from the worker are logged to `console.error` rather than thrown;
 * the `isLayouting` flag is reset to `false` in both success and error paths.
 *
 * @returns `{ applyLayout, isLayouting }` — call `applyLayout("TB")` or
 *   `applyLayout("LR")` to trigger a layout; read `isLayouting` to show a
 *   spinner or disable the button while computation is in progress.
 *
 * @example
 * ```tsx
 * function LayoutButton() {
 *   const { applyLayout, isLayouting } = useAutoLayout();
 *   return (
 *     <button disabled={isLayouting} onClick={() => applyLayout("TB")}>
 *       {isLayouting ? "Layouting…" : "Layout"}
 *     </button>
 *   );
 * }
 * ```
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useDiagramStore } from "../stores/diagram";
import type { LayoutError, LayoutResult } from "../workers/elk-layout-logic";

/**
 * Default node width used when computing ELK layout.
 *
 * Matches the CSS width of the `CloudflareServiceNode` component. Using a
 * fixed constant is the recommended MVP approach; switch to
 * `node.measured?.width` from React Flow's `getNodes()` for a more accurate
 * layout once node measurement is available.
 */
const DEFAULT_NODE_WIDTH = 160;

/**
 * Default node height used when computing ELK layout.
 *
 * Matches the CSS height of the `CloudflareServiceNode` component.
 */
const DEFAULT_NODE_HEIGHT = 100;

/**
 * Return value of the `useAutoLayout` hook.
 */
export interface UseAutoLayoutResult {
	/**
	 * Triggers an ELK layout computation for the current diagram state.
	 *
	 * The request is sent to the background Web Worker; `isLayouting` is set
	 * to `true` immediately and reset when the worker responds. Calling
	 * `applyLayout` while a layout is already in progress is a no-op — the
	 * call is silently ignored until the current layout finishes.
	 *
	 * @param direction - `"TB"` for top-to-bottom or `"LR"` for left-to-right.
	 */
	applyLayout: (direction: "TB" | "LR") => void;
	/**
	 * `true` while the Web Worker is computing a layout; `false` otherwise.
	 *
	 * Use to disable the layout button and show a spinner.
	 */
	isLayouting: boolean;
}

/**
 * React hook for off-main-thread ELK auto-layout.
 *
 * Creates an ELK Web Worker on mount, exposes a stable `applyLayout` callback,
 * and terminates the worker on unmount. The layout result is applied to the
 * Zustand diagram store as a single batch undo/redo operation.
 *
 * @returns `{ applyLayout, isLayouting }`.
 */
export function useAutoLayout(): UseAutoLayoutResult {
	const workerRef = useRef<Worker | null>(null);
	const [isLayouting, setIsLayouting] = useState(false);

	// Create the worker on mount; terminate it on unmount.
	useEffect(() => {
		workerRef.current = new Worker(new URL("../workers/elk-layout.worker.ts", import.meta.url), {
			type: "module",
		});

		return () => {
			workerRef.current?.terminate();
			workerRef.current = null;
		};
	}, []);

	const applyLayout = useCallback(
		(direction: "TB" | "LR") => {
			const worker = workerRef.current;
			// Guard: ignore if no worker or layout already in progress.
			if (!worker || isLayouting) return;

			setIsLayouting(true);

			// Read current store state via getState() to avoid stale closure issues.
			// This mirrors the pattern used in Editor.tsx handleDrop.
			const { nodes, edges } = useDiagramStore.getState();

			worker.postMessage({
				nodes: nodes.map((node) => ({
					id: node.id,
					position: node.position,
					width: DEFAULT_NODE_WIDTH,
					height: DEFAULT_NODE_HEIGHT,
				})),
				edges: edges.map((edge) => ({
					id: edge.id,
					source: edge.source,
					target: edge.target,
				})),
				direction,
			});

			// One-shot listener — removed as soon as the worker responds.
			const handleMessage = (event: MessageEvent<LayoutResult | LayoutError>) => {
				worker.removeEventListener("message", handleMessage);

				if (event.data.type === "result") {
					// Re-read nodes from current store state in case they changed while
					// the layout was computing.
					const currentNodes = useDiagramStore.getState().nodes;

					// Build move_node operations only for nodes whose position actually
					// changed, to keep the undo stack lean.
					const moveOperations = event.data.positions
						.map((pos) => {
							const node = currentNodes.find((n) => n.id === pos.nodeId);
							if (!node) return null;
							// Skip no-ops.
							if (node.position.x === pos.position.x && node.position.y === pos.position.y) {
								return null;
							}
							return {
								type: "move_node" as const,
								nodeId: pos.nodeId,
								from: { ...node.position },
								to: pos.position,
							};
						})
						.filter((op): op is NonNullable<typeof op> => op !== null);

					if (moveOperations.length > 0) {
						useDiagramStore.getState().applyBatchOperation({
							type: "batch",
							operations: moveOperations,
						});
					}
				} else {
					// Worker returned an error — log it; don't throw (no crash).
					console.error("ELK layout failed:", event.data.message);
				}

				setIsLayouting(false);
			};

			worker.addEventListener("message", handleMessage);
		},
		[isLayouting],
	);

	return { applyLayout, isLayouting };
}
