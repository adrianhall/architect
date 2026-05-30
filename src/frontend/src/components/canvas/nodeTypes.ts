import type { NodeTypes } from "@xyflow/react";
import CloudflareServiceNode from "./CloudflareServiceNode";

/**
 * React Flow `NodeTypes` registry for the architecture canvas.
 *
 * Maps the string key `"cloudflareService"` to the {@link CloudflareServiceNode}
 * component. Pass this object to the `nodeTypes` prop of `<ReactFlow>` so that
 * nodes with `type: "cloudflareService"` are rendered using the custom component
 * rather than React Flow's built-in default node.
 *
 * All diagram nodes use this single node type. The specific Cloudflare service
 * is identified by `node.data.serviceTypeId` (the catalog `typeId`), not by
 * the React Flow node type key.
 *
 * The object is defined outside any component to prevent recreation on every
 * render, which would force React Flow to re-mount all nodes unnecessarily.
 *
 * @example
 * ```tsx
 * import { nodeTypes } from "@/components/canvas/nodeTypes";
 *
 * function Canvas() {
 *   return <ReactFlow nodeTypes={nodeTypes} ... />;
 * }
 * ```
 */
export const nodeTypes: NodeTypes = {
	cloudflareService: CloudflareServiceNode,
};
