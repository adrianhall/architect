import { useMemo } from "react";
import { useDiagramStore } from "@/stores/diagram";
import { useUIStore } from "@/stores/ui";
import EdgeProperties from "./EdgeProperties";
import NodeProperties from "./NodeProperties";

/**
 * Right-side properties panel for the architecture editor.
 *
 * Renders conditionally based on the current selection in the UI store:
 *
 * - **Node selected**: renders `NodeProperties` with a "Node Properties" header.
 * - **Edge selected**: renders `EdgeProperties` with an "Edge Properties" header.
 * - **Nothing selected**: renders a centered hint message prompting the user to
 *   select an element.
 *
 * The panel does not own selection state — it reads `selectedNodeId` and
 * `selectedEdgeId` from `useUIStore` and looks up the corresponding element in
 * `useDiagramStore`. When the selected element is removed from the diagram
 * (e.g. via the keyboard shortcut), the panel automatically falls back to the
 * "nothing selected" state because the lookup returns `undefined`.
 *
 * @returns The properties panel content, or a hint when nothing is selected.
 *
 * @example
 * ```tsx
 * // Rendered as a fixed-width sidebar in the Editor layout.
 * <aside className="w-72 shrink-0 border-l bg-background">
 *   <PropertiesPanel />
 * </aside>
 * ```
 */
export default function PropertiesPanel() {
	const selectedNodeId = useUIStore((s) => s.selectedNodeId);
	const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
	const nodes = useDiagramStore((s) => s.nodes);
	const edges = useDiagramStore((s) => s.edges);

	const selectedNode = useMemo(
		() => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null),
		[selectedNodeId, nodes],
	);

	const selectedEdge = useMemo(
		() => (selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null),
		[selectedEdgeId, edges],
	);

	// Nothing is selected — show an informational hint.
	if (!selectedNode && !selectedEdge) {
		return (
			<div className="flex h-full items-center justify-center p-4">
				<p className="text-center text-sm text-muted-foreground">Select a node or edge to view its properties</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="border-b px-4 py-2">
				<h2 className="text-sm font-semibold">{selectedNode ? "Node Properties" : "Edge Properties"}</h2>
			</div>
			<div className="flex-1 overflow-y-auto p-4">
				{selectedNode && <NodeProperties node={selectedNode} />}
				{selectedEdge && <EdgeProperties edge={selectedEdge} />}
			</div>
		</div>
	);
}
