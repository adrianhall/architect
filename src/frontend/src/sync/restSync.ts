import type { GraphData } from "@architect/shared";
import type { DiagramSync, SaveResult } from "./types";

/**
 * Creates a REST-based `DiagramSync` implementation that saves diagrams by
 * sending a full `PUT /api/diagrams/:id` request.
 *
 * This is the MVP sync implementation. The `DiagramSync` abstraction allows a
 * future WebSocket/Durable-Object implementation to be swapped in later without
 * touching canvas components or the diagram store.
 *
 * The `save` method:
 * - Returns `{ success: true, version }` on HTTP 2xx.
 * - Returns `{ success: false, conflict: true, serverVersion }` on HTTP 409.
 * - Returns `{ success: false, error }` on any other HTTP error.
 * - Returns `{ success: false, error }` if the network request throws (offline,
 *   CORS, etc.).
 *
 * @param baseUrl - Optional base URL prefix for all API requests. Defaults to
 *   `""` (same origin). Pass a full URL in tests to target a mock server.
 * @returns A `DiagramSync` object whose `save` method performs debounced
 *   full-graph PUT requests.
 *
 * @example
 * ```ts
 * // Production — same origin
 * const restSync = createRestSync();
 *
 * // Test — target a mock server
 * const mockSync = createRestSync("http://localhost:3000");
 * ```
 */
export function createRestSync(baseUrl = ""): DiagramSync {
	return {
		/**
		 * Sends a full-graph PUT request to `PUT /api/diagrams/:diagramId`.
		 *
		 * The request body is `{ title, graph_data, version }`. The server
		 * increments the version on success; the new version is returned in
		 * the response body and must be stored via `markClean`.
		 *
		 * @param diagramId - The ULID of the diagram to save.
		 * @param title - The current diagram title.
		 * @param graphData - The full graph state (nodes, edges, viewport).
		 * @param version - The client's current version for optimistic locking.
		 * @returns A `SaveResult` describing the outcome.
		 */
		async save(diagramId: string, title: string, graphData: GraphData, version: number): Promise<SaveResult> {
			try {
				const response = await fetch(`${baseUrl}/api/diagrams/${diagramId}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						title,
						graph_data: graphData,
						version,
					}),
				});

				if (response.ok) {
					const body = (await response.json()) as { data: { version: number } };
					return { success: true, version: body.data.version };
				}

				if (response.status === 409) {
					const errorBody = (await response.json().catch(() => null)) as {
						error?: { details?: { serverVersion?: number } };
					} | null;
					const serverVersion = errorBody?.error?.details?.serverVersion ?? version + 1;
					return {
						success: false,
						conflict: true,
						serverVersion,
					};
				}

				// Any other HTTP error — extract message if available.
				const errorBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
				return {
					success: false,
					error: errorBody?.error?.message ?? `Save failed with status ${response.status}`,
				};
			} catch (err) {
				// Network-level failure (offline, CORS, DNS, etc.)
				return {
					success: false,
					error: err instanceof Error ? err.message : "Network error",
				};
			}
		},
	};
}
