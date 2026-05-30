/**
 * LayoutButton — toolbar control for triggering ELK auto-layout.
 *
 * Renders a shadcn `Button` inside a `DropdownMenu` that offers two layout
 * directions: Top-to-Bottom and Left-to-Right. While a layout is in progress
 * the button is disabled and shows a spinning `Loader2` icon; otherwise it
 * shows `LayoutDashboard`.
 *
 * The actual layout computation runs in a background Web Worker via the
 * {@link useAutoLayout} hook, so the canvas remains interactive during
 * computation.
 *
 * @example
 * ```tsx
 * // In a toolbar:
 * <div className="flex items-center gap-2 p-2 border-b">
 *   <LayoutButton />
 * </div>
 * ```
 */
import { LayoutDashboard, Loader2 } from "lucide-react";
import { useAutoLayout } from "../../hooks/useAutoLayout";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

/**
 * Toolbar button that triggers ELK auto-layout with a direction dropdown.
 *
 * Uses the {@link useAutoLayout} hook to run layout off the main thread.
 * The button is disabled and shows a loading spinner while `isLayouting` is
 * `true`. Once layout finishes, node positions in the Zustand diagram store
 * are updated as a single batch undo/redo step.
 *
 * @returns A dropdown-menu trigger button wired to the ELK layout hook.
 */
export function LayoutButton() {
	const { applyLayout, isLayouting } = useAutoLayout();

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
				<DropdownMenuItem onSelect={() => applyLayout("TB")}>Top to Bottom</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => applyLayout("LR")}>Left to Right</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
