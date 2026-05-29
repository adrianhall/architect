/**
 * Root application component for CF-Architect.
 *
 * This is a placeholder that renders the CF-Architect heading with Tailwind
 * design tokens from the `@theme` block in `app.css`. It demonstrates that
 * Tailwind CSS v4 is working correctly (Cloudflare orange via `text-primary`).
 *
 * This component will be replaced in ISSUE-10 with the full router and app
 * shell (layout, sidebar, auth context).
 *
 * @returns A centered heading with the "CF-Architect" application title.
 *
 * @example
 * ```tsx
 * import { App } from "./App";
 * // Renders: full-screen centered heading with Cloudflare orange text
 * <App />
 * ```
 */
export function App() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background text-foreground">
			<h1 className="text-3xl font-bold text-primary">CF-Architect</h1>
		</div>
	);
}
