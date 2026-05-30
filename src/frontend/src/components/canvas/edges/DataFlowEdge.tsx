import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";
import { memo } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Custom React Flow edge component for `data-flow` connections.
 *
 * Renders as a solid bezier curve with an animated dot that travels along the
 * path to convey that data is actively flowing between two nodes. The animation
 * respects the user's `prefers-reduced-motion` accessibility setting — when
 * reduced motion is preferred the animated dot is not rendered at all.
 *
 * The edge turns blue (`#3b82f6`) when selected, and slate-gray (`#64748b`)
 * when unselected. An optional label (`data.label`) is rendered centred on
 * the path inside a small pill with a white background.
 *
 * This is the **default** edge type. New connections created by dragging from
 * a handle default to `data-flow`.
 *
 * @param props - Standard React Flow `EdgeProps`, including geometry props
 *   (`sourceX`, `sourceY`, `targetX`, `targetY`, `sourcePosition`,
 *   `targetPosition`), selection state (`selected`), and custom data
 *   (`data.label`).
 *
 * @example
 * ```tsx
 * // Registered in edgeTypes.ts — not rendered directly:
 * const edgeTypes = { "data-flow": DataFlowEdge };
 * ```
 */
function DataFlowEdge({
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
	const reducedMotion = useReducedMotion();

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
					stroke: selected ? "#3b82f6" : "#64748b",
					strokeWidth: 2,
					strokeDasharray: "none",
				}}
			/>
			{/* Animated dot — skipped when the user prefers reduced motion. */}
			{!reducedMotion && (
				<circle r="3" fill="#3b82f6">
					<animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
				</circle>
			)}
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

export default memo(DataFlowEdge);
