import { getValueOrDefault } from "@architect/shared";
import type { Edge } from "@xyflow/react";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDiagramStore } from "@/stores/diagram";

/**
 * Descriptor for a single edge type option shown in the edge type selector.
 */
interface EdgeTypeOption {
	/** React Flow edge type identifier (matches `edge.type`). */
	readonly id: string;
	/** Human-readable label shown in the selector button. */
	readonly label: string;
	/** SVG line style used by `EdgeStyleIndicator`. */
	readonly style: "solid" | "dashed" | "dotted" | "thin";
	/** Short description of the visual appearance shown as sub-text. */
	readonly description: string;
}

/**
 * All four supported edge types for the architecture canvas.
 *
 * Order determines the visual order in the edge type selector.
 */
const EDGE_TYPES: readonly EdgeTypeOption[] = [
	{
		id: "data-flow",
		label: "Data Flow",
		style: "solid",
		description: "Solid line with animated dots",
	},
	{
		id: "binding",
		label: "Binding",
		style: "dashed",
		description: "Dashed line",
	},
	{
		id: "trigger",
		label: "Trigger",
		style: "dotted",
		description: "Dotted line with arrow",
	},
	{
		id: "dependency",
		label: "Dependency",
		style: "thin",
		description: "Thin solid line",
	},
] as const;

/**
 * Props for the `EdgeStyleIndicator` helper component.
 */
interface EdgeStyleIndicatorProps {
	/**
	 * Stroke style of the indicator line; matches one of the style variants
	 * defined on `EdgeTypeOption`.
	 */
	style: "solid" | "dashed" | "dotted" | "thin";
	/** When `true`, uses `currentColor` instead of a muted grey for the stroke. */
	selected: boolean;
}

/**
 * Small SVG snippet that visually previews the line style for an edge type.
 *
 * Renders a 32×16 SVG with a horizontal line segment styled to match the
 * given edge type. The `trigger` style also renders an arrowhead polygon at
 * the right end of the line.
 *
 * @param props - Component props.
 * @param props.style - The line style to preview.
 * @param props.selected - Whether to apply the highlighted (selected) color.
 *
 * @example
 * ```tsx
 * <EdgeStyleIndicator style="dashed" selected={false} />
 * ```
 */
function EdgeStyleIndicator({ style, selected }: EdgeStyleIndicatorProps) {
	const color = selected ? "currentColor" : "#94a3b8";

	const dashArrayMap: Record<string, string> = {
		solid: "none",
		dashed: "8 4",
		dotted: "3 3",
		thin: "none",
	};

	const strokeWidth = style === "thin" ? 1 : 2;

	return (
		<svg width="32" height="16" viewBox="0 0 32 16" className="shrink-0" aria-hidden="true">
			<line
				x1="0"
				y1="8"
				x2="32"
				y2="8"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeDasharray={getValueOrDefault(dashArrayMap[style], "none")}
			/>
			{style === "dotted" && <polygon points="28,4 32,8 28,12" fill={color} />}
		</svg>
	);
}

/**
 * Props for the `EdgeProperties` component.
 */
interface EdgePropertiesProps {
	/**
	 * The React Flow edge whose properties are being displayed and edited.
	 *
	 * The `type` field is read from the top-level edge object; `label`,
	 * `protocol`, and `description` are read from `edge.data`.
	 */
	edge: Edge;
}

/**
 * Properties form for a selected canvas edge.
 *
 * Displays an edge type selector (showing all 4 types with visual line
 * indicators), and editable fields for label (≤80 chars), protocol, and
 * description. All inputs are controlled — their values come directly from the
 * edge object and every change is immediately flushed to the Zustand diagram
 * store.
 *
 * Edge type changes use `updateEdge` (which writes to the top-level `type`
 * property on the edge). Label, protocol, and description changes use
 * `updateEdgeData` (which merges into `edge.data`).
 *
 * @param props - Component props.
 * @param props.edge - The React Flow edge to display and edit.
 *
 * @example
 * ```tsx
 * // Rendered inside PropertiesPanel when an edge is selected.
 * <EdgeProperties edge={selectedEdge} />
 * ```
 */
export default function EdgeProperties({ edge }: EdgePropertiesProps) {
	const updateEdge = useDiagramStore((s) => s.updateEdge);
	const updateEdgeData = useDiagramStore((s) => s.updateEdgeData);

	/** Sets the edge's top-level `type` to the selected type ID. */
	const handleTypeChange = useCallback(
		(typeId: string) => {
			updateEdge(edge.id, { type: typeId });
		},
		[edge.id, updateEdge],
	);

	/** Updates the edge label on every keystroke; rejects values over 80 chars. */
	const handleLabelChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			if (value.length <= 80) {
				updateEdgeData(edge.id, { label: value });
			}
		},
		[edge.id, updateEdgeData],
	);

	/** Updates the edge protocol field on every keystroke (no length limit). */
	const handleProtocolChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			updateEdgeData(edge.id, { protocol: e.target.value });
		},
		[edge.id, updateEdgeData],
	);

	/** Updates the edge description field on every keystroke (no length limit). */
	const handleDescriptionChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			updateEdgeData(edge.id, { description: e.target.value });
		},
		[edge.id, updateEdgeData],
	);

	return (
		<div className="flex flex-col gap-4">
			{/* Edge type selector */}
			<div className="flex flex-col gap-1.5">
				<Label>Edge Type</Label>
				<div className="flex flex-col gap-1">
					{EDGE_TYPES.map((type) => (
						<button
							key={type.id}
							type="button"
							className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
								edge.type === type.id ? "border-primary bg-primary/5 font-medium" : "border-transparent hover:bg-accent"
							}`}
							onClick={() => handleTypeChange(type.id)}
						>
							<EdgeStyleIndicator style={type.style} selected={edge.type === type.id} />
							<div>
								<span>{type.label}</span>
								<span className="ml-2 text-xs text-muted-foreground">{type.description}</span>
							</div>
						</button>
					))}
				</div>
			</div>

			{/* Label */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="edge-label">Label</Label>
				<Input
					id="edge-label"
					value={(edge.data?.label as string) ?? ""}
					onChange={handleLabelChange}
					maxLength={80}
					placeholder="e.g., HTTP, gRPC"
				/>
			</div>

			{/* Protocol */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="edge-protocol">Protocol</Label>
				<Input
					id="edge-protocol"
					value={(edge.data?.protocol as string) ?? ""}
					onChange={handleProtocolChange}
					placeholder="e.g., HTTPS, WebSocket"
				/>
			</div>

			{/* Description */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="edge-description">Description</Label>
				<Textarea
					id="edge-description"
					value={(edge.data?.description as string) ?? ""}
					onChange={handleDescriptionChange}
					placeholder="Optional description of this connection"
					rows={3}
				/>
			</div>
		</div>
	);
}
