/**
 * Pure ELK layout computation logic, extracted from the Web Worker so that it
 * can be unit-tested without a real `Worker` runtime.
 *
 * The Web Worker (`elk-layout.worker.ts`) is a thin wrapper that calls
 * `computeLayout` and posts the result. Tests call `computeLayout` directly.
 */
import { getValueOrDefault } from "@architect/shared";
import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

// ---------------------------------------------------------------------------
// Shared types — exported so the worker and useAutoLayout hook can import them
// ---------------------------------------------------------------------------

/**
 * A single node descriptor for the layout request.
 *
 * Mirrors the subset of a React Flow `Node` that ELK needs: identity,
 * starting position (for future delta calculations), and dimensions.
 */
export interface LayoutNode {
	/** Unique node identifier — must match the React Flow node id. */
	id: string;
	/** Current canvas position of the node (used to detect no-change). */
	position: { x: number; y: number };
	/** Node width in canvas pixels. */
	width: number;
	/** Node height in canvas pixels. */
	height: number;
}

/**
 * A single edge descriptor for the layout request.
 *
 * Only the directional relationship is needed; ELK uses it to rank nodes
 * in the layered algorithm.
 */
export interface LayoutEdge {
	/** Unique edge identifier — must match the React Flow edge id. */
	id: string;
	/** ID of the source node. */
	source: string;
	/** ID of the target node. */
	target: string;
}

/**
 * Message sent from the canvas to the Web Worker to request a layout.
 */
export interface LayoutRequest {
	/** Nodes to lay out. */
	nodes: LayoutNode[];
	/** Edges that define the graph topology. */
	edges: LayoutEdge[];
	/**
	 * Layout direction.
	 * - `"TB"` — Top-to-Bottom (vertical hierarchy).
	 * - `"LR"` — Left-to-Right (horizontal hierarchy).
	 */
	direction: "TB" | "LR";
}

/**
 * Successful layout result posted back by the Web Worker.
 */
export interface LayoutResult {
	/** Discriminant that identifies this as a success response. */
	type: "result";
	/** Computed positions for each node, keyed by the original node id. */
	positions: Array<{
		/** The id of the node this position applies to. */
		nodeId: string;
		/** New canvas position returned by ELK. */
		position: { x: number; y: number };
	}>;
}

/**
 * Error response posted back by the Web Worker when ELK throws.
 */
export interface LayoutError {
	/** Discriminant that identifies this as an error response. */
	type: "error";
	/** Human-readable error description. */
	message: string;
}

// ---------------------------------------------------------------------------
// Pure layout function
// ---------------------------------------------------------------------------

/**
 * Runs the ELK `layered` algorithm over the provided nodes and edges and
 * returns the computed node positions.
 *
 * This function is intentionally free of Web Worker or DOM APIs so it can be
 * called directly in unit tests (jsdom does not support `Worker`). The worker
 * delegates to this function and posts its return value.
 *
 * ELK options used:
 * - `elk.algorithm: "layered"` — the standard hierarchical layout algorithm.
 * - `elk.direction: "DOWN"|"RIGHT"` — controls the primary layout axis.
 * - `elk.spacing.nodeNode: "50"` — minimum gap between sibling nodes.
 * - `elk.layered.spacing.nodeNodeBetweenLayers: "80"` — gap between layers.
 * - `elk.spacing.edgeNode: "30"` — space between edges and nodes.
 * - `elk.layered.crossingMinimization.strategy: "LAYER_SWEEP"` — produces
 *   fewer edge crossings at the cost of slightly more computation time.
 *
 * @param nodes - Node descriptors with dimensions required by ELK.
 * @param edges - Edge descriptors that define the graph topology.
 * @param direction - `"TB"` for top-to-bottom or `"LR"` for left-to-right.
 * @returns Array of `{ nodeId, position }` objects in the same order as the
 *   ELK output. Empty array if `nodes` is empty.
 *
 * @example
 * ```ts
 * const positions = await computeLayout(
 *   [{ id: "a", position: { x: 0, y: 0 }, width: 160, height: 100 }],
 *   [],
 *   "TB"
 * );
 * // positions[0] === { nodeId: "a", position: { x: 0, y: 0 } }
 * ```
 */
export async function computeLayout(
	nodes: LayoutNode[],
	edges: LayoutEdge[],
	direction: "TB" | "LR",
): Promise<LayoutResult["positions"]> {
	const elkGraph = {
		id: "root",
		layoutOptions: {
			"elk.algorithm": "layered",
			"elk.direction": direction === "TB" ? "DOWN" : "RIGHT",
			"elk.spacing.nodeNode": "50",
			"elk.layered.spacing.nodeNodeBetweenLayers": "80",
			"elk.spacing.edgeNode": "30",
			"elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
		},
		children: nodes.map((node) => ({
			id: node.id,
			width: node.width,
			height: node.height,
		})),
		edges: edges.map((edge) => ({
			id: edge.id,
			sources: [edge.source],
			targets: [edge.target],
		})),
	};

	const layout = await elk.layout(elkGraph);

	return getValueOrDefault(
		layout.children?.map((child) => ({
			nodeId: child.id,
			position: {
				x: getValueOrDefault(child.x, 0),
				y: getValueOrDefault(child.y, 0),
			},
		})),
		[],
	);
}
