import type { EdgeTypes } from "@xyflow/react";
import BindingEdge from "./edges/BindingEdge";
import DataFlowEdge from "./edges/DataFlowEdge";
import DependencyEdge from "./edges/DependencyEdge";
import TriggerEdge from "./edges/TriggerEdge";

/**
 * React Flow `EdgeTypes` registry for the architecture canvas.
 *
 * Maps each `DiagramEdge.type` string to its custom React component. Pass this
 * object to the `edgeTypes` prop of `<ReactFlow>` so that edges loaded from
 * the API render with the correct visual style automatically.
 *
 * | Key | Component | Visual style |
 * |-----|-----------|--------------|
 * | `"data-flow"` | {@link DataFlowEdge} | Solid line, animated dot, slate colour |
 * | `"binding"` | {@link BindingEdge} | Dashed line (`8 4`), purple colour |
 * | `"trigger"` | {@link TriggerEdge} | Dotted line (`3 3`), amber, arrowhead |
 * | `"dependency"` | {@link DependencyEdge} | Thin solid line, light slate colour |
 *
 * The object is defined at module scope (not inside a component) so it is
 * stable across renders and does not cause React Flow to re-mount all edges on
 * every parent render.
 *
 * @example
 * ```tsx
 * import { edgeTypes } from "@/components/canvas/edgeTypes";
 *
 * function Canvas() {
 *   return <ReactFlow edgeTypes={edgeTypes} ... />;
 * }
 * ```
 */
export const edgeTypes: EdgeTypes = {
	"data-flow": DataFlowEdge,
	binding: BindingEdge,
	trigger: TriggerEdge,
	dependency: DependencyEdge,
};
