/**
 * Viewport state describing the current pan/zoom position of the canvas.
 * Stored as part of {@link GraphData} so the user's view is restored when
 * reopening a diagram.
 */
export interface Viewport {
	/** Horizontal pan offset in canvas units. */
	x: number;
	/** Vertical pan offset in canvas units. */
	y: number;
	/** Zoom level; 1.0 = 100%, 0.5 = 50%, 2.0 = 200%. */
	zoom: number;
}

/**
 * A node on the architecture diagram canvas.
 *
 * Nodes represent individual Cloudflare services or infrastructure components.
 * The `type` field maps to a catalog service `typeId` (e.g. `"workers"`,
 * `"d1"`, `"r2"`) and determines which icon and default styles are used.
 *
 * @example
 * ```ts
 * const node: DiagramNode = {
 *   id: "01HQ7...",
 *   type: "workers",
 *   position: { x: 100, y: 200 },
 *   data: { label: "API Worker", description: "Handles auth and routing" },
 * };
 * ```
 */
export interface DiagramNode {
	/** Unique node ID (ULID). */
	id: string;
	/** Catalog service type ID, e.g. `"workers"`, `"d1"`, `"r2"`. */
	type: string;
	/** Canvas position in canvas-coordinate units. */
	position: { x: number; y: number };
	/** Node metadata displayed in the canvas and properties panel. */
	data: {
		/** Display label; 1–80 characters. */
		label: string;
		/** Optional longer description; ≤500 characters. */
		description?: string;
		/**
		 * Hex colour override for the node accent. When absent or `undefined`,
		 * the category default colour is used.
		 */
		accentColor?: string;
	};
}

/**
 * The semantic type of a connection between two diagram nodes.
 *
 * - `"data-flow"` — data moves from source to target at runtime.
 * - `"binding"` — a Workers binding (KV, D1, R2, etc.).
 * - `"trigger"` — source triggers target (e.g. Cron → Worker, Queue → Worker).
 * - `"dependency"` — target depends on source conceptually but no data flows.
 */
export type EdgeType = "data-flow" | "binding" | "trigger" | "dependency";

/**
 * A directed connection between two nodes on the diagram.
 *
 * Edges are stored alongside nodes in {@link GraphData} and serialised to
 * `diagrams.graph_data`. Optional `sourceHandle` / `targetHandle` identify
 * named connection points on nodes (used when a node exposes multiple ports).
 *
 * @example
 * ```ts
 * const edge: DiagramEdge = {
 *   id: "01HQ8...",
 *   source: "worker-node-id",
 *   target: "kv-node-id",
 *   type: "binding",
 *   data: { label: "CACHE", protocol: "binding" },
 * };
 * ```
 */
export interface DiagramEdge {
	/** Unique edge ID (ULID). */
	id: string;
	/** Source node ID. */
	source: string;
	/** Target node ID. */
	target: string;
	/** Source handle ID — identifies the specific port on the source node. */
	sourceHandle?: string;
	/** Target handle ID — identifies the specific port on the target node. */
	targetHandle?: string;
	/** The semantic nature of this connection. */
	type: EdgeType;
	/** Optional edge metadata displayed in the properties panel and as a label. */
	data?: {
		/** Optional edge label; ≤80 characters. */
		label?: string;
		/** Transport protocol, e.g. `"HTTP"`, `"gRPC"`, `"binding"`. */
		protocol?: string;
		/** Optional description. */
		description?: string;
	};
}

/**
 * Complete graph data serialised to `diagrams.graph_data` in D1.
 *
 * This is the canonical in-memory and wire format for a diagram. Both the
 * worker API and the React Flow canvas consume this type directly.
 *
 * @example
 * ```ts
 * const graph: GraphData = {
 *   nodes: [workerNode, dbNode],
 *   edges: [workerToDbEdge],
 *   viewport: { x: 0, y: 0, zoom: 1 },
 * };
 * const json = JSON.stringify(graph); // stored in diagrams.graph_data
 * ```
 */
export interface GraphData {
	/** All nodes on the canvas. */
	nodes: DiagramNode[];
	/** All edges (connections) on the canvas. */
	edges: DiagramEdge[];
	/**
	 * Last-saved viewport state. Optional — defaults to origin with zoom 1 when
	 * absent.
	 */
	viewport?: Viewport;
}
