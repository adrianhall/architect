import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";
import { memo } from "react";

/**
 * Custom React Flow edge component for `binding` connections.
 *
 * Renders as a dashed bezier curve (`strokeDasharray: "8 4"`) in purple
 * (`#8b5cf6`) to visually distinguish it from solid data-flow edges. Bindings
 * represent configuration linkages between nodes (e.g., a Worker binding to a
 * KV namespace or D1 database) rather than runtime data transfer.
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
 * const edgeTypes = { binding: BindingEdge };
 * ```
 */
function BindingEdge({
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
					stroke: selected ? "#3b82f6" : "#8b5cf6",
					strokeWidth: 2,
					strokeDasharray: "8 4",
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

export default memo(BindingEdge);
