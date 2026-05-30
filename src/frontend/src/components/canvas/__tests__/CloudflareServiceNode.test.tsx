import { render, screen } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudflareServiceNodeData } from "../CloudflareServiceNode";

/**
 * Mock `@xyflow/react` so `Handle` renders a simple `<div>` without
 * requiring a full React Flow context. The `Position` constant is provided
 * so the component's imports still resolve.
 */
vi.mock("@xyflow/react", () => ({
	Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
	Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

// Import after mocking so the module sees the mock.
import CloudflareServiceNode from "../CloudflareServiceNode";

/** Builds a minimal `NodeProps`-shaped object for the tests. */
function makeProps(data: Partial<CloudflareServiceNodeData> = {}, selected = false): NodeProps {
	return {
		id: "test-node",
		type: "cloudflareService",
		data: {
			label: "Workers",
			iconUrl: "/catalog/icons/workers.svg",
			categoryColor: "#2563eb",
			serviceTypeId: "workers",
			...data,
		} as CloudflareServiceNodeData,
		selected,
		isConnectable: true,
		dragging: false,
		zIndex: 0,
		positionAbsoluteX: 0,
		positionAbsoluteY: 0,
	} as unknown as NodeProps;
}

describe("CloudflareServiceNode", () => {
	it("renders the icon with the provided URL and alt text", () => {
		render(<CloudflareServiceNode {...makeProps()} />);
		const img = screen.getByRole("img", { name: "Workers icon" });
		expect(img).toHaveAttribute("src", "/catalog/icons/workers.svg");
	});

	it("renders the label text", () => {
		render(<CloudflareServiceNode {...makeProps({ label: "KV Storage" })} />);
		expect(screen.getByText("KV Storage")).toBeInTheDocument();
	});

	it("uses categoryColor for the border when accentColor is absent", () => {
		const { container } = render(<CloudflareServiceNode {...makeProps({ categoryColor: "#2563eb" })} />);
		const node = container.firstChild as HTMLElement;
		expect(node.style.borderColor).toBe("rgb(37, 99, 235)");
	});

	it("uses accentColor for the border when provided, overriding categoryColor", () => {
		const { container } = render(
			<CloudflareServiceNode {...makeProps({ accentColor: "#ff0000", categoryColor: "#2563eb" })} />,
		);
		const node = container.firstChild as HTMLElement;
		expect(node.style.borderColor).toBe("rgb(255, 0, 0)");
	});

	it("applies selected visual indicators when selected=true", () => {
		const { container } = render(<CloudflareServiceNode {...makeProps({}, true)} />);
		const node = container.firstChild as HTMLElement;
		expect(node.className).toMatch(/shadow-lg/);
		expect(node.className).toMatch(/ring-2/);
		expect(node.className).toMatch(/ring-blue-400/);
	});

	it("does not apply selected styles when selected=false", () => {
		const { container } = render(<CloudflareServiceNode {...makeProps({}, false)} />);
		const node = container.firstChild as HTMLElement;
		expect(node.className).not.toMatch(/shadow-lg/);
		expect(node.className).not.toMatch(/ring-2/);
	});

	it("renders four handles (top, bottom, left, right)", () => {
		render(<CloudflareServiceNode {...makeProps()} />);
		expect(screen.getByTestId("handle-top")).toBeInTheDocument();
		expect(screen.getByTestId("handle-bottom")).toBeInTheDocument();
		expect(screen.getByTestId("handle-left")).toBeInTheDocument();
		expect(screen.getByTestId("handle-right")).toBeInTheDocument();
	});
});
