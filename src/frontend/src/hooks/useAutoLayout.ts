/**
 * React hook that exposes `applyLayout(direction)` for triggering ELK
 * auto-layout on the canvas diagram.
 *
 * ## Architecture
 *
 * `elkjs/lib/elk.bundled.js` is designed for main-thread use. When
 * `new ELK()` is instantiated it internally spawns its **own** Web Worker
 * (via `URL.createObjectURL`) to run the layout algorithm off the main
 * thread. Wrapping ELK in a second custom worker (as originally attempted)
 * causes nested-worker failures because ELK's bundled `Worker` constructor
 * reference is not accessible inside a Vite ES-module worker bundle.
 *
 * The correct pattern is therefore to call `computeLayout` directly from the
 * main thread. ELK's internal worker handles the off-thread computation and
 * `elk.layout()` returns a Promise that resolves when the result is ready,
 * keeping the UI responsive without any additional threading on our part.
 *
 * @example
 * ```tsx
 * function LayoutButton() {
 *   const { applyLayout, isLayouting } = useAutoLayout();
 *   return (
 *     <button disabled={isLayouting} onClick={() => applyLayout("TB")}>
 *       {isLayouting ? "Formatting…" : "Layout"}
 *     </button>
 *   );
 * }
 * ```
 */
import { useCallback, useState } from "react";
import { useDiagramStore } from "../stores/diagram";
import { computeLayout } from "../workers/elk-layout-logic";

/**
 * Default node width used when computing ELK layout.
 *
 * Matches the `w-[120px]` Tailwind class on `CloudflareServiceNode`. Using a
 * fixed constant is the recommended MVP approach; switch to
 * `node.measured?.width` from React Flow's `getNodes()` for a more accurate
 * layout once node measurement is available.
 */
const DEFAULT_NODE_WIDTH = 120;

/**
 * Default node height used when computing ELK layout.
 *
 * Matches the `h-[100px]` Tailwind class on `CloudflareServiceNode`.
 */
const DEFAULT_NODE_HEIGHT = 100;

/**
 * Return value of the `useAutoLayout` hook.
 */
export interface UseAutoLayoutResult {
	/**
	 * Triggers an ELK layout computation for the current diagram state.
	 *
	 * Calls `computeLayout` which delegates to ELK's async `elk.layout()`
	 * method. ELK runs the computation in its own internal Web Worker, so the
	 * main thread is not blocked. `isLayouting` is `true` for the duration of
	 * the async call and reset when the Promise resolves or rejects.
	 *
	 * Calling `applyLayout` while a layout is already in progress is a no-op —
	 * the call is silently ignored until the current layout finishes.
	 *
	 * @param direction - `"TB"` for top-to-bottom or `"LR"` for left-to-right.
	 */
	applyLayout: (direction: "TB" | "LR") => void;
	/**
	 * `true` while ELK is computing a layout; `false` otherwise.
	 *
	 * Use to disable the layout button and show a spinner.
	 */
	isLayouting: boolean;
}

/**
 * React hook for ELK auto-layout.
 *
 * Calls `computeLayout` directly on the main thread. ELK's bundled internal
 * Web Worker handles the off-thread computation automatically; no custom
 * worker lifecycle management is required in this hook.
 *
 * Layout results are applied to the Zustand diagram store via
 * `applyBatchOperation`, making the entire layout a single undo/redo step.
 *
 * @returns `{ applyLayout, isLayouting }`.
 */
export function useAutoLayout(): UseAutoLayoutResult {
	const [isLayouting, setIsLayouting] = useState(false);

	const applyLayout = useCallback(
		async (direction: "TB" | "LR") => {
			if (isLayouting) return;
			setIsLayouting(true);

			try {
				// Read current store state via getState() to avoid stale closure issues.
				const { nodes, edges } = useDiagramStore.getState();

				const positions = await computeLayout(
					nodes.map((node) => ({
						id: node.id,
						position: node.position,
						width: DEFAULT_NODE_WIDTH,
						height: DEFAULT_NODE_HEIGHT,
					})),
					edges.map((edge) => ({
						id: edge.id,
						source: edge.source,
						target: edge.target,
					})),
					direction,
				);

				// Re-read store state in case it changed while ELK was computing.
				const { nodes: currentNodes, edges: currentEdges } = useDiagramStore.getState();

				// Build move_node ops only for nodes whose position actually changed.
				const moveOperations = positions
					.map((pos) => {
						const node = currentNodes.find((n) => n.id === pos.nodeId);
						if (!node) return null;
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

				// Build update_edge ops to clear pinned sourceHandle / targetHandle
				// on every edge that has them. Cleared handles let React Flow
				// auto-route edges based on the new node positions instead of
				// routing via the old handles (which produces S-shaped curves when
				// the layout direction changes, e.g. LR → TB).
				const edgeClearOperations = currentEdges
					.filter((e) => e.sourceHandle != null || e.targetHandle != null)
					.map((e) => ({
						type: "update_edge" as const,
						edgeId: e.id,
						from: { sourceHandle: e.sourceHandle, targetHandle: e.targetHandle },
						to: { sourceHandle: undefined, targetHandle: undefined },
					}));

				const allOperations = [...moveOperations, ...edgeClearOperations];

				if (allOperations.length > 0) {
					useDiagramStore.getState().applyBatchOperation({
						type: "batch",
						operations: allOperations,
					});
				}
			} catch (err) {
				console.error("ELK layout failed:", err instanceof Error ? err.message : err);
			} finally {
				setIsLayouting(false);
			}
		},
		[isLayouting],
	);

	return { applyLayout, isLayouting };
}
