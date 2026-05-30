import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Pagination } from "../Pagination";

describe("Pagination", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("renders previous and next buttons", () => {
		render(<Pagination page={2} totalPages={5} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: /previous page/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /next page/i })).toBeInTheDocument();
	});

	it("disables previous button on first page", () => {
		render(<Pagination page={1} totalPages={5} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
	});

	it("does not disable next button on first page", () => {
		render(<Pagination page={1} totalPages={5} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: /next page/i })).not.toBeDisabled();
	});

	it("disables next button on last page", () => {
		render(<Pagination page={5} totalPages={5} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
	});

	it("calls onPageChange with previous page when prev is clicked", async () => {
		const onPageChange = vi.fn();
		render(<Pagination page={3} totalPages={5} limit={20} onPageChange={onPageChange} onLimitChange={vi.fn()} />);
		await userEvent.click(screen.getByRole("button", { name: /previous page/i }));
		expect(onPageChange).toHaveBeenCalledWith(2);
	});

	it("calls onPageChange with next page when next is clicked", async () => {
		const onPageChange = vi.fn();
		render(<Pagination page={2} totalPages={5} limit={20} onPageChange={onPageChange} onLimitChange={vi.fn()} />);
		await userEvent.click(screen.getByRole("button", { name: /next page/i }));
		expect(onPageChange).toHaveBeenCalledWith(3);
	});

	it("renders individual page number buttons for small page count", () => {
		render(<Pagination page={1} totalPages={5} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: "Page 1" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Page 3" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Page 5" })).toBeInTheDocument();
	});

	it("calls onPageChange with the correct page when a number button is clicked", async () => {
		const onPageChange = vi.fn();
		render(<Pagination page={1} totalPages={5} limit={20} onPageChange={onPageChange} onLimitChange={vi.fn()} />);
		await userEvent.click(screen.getByRole("button", { name: "Page 3" }));
		expect(onPageChange).toHaveBeenCalledWith(3);
	});

	it("shows ellipsis for large page counts", () => {
		render(<Pagination page={5} totalPages={10} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		// Should show page 1, ..., 4, 5, 6, ..., 10
		expect(screen.getAllByText("...").length).toBeGreaterThan(0);
	});

	it("renders page 1 and last page even with ellipsis", () => {
		render(<Pagination page={5} totalPages={10} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: "Page 1" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Page 10" })).toBeInTheDocument();
	});

	it("renders the rows-per-page label", () => {
		render(<Pagination page={1} totalPages={5} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		expect(screen.getByText("Rows per page")).toBeInTheDocument();
	});

	it("renders the Select trigger with current limit", () => {
		render(<Pagination page={1} totalPages={5} limit={20} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
		// The Select trigger shows the current value
		expect(screen.getByRole("combobox", { name: /rows per page/i })).toBeInTheDocument();
	});
});
