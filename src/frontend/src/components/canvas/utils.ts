import type { CatalogData, DiagramEdge, DiagramNode } from "@architect/shared";
import type { Edge, Node } from "@xyflow/react";

/**
 * Fallback gray color used when a node's service type is not found in the
 * catalog, or when the service's category has no color defined.
 */
const FALLBACK_COLOR = "#6b7280";

/**
 * Converts an API `DiagramNode` to a React Flow `Node`, enriching it with
 * icon and category data from the service catalog.
 *
 * The returned node uses `type: "cloudflareService"` so React Flow renders
 * it with `CloudflareServiceNode`. The original catalog `typeId` is preserved
 * in `data.serviceTypeId` so `fromReactFlowNode` can round-trip the value
 * back to the API format.
 *
 * If the service or category is not found in the catalog, sensible fallbacks
 * are used: an empty icon URL and the neutral gray `#6b7280`.
 *
 * @param diagramNode - The `DiagramNode` from the API's `graph_data.nodes`.
 * @param catalog - Full `CatalogData` from `GET /api/catalog`, used to look
 *   up the service's icon path and category color.
 * @returns A React Flow `Node` ready to add to the canvas.
 *
 * @example
 * ```ts
 * const rfNode = toReactFlowNode(apiNode, catalog);
 * // rfNode.type === "cloudflareService"
 * // rfNode.data.iconUrl === "/catalog/icons/workers.svg"
 * // rfNode.data.categoryColor === "#2563eb"
 * ```
 */
export function toReactFlowNode(diagramNode: DiagramNode, catalog: CatalogData): Node {
	const service = catalog.services.find((s) => s.typeId === diagramNode.type);
	const category = catalog.categories.find((c) => c.id === service?.category);

	return {
		id: diagramNode.id,
		type: "cloudflareService",
		position: diagramNode.position,
		data: {
			label: diagramNode.data.label,
			description: diagramNode.data.description,
			accentColor: diagramNode.data.accentColor,
			serviceTypeId: diagramNode.type,
			iconUrl: service ? `/catalog/icons/${service.iconPath}` : "",
			categoryColor: category?.color ?? FALLBACK_COLOR,
		},
	};
}

/**
 * Converts an API `DiagramEdge` to a React Flow `Edge`.
 *
 * The `type` field is preserved as-is (e.g. `"data-flow"`, `"binding"`).
 * Custom edge components for these types are registered in ISSUE-14. Until
 * then, React Flow renders them with its default straight-line edge.
 *
 * @param diagramEdge - The `DiagramEdge` from the API's `graph_data.edges`.
 * @returns A React Flow `Edge` ready to add to the canvas.
 *
 * @example
 * ```ts
 * const rfEdge = toReactFlowEdge(apiEdge);
 * // rfEdge.id === apiEdge.id
 * // rfEdge.source === apiEdge.source
 * ```
 */
export function toReactFlowEdge(diagramEdge: DiagramEdge): Edge {
	return {
		id: diagramEdge.id,
		source: diagramEdge.source,
		target: diagramEdge.target,
		sourceHandle: diagramEdge.sourceHandle,
		targetHandle: diagramEdge.targetHandle,
		type: diagramEdge.type,
		data: diagramEdge.data ?? {},
	};
}

/**
 * Converts a React Flow `Node` back to an API `DiagramNode` for persistence.
 *
 * Strips React Flow–specific enrichment fields (`iconUrl`, `categoryColor`)
 * and preserves only the fields that belong in `diagram.graph_data`. The
 * catalog `typeId` is restored from `data.serviceTypeId`.
 *
 * @param node - A React Flow `Node` from the diagram store.
 * @returns A `DiagramNode` suitable for inclusion in `graph_data.nodes`.
 *
 * @example
 * ```ts
 * const apiNode = fromReactFlowNode(storeNode);
 * // apiNode.type === "workers"
 * // apiNode.data.label === "API Worker"
 * ```
 */
export function fromReactFlowNode(node: Node): DiagramNode {
	return {
		id: node.id,
		type: node.data.serviceTypeId as string,
		position: node.position,
		data: {
			label: node.data.label as string,
			description: node.data.description as string | undefined,
			accentColor: node.data.accentColor as string | undefined,
		},
	};
}

/**
 * Converts a React Flow `Edge` back to an API `DiagramEdge` for persistence.
 *
 * @param edge - A React Flow `Edge` from the diagram store.
 * @returns A `DiagramEdge` suitable for inclusion in `graph_data.edges`.
 *
 * @example
 * ```ts
 * const apiEdge = fromReactFlowEdge(storeEdge);
 * // apiEdge.type === "binding"
 * ```
 */
export function fromReactFlowEdge(edge: Edge): DiagramEdge {
	return {
		id: edge.id,
		source: edge.source,
		target: edge.target,
		sourceHandle: edge.sourceHandle ?? undefined,
		targetHandle: edge.targetHandle ?? undefined,
		type: edge.type as DiagramEdge["type"],
		data: edge.data as DiagramEdge["data"],
	};
}
