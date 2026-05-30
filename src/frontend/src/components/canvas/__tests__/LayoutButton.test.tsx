/**
 * Tests for the LayoutButton component.
 *
 * The `useAutoLayout` hook is mocked so these tests verify only the component's
 * rendering and interaction logic, not the underlying Worker or ELK computation.
 *
 * Radix DropdownMenu requires `userEvent.click` to open (it responds to the
 * full pointer-event sequence); `fireEvent.click` only dispatches a bare click
 * event and does not trigger the Radix `data-state` toggling mechanism.
 * The `onSelect` callback on items uses `fireEvent.click` per the pattern
 * documented in DECISIONS.md (ISSUE-12).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutButton } from "../LayoutButton";

// ---------------------------------------------------------------------------
// Mock useAutoLayout
// ---------------------------------------------------------------------------

let mockApplyLayout: ReturnType<typeof vi.fn>;
let mockIsLayouting: boolean;

vi.mock("../../../hooks/useAutoLayout", () => ({
	useAutoLayout: () => ({
		applyLayout: mockApplyLayout,
		isLayouting: mockIsLayouting,
	}),
}));

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
	mockApplyLayout = vi.fn();
	mockIsLayouting = false;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LayoutButton", () => {
	it("renders a button with 'Layout' text when idle", () => {
		render(<LayoutButton />);
		expect(screen.getByRole("button", { name: /layout/i })).toBeInTheDocument();
		expect(screen.queryByText(/layouting/i)).toBeNull();
	});

	it("clicking 'Top to Bottom' calls applyLayout('TB')", async () => {
		render(<LayoutButton />);

		// userEvent.click fires the full pointer event sequence that Radix needs
		// to toggle the dropdown open state.
		await userEvent.click(screen.getByRole("button", { name: /layout/i }));

		// Use fireEvent.click for the menu item — Radix fires onSelect via
		// handleSelect, which is part of its onClick composition chain.
		const tbItem = screen.getByText("Top to Bottom");
		fireEvent.click(tbItem);

		expect(mockApplyLayout).toHaveBeenCalledWith("TB");
	});

	it("clicking 'Left to Right' calls applyLayout('LR')", async () => {
		render(<LayoutButton />);

		await userEvent.click(screen.getByRole("button", { name: /layout/i }));

		const lrItem = screen.getByText("Left to Right");
		fireEvent.click(lrItem);

		expect(mockApplyLayout).toHaveBeenCalledWith("LR");
	});

	it("button is disabled and shows spinner when isLayouting is true", () => {
		mockIsLayouting = true;
		render(<LayoutButton />);

		const button = screen.getByRole("button", { name: /auto-layout/i });
		expect(button).toBeDisabled();
		// The text changes from "Layout" to "Formatting..."
		expect(screen.getByText(/formatting/i)).toBeInTheDocument();
	});

	it("button is enabled when isLayouting is false", () => {
		mockIsLayouting = false;
		render(<LayoutButton />);

		const button = screen.getByRole("button", { name: /layout/i });
		expect(button).not.toBeDisabled();
	});
});
