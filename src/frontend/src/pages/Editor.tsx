import { useParams } from "react-router-dom";

/**
 * Editor page — the architecture canvas for a single diagram.
 *
 * Displays a heading that includes the diagram ID extracted from the route
 * parameter (`:id`). This is a placeholder implementation; the full React Flow
 * canvas, node/edge editing, and auto-save are added in ISSUE-13 through
 * ISSUE-19.
 *
 * Must be rendered at the `/editor/:id` route inside a `ProtectedRoute` and
 * `AppShell` layout.
 *
 * @returns The editor placeholder page with the diagram ID in the heading.
 *
 * @example
 * ```tsx
 * <Route path="/editor/:id" element={<Editor />} />
 * // Navigating to /editor/abc-123 renders:
 * // <h1>Editor for diagram abc-123</h1>
 * ```
 */
export function Editor() {
	const { id } = useParams<{ id: string }>();

	return (
		<div>
			<h1 className="text-2xl font-bold">Editor for diagram {id}</h1>
		</div>
	);
}
