import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserSearch } from "../UserSearch";

describe("UserSearch", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("renders the search input", () => {
		render(<UserSearch value="" onChange={vi.fn()} onDebouncedChange={vi.fn()} />);
		expect(screen.getByRole("searchbox", { name: /search users/i })).toBeInTheDocument();
	});

	it("displays the controlled value", () => {
		render(<UserSearch value="alice" onChange={vi.fn()} onDebouncedChange={vi.fn()} />);
		expect(screen.getByRole("searchbox", { name: /search users/i })).toHaveValue("alice");
	});

	it("calls onChange immediately on each keystroke", async () => {
		const onChange = vi.fn();
		const { rerender } = render(<UserSearch value="" onChange={onChange} onDebouncedChange={vi.fn()} />);

		// Simulate typing "a"
		await userEvent.type(screen.getByRole("searchbox", { name: /search users/i }), "a");
		expect(onChange).toHaveBeenCalledWith("a");

		// Keep the controlled value in sync for the next character
		rerender(<UserSearch value="a" onChange={onChange} onDebouncedChange={vi.fn()} />);
		await userEvent.type(screen.getByRole("searchbox", { name: /search users/i }), "b");
		expect(onChange).toHaveBeenCalledWith("ab");
	});

	it("does not call onDebouncedChange immediately after typing", async () => {
		const onDebouncedChange = vi.fn();
		render(<UserSearch value="test" onChange={vi.fn()} onDebouncedChange={onDebouncedChange} />);
		// The initial render starts a timer; just verify it hasn't fired yet
		// (timers are fake so 0ms have elapsed)
		expect(onDebouncedChange).not.toHaveBeenCalled();
	});

	it("calls onDebouncedChange after the debounce delay elapses", async () => {
		const onDebouncedChange = vi.fn();
		render(<UserSearch value="alice" onChange={vi.fn()} onDebouncedChange={onDebouncedChange} />);
		// Advance past the default 300ms debounce
		await vi.advanceTimersByTimeAsync(301);
		expect(onDebouncedChange).toHaveBeenCalledWith("alice");
	});

	it("resets the debounce timer when value changes before it fires", async () => {
		const onDebouncedChange = vi.fn();
		const { rerender } = render(<UserSearch value="a" onChange={vi.fn()} onDebouncedChange={onDebouncedChange} />);
		// Advance 200ms (less than 300ms debounce)
		await vi.advanceTimersByTimeAsync(200);
		expect(onDebouncedChange).not.toHaveBeenCalled();

		// Change value — should reset timer
		rerender(<UserSearch value="al" onChange={vi.fn()} onDebouncedChange={onDebouncedChange} />);
		// Another 200ms — still within new debounce window
		await vi.advanceTimersByTimeAsync(200);
		expect(onDebouncedChange).not.toHaveBeenCalled();

		// Wait for the full 300ms since last change
		await vi.advanceTimersByTimeAsync(110);
		expect(onDebouncedChange).toHaveBeenCalledTimes(1);
		expect(onDebouncedChange).toHaveBeenCalledWith("al");
	});

	it("respects a custom debounceMs value", async () => {
		const onDebouncedChange = vi.fn();
		render(<UserSearch value="query" onChange={vi.fn()} onDebouncedChange={onDebouncedChange} debounceMs={500} />);
		await vi.advanceTimersByTimeAsync(400);
		expect(onDebouncedChange).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(110);
		expect(onDebouncedChange).toHaveBeenCalledWith("query");
	});
});
