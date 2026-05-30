import type { GraphData } from "@architect/shared";

/**
 * Result returned by a {@link DiagramSync.save} call.
 *
 * A discriminated union covering three outcomes:
 *
 * - **Success** — the server accepted the save and returned a new version number.
 * - **Conflict** — the server rejected the save because another session saved
 *   a newer version (HTTP 409). The `serverVersion` field carries the current
 *   server version so the client can display a conflict warning.
 * - **Error** — the save failed for any other reason (network error, 5xx, etc.)
 *   and an error message is available.
 *
 * @example
 * ```ts
 * const result = await sync.save(id, title, graphData, version);
 * if (result.success) {
 *   console.log("New version:", result.version);
 * } else if (result.conflict) {
 *   console.warn("Conflict detected, server version:", result.serverVersion);
 * } else {
 *   console.error("Save failed:", result.error);
 * }
 * ```
 */
export type SaveResult =
	| { success: true; version: number }
	| { success: false; conflict: true; serverVersion: number }
	| { success: false; conflict?: false; error: string };

/**
 * Abstraction layer between the diagram store and the underlying persistence
 * mechanism.
 *
 * The MVP implementation (`RestSync`) performs a debounced full-graph PUT
 * request. A future WebSocket/Durable-Object implementation can be swapped in
 * by providing a different `DiagramSync` value — canvas components and the
 * diagram store need no changes.
 *
 * @example
 * ```ts
 * // REST implementation (MVP)
 * const sync = createRestSync();
 *
 * // Future WebSocket implementation (post-MVP)
 * const sync = createWebSocketSync(durableObjectUrl);
 *
 * // Both satisfy the same interface:
 * useDiagramSync(diagramId, sync);
 * ```
 */
export interface DiagramSync {
	/**
	 * Persists the current diagram state to the server.
	 *
	 * Called by `useDiagramSync` after the 500 ms debounce expires. The
	 * implementation is responsible for serialising the data and interpreting
	 * the server response as one of the three {@link SaveResult} variants.
	 *
	 * @param diagramId - The ULID of the diagram to update.
	 * @param title - The diagram's display title, included in the PUT body.
	 * @param graphData - The current graph state: nodes, edges, and viewport.
	 * @param version - The client's current version number for optimistic
	 *   concurrency control. The server rejects the save with 409 if this
	 *   does not match the stored version.
	 * @returns A promise that resolves to a {@link SaveResult} describing the
	 *   outcome of the save attempt.
	 */
	save(diagramId: string, title: string, graphData: GraphData, version: number): Promise<SaveResult>;

	/**
	 * Registers a callback to be called when the server pushes a remote change.
	 *
	 * Optional — the REST implementation does not support real-time remote
	 * updates. A future WebSocket implementation will call the callback whenever
	 * a collaborator's save is broadcast to all connected clients.
	 *
	 * @param callback - Invoked with the new `GraphData` and `version` whenever
	 *   a remote change arrives.
	 * @returns A cleanup function that unsubscribes the callback when called.
	 *   Wire this to `useEffect`'s cleanup return.
	 *
	 * @example
	 * ```ts
	 * useEffect(() => {
	 *   if (!sync.onRemoteChange) return;
	 *   return sync.onRemoteChange((data, v) => {
	 *     store.loadDiagram(id, title, toReactFlowNodes(data.nodes), toReactFlowEdges(data.edges), data.viewport, v);
	 *   });
	 * }, [sync, id, title]);
	 * ```
	 */
	onRemoteChange?(callback: (graphData: GraphData, version: number) => void): () => void;
}
