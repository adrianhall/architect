/**
 * LayoutButton — toolbar control for triggering ELK auto-layout.
 *
 * Renders a shadcn `Button` inside a `DropdownMenu` that offers two layout
 * directions: Top-to-Bottom and Left-to-Right. While a layout is in progress
 * the button is disabled and shows a spinning `Loader2` icon; otherwise it
 * shows `LayoutDashboard`.
 *
 * After layout is applied, `fitView` is called to bring all repositioned nodes
 * into view — common when the layout shape or extent changes substantially.
 *
 * @example
 * ```tsx
 * // In a toolbar (must be a descendant of ReactFlowProvider):
 * <div className="flex items-center gap-2 p-2 border-b">
 *   <LayoutButton />
 * </div>
 * ```
 */
import { useReactFlow } from "@xyflow/react";
import { LayoutDashboard, Loader2 } from "lucide-react";
import { useAutoLayout } from "../../hooks/useAutoLayout";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

/**
 * Toolbar button that triggers ELK auto-layout with a direction dropdown.
 *
 * Uses the {@link useAutoLayout} hook to compute and apply the layout, then
 * calls `fitView` so the viewport adjusts to the new node arrangement. The
 * button is disabled and shows a loading spinner while `isLayouting` is
 * `true`. The entire layout (node moves + edge handle updates) is a single
 * undo/redo step.
 *
 * Must be rendered inside a `ReactFlowProvider` to access `fitView`.
 *
 * @returns A dropdown-menu trigger button wired to the ELK layout hook.
 */
export function LayoutButton() {
	const { applyLayout, isLayouting } = useAutoLayout();
	const { fitView } = useReactFlow();

	/**
	 * Applies the chosen layout direction then fits the viewport to all nodes.
	 *
	 * @param direction - `"TB"` for top-to-bottom or `"LR"` for left-to-right.
	 */
	const handleLayout = async (direction: "TB" | "LR") => {
		await applyLayout(direction);
		fitView({ duration: 400, padding: 0.15 });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" disabled={isLayouting} aria-label="Auto-layout">
					{isLayouting ? (
						<>
							<Loader2 className="mr-1 h-4 w-4 animate-spin" />
							Formatting...
						</>
					) : (
						<>
							<LayoutDashboard className="mr-1 h-4 w-4" />
							Layout
						</>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuItem onSelect={() => handleLayout("TB")}>Top to Bottom</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => handleLayout("LR")}>Left to Right</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
