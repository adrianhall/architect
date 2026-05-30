import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";
import { memo } from "react";

/**
 * Custom React Flow edge component for `trigger` connections.
 *
 * Renders as a dotted bezier curve (`strokeDasharray: "3 3"`) in amber
 * (`#f59e0b`) with a closed arrowhead at the target end. The arrowhead and
 * short dash pattern together convey that one node _activates_ or _invokes_
 * another (e.g., a Cron Trigger firing a Worker, or a Queue consumer being
 * triggered by an incoming message).
 *
 * Two SVG marker definitions are inlined inside the edge's `<defs>` element —
 * one for the default amber colour and one for the selection blue — so the
 * arrowhead always matches the edge stroke without needing to define markers
 * at the ReactFlow component level.
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
 * const edgeTypes = { trigger: TriggerEdge };
 * ```
 */
function TriggerEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
	selected,
}: EdgeProps) {
	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	const strokeColor = selected ? "#3b82f6" : "#f59e0b";
	// Use unique marker IDs per edge instance so concurrent trigger edges
	// each have the correct colour when some are selected and others are not.
	const markerId = `trigger-arrow-${id}-${selected ? "selected" : "default"}`;

	return (
		<>
			{/* Inline marker definition — lives inside the SVG so it renders in
			    the correct SVG namespace context. React Flow renders edge
			    components inside <g> elements within the main SVG. */}
			<defs>
				<marker id={markerId} markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto">
					<path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
				</marker>
			</defs>
			<BaseEdge
				id={id}
				path={edgePath}
				markerEnd={`url(#${markerId})`}
				style={{
					stroke: strokeColor,
					strokeWidth: 2,
					strokeDasharray: "3 3",
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

export default memo(TriggerEdge);
