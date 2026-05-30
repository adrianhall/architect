/**
 * ELK Auto-Layout Web Worker.
 *
 * Runs the ELK `layered` graph layout algorithm off the main thread so that
 * the canvas UI remains responsive during computation. Receives a
 * {@link LayoutRequest} message, delegates to `computeLayout`, and posts
 * either a {@link LayoutResult} or a {@link LayoutError} back to the caller.
 *
 * The actual layout logic lives in `elk-layout-logic.ts` so it can be tested
 * directly without spinning up a Worker in jsdom.
 *
 * @example
 * ```ts
 * // In the main thread (see useAutoLayout):
 * const worker = new Worker(
 *   new URL("./elk-layout.worker.ts", import.meta.url),
 *   { type: "module" }
 * );
 * worker.postMessage({ nodes, edges, direction: "TB" } satisfies LayoutRequest);
 * worker.onmessage = (e: MessageEvent<LayoutResult | LayoutError>) => { ... };
 * ```
 */

import type { LayoutError, LayoutRequest, LayoutResult } from "./elk-layout-logic";
import { computeLayout } from "./elk-layout-logic";

self.onmessage = async (event: MessageEvent<LayoutRequest>) => {
	try {
		const { nodes, edges, direction } = event.data;
		const positions = await computeLayout(nodes, edges, direction);
		const response: LayoutResult = { type: "result", positions };
		self.postMessage(response);
	} catch (err) {
		const response: LayoutError = {
			type: "error",
			message: err instanceof Error ? err.message : "Layout failed",
		};
		self.postMessage(response);
	}
};
