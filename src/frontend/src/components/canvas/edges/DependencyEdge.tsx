import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";
import { memo } from "react";

/**
 * Custom React Flow edge component for `dependency` connections.
 *
 * Renders as a thin solid bezier curve (`strokeWidth: 1`) in a light slate
 * colour (`#94a3b8`) to visually convey a lightweight, informational
 * relationship rather than an active data flow. Dependency edges indicate that
 * one node relies on another at build time, configuration time, or deployment
 * time (e.g., a Worker image that depends on an R2 bucket being provisioned
 * first).
 *
 * Being thinner and lighter than the default `data-flow` edge makes dependency
 * edges visually recede, avoiding clutter on diagrams with many connections.
 *
 * The edge turns blue (`#3b82f6`) when selected. An optional label
 * (`data.label`) is rendered centred on the path.
 *
 * @param props - Standard React Flow `EdgeProps`, including geometry props,
 *   selection state (`selected`), and optional label (`data.label`).
 *
 * @example
 * ```tsx
 * // Registered in edgeTypes.ts — not rendered directly:
 * const edgeTypes = { dependency: DependencyEdge };
 * ```
 */
function DependencyEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
	selected,
	markerEnd,
}: EdgeProps) {
	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	return (
		<>
			<BaseEdge
				id={id}
				path={edgePath}
				markerEnd={markerEnd}
				style={{
					stroke: selected ? "#3b82f6" : "#94a3b8",
					strokeWidth: 1,
					strokeDasharray: "none",
				}}
			/>
			{data?.label && (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan pointer-events-auto absolute rounded bg-white px-1.5 py-0.5 text-xs shadow dark:bg-gray-800"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
						}}
					>
						{data.label as string}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}

export default memo(DependencyEdge);
