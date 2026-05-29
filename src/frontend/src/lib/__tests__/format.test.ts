import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "../format";

describe("formatRelativeTime", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns "just now" for timestamps less than 60 seconds ago', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 30));

		const thirtySecondsAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
		expect(formatRelativeTime(thirtySecondsAgo)).toBe("just now");
	});

	it('returns "just now" for exactly 0 seconds ago', () => {
		vi.useFakeTimers();
		const now = new Date(2024, 0, 1, 12, 0, 0).getTime();
		vi.setSystemTime(now);

		expect(formatRelativeTime(now)).toBe("just now");
	});

	it('returns "1 minute ago" for singular minute', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 0, 1, 12, 1, 0));

		const oneMinuteAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
		expect(formatRelativeTime(oneMinuteAgo)).toBe("1 minute ago");
	});

	it('returns "5 minutes ago" for plural minutes', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 0, 1, 12, 5, 0));

		const fiveMinutesAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
		expect(formatRelativeTime(fiveMinutesAgo)).toBe("5 minutes ago");
	});

	it('returns "1 hour ago" for singular hour', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 0, 1, 13, 0, 0));

		const oneHourAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
		expect(formatRelativeTime(oneHourAgo)).toBe("1 hour ago");
	});

	it('returns "3 hours ago" for plural hours', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 0, 1, 15, 0, 0));

		const threeHoursAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
		expect(formatRelativeTime(threeHoursAgo)).toBe("3 hours ago");
	});

	it('returns "1 day ago" for singular day', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 0, 2, 12, 0, 0));

		const oneDayAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
		expect(formatRelativeTime(oneDayAgo)).toBe("1 day ago");
	});

	it('returns "7 days ago" for plural days', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 0, 8, 12, 0, 0));

		const sevenDaysAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
		expect(formatRelativeTime(sevenDaysAgo)).toBe("7 days ago");
	});

	it("returns a locale date string for timestamps older than 30 days", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 2, 1, 12, 0, 0)); // March 1

		const oldTimestamp = new Date(2024, 0, 1, 12, 0, 0).getTime(); // January 1
		const result = formatRelativeTime(oldTimestamp);
		// Should be a locale date string, not a relative time string
		expect(result).not.toContain("ago");
		expect(result).not.toBe("just now");
		// Should be parseable as a date (not throw)
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});
});
