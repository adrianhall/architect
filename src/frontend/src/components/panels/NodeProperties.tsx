import type { Node } from "@xyflow/react";
import { ExternalLink, RotateCcw } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useCatalog } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDiagramStore } from "@/stores/diagram";

/**
 * Props for the `NodeProperties` component.
 */
interface NodePropertiesProps {
	/**
	 * The React Flow node whose properties are being displayed and edited.
	 *
	 * All editable fields (label, description, accentColor) are read from
	 * `node.data` and written back to the diagram store via `updateNodeData`.
	 */
	node: Node;
}

/**
 * Properties form for a selected canvas node.
 *
 * Displays all editable fields for a Cloudflare service node: label (1–80
 * chars), description (≤500 chars), and an accent color override with a reset
 * button. Also shows the official service name from the catalog as read-only
 * text, and a documentation link button when the service has a `docUrl`.
 *
 * All inputs are controlled — their values come from `node.data` and every
 * change is immediately flushed to the Zustand diagram store via
 * `updateNodeData`. There is no "Save" button.
 *
 * @param props - Component props.
 * @param props.node - The React Flow node to display and edit.
 *
 * @example
 * ```tsx
 * // Rendered inside PropertiesPanel when a node is selected.
 * <NodeProperties node={selectedNode} />
 * ```
 */
export default function NodeProperties({ node }: NodePropertiesProps) {
	const updateNodeData = useDiagramStore((s) => s.updateNodeData);
	const { data: catalog } = useCatalog();

	/**
	 * The catalog service entry for this node's `serviceTypeId`, if found.
	 * Used to display the official name and documentation link.
	 */
	const service = useMemo(
		() => catalog?.services.find((s) => s.typeId === node.data.serviceTypeId),
		[catalog, node.data.serviceTypeId],
	);

	/**
	 * The catalog category for this service, used to derive the default accent
	 * color when no override is set.
	 */
	const category = useMemo(() => catalog?.categories.find((c) => c.id === service?.category), [catalog, service]);

	/** Fallback color when the category has no color or the category is unknown. */
	const categoryDefaultColor = category?.color ?? "#6b7280";

	/** Updates the node's label on every keystroke; rejects values over 80 chars. */
	const handleLabelChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			if (value.length <= 80) {
				updateNodeData(node.id, { label: value });
			}
		},
		[node.id, updateNodeData],
	);

	/** Updates the node's description on every keystroke; rejects values over 500 chars. */
	const handleDescriptionChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const value = e.target.value;
			if (value.length <= 500) {
				updateNodeData(node.id, { description: value });
			}
		},
		[node.id, updateNodeData],
	);

	/** Updates the node's accent color override whenever the color picker changes. */
	const handleAccentColorChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			updateNodeData(node.id, { accentColor: e.target.value });
		},
		[node.id, updateNodeData],
	);

	/**
	 * Resets the accent color to the category default by setting `accentColor`
	 * to `undefined`. The node renderer interprets `undefined` as "use category
	 * color".
	 */
	const handleResetColor = useCallback(() => {
		updateNodeData(node.id, { accentColor: undefined });
	}, [node.id, updateNodeData]);

	/** Opens the service documentation URL in a new tab. */
	const handleOpenDocs = useCallback(() => {
		if (service?.docUrl) {
			window.open(service.docUrl, "_blank", "noopener,noreferrer");
		}
	}, [service]);

	const currentLabel = (node.data.label as string) ?? "";
	const currentDescription = (node.data.description as string) ?? "";
	const currentAccentColor = node.data.accentColor as string | undefined;

	return (
		<div className="flex flex-col gap-4">
			{/* Service type (read-only) */}
			<div>
				<Label className="text-xs text-muted-foreground">Service Type</Label>
				<p className="text-sm font-medium">{service?.officialName ?? (node.data.serviceTypeId as string)}</p>
			</div>

			{/* Label */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="node-label">Label</Label>
				<Input
					id="node-label"
					value={currentLabel}
					onChange={handleLabelChange}
					maxLength={80}
					placeholder="Node label"
				/>
				<p className="text-xs text-muted-foreground">{currentLabel.length}/80</p>
			</div>

			{/* Description */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="node-description">Description</Label>
				<Textarea
					id="node-description"
					value={currentDescription}
					onChange={handleDescriptionChange}
					maxLength={500}
					placeholder="Optional description"
					rows={3}
				/>
				<p className="text-xs text-muted-foreground">{currentDescription.length}/500</p>
			</div>

			{/* Accent color */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="node-color">Accent Color</Label>
				<div className="flex items-center gap-2">
					<input
						id="node-color"
						type="color"
						value={currentAccentColor ?? categoryDefaultColor}
						onChange={handleAccentColorChange}
						className="size-8 cursor-pointer rounded border"
					/>
					<span className="text-xs text-muted-foreground">{currentAccentColor ?? categoryDefaultColor}</span>
					{currentAccentColor !== undefined && (
						<Button variant="ghost" size="sm" onClick={handleResetColor} title="Reset to category default">
							<RotateCcw className="size-3.5" aria-hidden="true" />
							<span className="sr-only">Reset color</span>
						</Button>
					)}
				</div>
			</div>

			{/* Documentation link */}
			{service?.docUrl && (
				<Button variant="outline" size="sm" className="w-full" onClick={handleOpenDocs}>
					<ExternalLink className="size-4" aria-hidden="true" />
					Documentation
				</Button>
			)}
		</div>
	);
}
