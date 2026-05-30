import { useEffect, useState } from "react";
import type { SaveStatus as SaveStatusType } from "@/sync/useDiagramSync";

/**
 * Props for the `SaveStatus` component.
 */
interface SaveStatusProps {
	/** Current save status from `useDiagramSync`. */
	status: SaveStatusType;
	/**
	 * Unix timestamp (ms) of the last successful save. `null` when no save
	 * has succeeded yet (status is `"idle"` or `"saving"` on first use).
	 */
	lastSavedAt: number | null;
	/**
	 * Human-readable error message from the most recent failed save attempt,
	 * or `null` when status is not `"error"`.
	 */
	errorMessage: string | null;
	/**
	 * Called when the user clicks the "reload?" link in the conflict state.
	 * Typically wired to `() => window.location.reload()`.
	 */
	onReload?: () => void;
}

/**
 * Formats a Unix timestamp as a human-readable relative time string.
 *
 * @param savedAt - The Unix timestamp (ms) to format.
 * @returns A string such as "just now", "5s ago", "3m ago", or "2h ago".
 */
function formatRelativeTime(savedAt: number): string {
	const seconds = Math.floor((Date.now() - savedAt) / 1000);
	if (seconds < 5) return "just now";
	if (seconds < 60) return `${seconds}s ago`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	return `${Math.floor(seconds / 3600)}h ago`;
}

/**
 * Displays the current auto-save status in the editor status bar.
 *
 * Renders different content based on the `status` prop:
 * - `"idle"` — renders nothing (returns `null`).
 * - `"saving"` — shows "Saving..." with muted text.
 * - `"saved"` — shows "Saved Xs ago" with a live relative timestamp that
 *   updates every 10 seconds.
 * - `"error"` — shows "Error saving" in destructive red with the full error
 *   message as a tooltip.
 * - `"conflict"` — shows "Conflict — reload?" with a clickable link that
 *   calls `onReload`. The user must reload to fetch the server's current
 *   version before editing can continue.
 *
 * @param props - Component props (see {@link SaveStatusProps}).
 * @returns A `<span>` with the appropriate status text, or `null` when idle.
 *
 * @example
 * ```tsx
 * <SaveStatus
 *   status={status}
 *   lastSavedAt={lastSavedAt}
 *   errorMessage={errorMessage}
 *   onReload={() => window.location.reload()}
 * />
 * ```
 */
export function SaveStatus({ status, lastSavedAt, errorMessage, onReload }: SaveStatusProps) {
	const [relativeTime, setRelativeTime] = useState("");

	// Update the relative time display every 10 seconds when a save timestamp
	// is available.
	useEffect(() => {
		if (!lastSavedAt) return;

		function tick() {
			// biome-ignore lint/style/noNonNullAssertion: guarded by the if check above
			setRelativeTime(formatRelativeTime(lastSavedAt!));
		}

		tick();
		const interval = setInterval(tick, 10_000);
		return () => clearInterval(interval);
	}, [lastSavedAt]);

	switch (status) {
		case "idle":
			return null;

		case "saving":
			return <span className="text-sm text-muted-foreground">Saving...</span>;

		case "saved":
			return <span className="text-sm text-muted-foreground">Saved {relativeTime}</span>;

		case "error":
			return (
				<span className="text-sm text-destructive" title={errorMessage ?? undefined}>
					Error saving
				</span>
			);

		case "conflict":
			return (
				<span className="text-sm text-destructive">
					Conflict —{" "}
					<button type="button" className="underline" onClick={onReload}>
						reload?
					</button>
				</span>
			);
	}
}
