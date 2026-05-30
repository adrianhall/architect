import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveStatus } from "../SaveStatus";

afterEach(cleanup);

describe("SaveStatus", () => {
	// ── idle ───────────────────────────────────────────────────────────────────

	describe("idle status", () => {
		it("renders nothing when status is 'idle'", () => {
			const { container } = render(<SaveStatus status="idle" lastSavedAt={null} errorMessage={null} />);
			expect(container.firstChild).toBeNull();
		});
	});

	// ── saving ─────────────────────────────────────────────────────────────────

	describe("saving status", () => {
		it("renders 'Saving...' text", () => {
			render(<SaveStatus status="saving" lastSavedAt={null} errorMessage={null} />);
			expect(screen.getByText("Saving...")).toBeInTheDocument();
		});
	});

	// ── saved ──────────────────────────────────────────────────────────────────

	describe("saved status", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			// Use clearAllTimers instead of runAllTimers to avoid triggering the
			// setInterval inside SaveStatus indefinitely (infinite loop guard).
			vi.clearAllTimers();
			vi.useRealTimers();
		});

		it("renders 'Saved just now' immediately after saving", () => {
			// Pin system time so the elapsed duration is 0 ms
			vi.setSystemTime(1_000_000);
			const savedAt = Date.now(); // = 1_000_000

			render(<SaveStatus status="saved" lastSavedAt={savedAt} errorMessage={null} />);

			expect(screen.getByText(/saved just now/i)).toBeInTheDocument();
		});

		it("renders 'Saved Xs ago' when the 10 s tick fires after the save", () => {
			// Pin system time so savedAt is predictable
			vi.setSystemTime(1_000_000);
			const savedAt = Date.now();

			render(<SaveStatus status="saved" lastSavedAt={savedAt} errorMessage={null} />);

			// Advance the fake clock by 30 s. The setInterval fires at 10 s, 20 s,
			// and 30 s marks; each tick re-computes the relative time against
			// Date.now() (also advanced by vi.advanceTimersByTime). After 30 s
			// the last tick renders "30s ago".
			act(() => {
				vi.advanceTimersByTime(30_000);
			});

			expect(screen.getByText(/saved 30s ago/i)).toBeInTheDocument();
		});

		it("renders 'Saved Xm ago' when several minutes have elapsed", () => {
			vi.setSystemTime(1_000_000);
			const savedAt = Date.now();

			render(<SaveStatus status="saved" lastSavedAt={savedAt} errorMessage={null} />);

			// Advance 3 minutes; the interval fires 18 times. Last tick: "3m ago".
			act(() => {
				vi.advanceTimersByTime(3 * 60_000);
			});

			expect(screen.getByText(/saved 3m ago/i)).toBeInTheDocument();
		});
	});

	// ── error ──────────────────────────────────────────────────────────────────

	describe("error status", () => {
		it("renders 'Error saving' text", () => {
			render(<SaveStatus status="error" lastSavedAt={null} errorMessage="Network timeout" />);
			expect(screen.getByText("Error saving")).toBeInTheDocument();
		});

		it("uses the errorMessage as the tooltip title", () => {
			render(<SaveStatus status="error" lastSavedAt={null} errorMessage="Network timeout" />);
			expect(screen.getByTitle("Network timeout")).toBeInTheDocument();
		});
	});

	// ── conflict ───────────────────────────────────────────────────────────────

	describe("conflict status", () => {
		it("renders conflict text with a reload button", () => {
			render(<SaveStatus status="conflict" lastSavedAt={null} errorMessage={null} />);
			expect(screen.getByText(/conflict/i)).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
		});

		it("calls onReload when the reload button is clicked", () => {
			const onReload = vi.fn();
			render(<SaveStatus status="conflict" lastSavedAt={null} errorMessage={null} onReload={onReload} />);

			fireEvent.click(screen.getByRole("button", { name: /reload/i }));
			expect(onReload).toHaveBeenCalledOnce();
		});
	});
});
