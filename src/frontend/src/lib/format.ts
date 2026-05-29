/**
 * Formats a Unix timestamp (milliseconds) as a human-readable relative time string.
 *
 * Returns the most appropriate unit (seconds, minutes, hours, days) based on
 * how long ago the timestamp was. Falls back to a locale date string for
 * timestamps older than 30 days.
 *
 * @param timestampMs - Unix timestamp in milliseconds (e.g. `Date.now()` or
 *   `diagram.updated_at`).
 * @returns A relative time string such as `"just now"`, `"5 minutes ago"`,
 *   `"3 hours ago"`, `"2 days ago"`, or a locale date string for older dates.
 *
 * @example
 * ```ts
 * formatRelativeTime(Date.now() - 30_000)   // → "just now"
 * formatRelativeTime(Date.now() - 300_000)  // → "5 minutes ago"
 * formatRelativeTime(Date.now() - 7_200_000) // → "2 hours ago"
 * formatRelativeTime(Date.now() - 86_400_000 * 3) // → "3 days ago"
 * ```
 */
export function formatRelativeTime(timestampMs: number): string {
	const now = Date.now();
	const diffMs = now - timestampMs;
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) return "just now";
	if (diffMinutes < 60) {
		return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
	}
	if (diffHours < 24) {
		return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
	}
	if (diffDays < 30) {
		return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
	}
	// Fall back to locale date string for older items
	return new Date(timestampMs).toLocaleDateString();
}
