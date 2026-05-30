import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * Data shape stored on each `cloudflareService` React Flow node.
 *
 * All fields except `iconUrl` and `categoryColor` originate from the diagram's
 * persisted `DiagramNode.data`. The icon URL and category color are resolved
 * at render time by the `toReactFlowNode` converter in `utils.ts`, which looks
 * them up from the service catalog.
 */
export interface CloudflareServiceNodeData {
	/** Display label shown beneath the icon; 1–80 characters. */
	label: string;
	/** Optional longer description shown in the properties panel. */
	description?: string;
	/**
	 * Hex color override for the node border. When absent, `categoryColor` is
	 * used instead. Corresponds to `DiagramNode.data.accentColor`.
	 */
	accentColor?: string;
	/**
	 * Absolute URL pointing to the service's SVG icon, served by the Worker at
	 * `/catalog/icons/<iconPath>`. Empty string when the service is not found
	 * in the catalog.
	 */
	iconUrl: string;
	/**
	 * Hex color from the service's parent category (e.g. `"#2563eb"` for
	 * Developer Platform services). Used as the border color unless `accentColor`
	 * overrides it.
	 */
	categoryColor: string;
	/**
	 * The catalog `typeId` of this node (e.g. `"workers"`, `"d1"`). Preserved
	 * so `fromReactFlowNode` can round-trip back to the API's `DiagramNode.type`.
	 */
	serviceTypeId: string;
}

/**
 * Custom React Flow node that renders a Cloudflare service on the architecture
 * canvas.
 *
 * The node is a fixed 120 × 100 px box divided into two visual zones:
 * - **Top ~67%** — the service's SVG icon, centered.
 * - **Bottom ~33%** — the service's short label, centered and truncated.
 *
 * The border color is taken from the service's category (defaulting to gray)
 * unless an `accentColor` override is set on the node. When the node is
 * selected, a blue ring and shadow appear to indicate focus.
 *
 * Four `Handle` components (top, bottom, left, right) allow edges to connect
 * from any direction. Top and left handles are `type="target"` (incoming);
 * bottom and right handles are `type="source"` (outgoing), establishing a
 * natural left-to-right / top-to-bottom flow direction.
 *
 * The component is wrapped in `React.memo` to prevent unnecessary re-renders
 * when unrelated nodes change selection or position.
 *
 * @param props - React Flow `NodeProps` with `data` typed as
 *   {@link CloudflareServiceNodeData} and `selected` boolean.
 *
 * @example
 * ```tsx
 * // Registered in nodeTypes.ts:
 * export const nodeTypes: NodeTypes = {
 *   cloudflareService: CloudflareServiceNode,
 * };
 *
 * // React Flow renders it automatically for nodes with type="cloudflareService".
 * ```
 */
function CloudflareServiceNode({ data, selected }: NodeProps) {
	const nodeData = data as unknown as CloudflareServiceNodeData;
	const borderColor = nodeData.accentColor ?? nodeData.categoryColor;

	return (
		<div
			className={cn(
				"flex flex-col items-center rounded-lg border-2 bg-white dark:bg-gray-900",
				"w-[120px] h-[100px] overflow-hidden transition-shadow",
				selected && "shadow-lg ring-2 ring-blue-400",
			)}
			style={{ borderColor }}
		>
			{/* Incoming connection handle — top edge */}
			<Handle type="target" position={Position.Top} id="top" />

			{/* Outgoing connection handle — bottom edge */}
			<Handle type="source" position={Position.Bottom} id="bottom" />

			{/* Incoming connection handle — left edge */}
			<Handle type="target" position={Position.Left} id="left" />

			{/* Outgoing connection handle — right edge */}
			<Handle type="source" position={Position.Right} id="right" />

			{/* Icon area — top ~67% of the node */}
			<div className="flex flex-1 items-center justify-center p-2">
				<img
					src={nodeData.iconUrl}
					alt={`${nodeData.label} icon`}
					className="h-10 w-10 object-contain"
					draggable={false}
				/>
			</div>

			{/* Label area — bottom ~33% of the node */}
			<div className="w-full truncate px-1 pb-1 text-center text-xs font-medium leading-tight" title={nodeData.label}>
				{nodeData.label}
			</div>
		</div>
	);
}

export default memo(CloudflareServiceNode);
