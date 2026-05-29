import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
	it("renders the title", () => {
		render(<EmptyState title="No items" />);
		expect(screen.getByText("No items")).toBeInTheDocument();
	});

	it("renders title and description", () => {
		render(<EmptyState title="No items" description="Create something to get started." />);

		expect(screen.getByText("No items")).toBeInTheDocument();
		expect(screen.getByText("Create something to get started.")).toBeInTheDocument();
	});

	it("renders the CTA button and calls onAction when clicked", async () => {
		const onAction = vi.fn();
		render(<EmptyState title="Empty" actionLabel="Create" onAction={onAction} />);

		await userEvent.click(screen.getByRole("button", { name: "Create" }));
		expect(onAction).toHaveBeenCalledOnce();
	});

	it("does not render a button when actionLabel is absent", () => {
		render(<EmptyState title="Empty" />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("does not render a button when onAction is absent", () => {
		render(<EmptyState title="Empty" actionLabel="Create" />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("renders an icon when provided", () => {
		render(<EmptyState title="Empty" icon={<span data-testid="icon">★</span>} />);
		expect(screen.getByTestId("icon")).toBeInTheDocument();
	});

	it("applies additional className to the wrapper", () => {
		const { container } = render(<EmptyState title="Empty" className="custom-class" />);
		expect(container.firstChild).toHaveClass("custom-class");
	});
});
