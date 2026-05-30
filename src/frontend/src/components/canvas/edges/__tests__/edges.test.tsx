import { render, screen } from "@testing-library/react";
import type { EdgeProps } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock `@xyflow/react` so edge components can be rendered without a full React
 * Flow context (no SVG pan/zoom provider, no minimap, etc.).
 *
 * - `BaseEdge` renders a `<path>` with a `data-testid="base-edge"` and exposes
 *   the `style` prop so we can assert on `strokeDasharray` and `strokeWidth`.
 * - `EdgeLabelRenderer` renders its children directly into the DOM without the
 *   portal that React Flow normally uses. This keeps label assertions simple.
 * - `getBezierPath` returns a fixed path tuple — the exact SVG path string is
 *   irrelevant for these unit tests.
 */
vi.mock("@xyflow/react", () => ({
	BaseEdge: ({ style, markerEnd, id }: { style?: React.CSSProperties; markerEnd?: string; id?: string }) => (
		<path data-testid="base-edge" data-marker-end={markerEnd} id={id} style={style} />
	),
	EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	getBezierPath: () => ["M 0 0 L 100 100", 50, 50] as [string, number, number],
	MarkerType: { ArrowClosed: "arrowclosed" },
}));

/**
 * Mock `useReducedMotion` so tests can control the returned value.
 * Default is `false` (motion allowed); individual tests override as needed.
 */
const mockUseReducedMotion = vi.fn(() => false);
vi.mock("@/hooks/useReducedMotion", () => ({
	useReducedMotion: () => mockUseReducedMotion(),
}));

import BindingEdge from "../BindingEdge";
// Import edge components after mocking so they see the mocked modules.
import DataFlowEdge from "../DataFlowEdge";
import DependencyEdge from "../DependencyEdge";
import TriggerEdge from "../TriggerEdge";

/** Builds a minimal `EdgeProps`-shaped object for the tests. */
function makeEdgeProps(overrides: Partial<EdgeProps> = {}): EdgeProps {
	return {
		id: "test-edge",
		source: "a",
		target: "b",
		sourceX: 0,
		sourceY: 0,
		targetX: 100,
		targetY: 100,
		sourcePosition: "bottom" as never,
		targetPosition: "top" as never,
		selected: false,
		animated: false,
		markerEnd: undefined,
		markerStart: undefined,
		data: {},
		style: {},
		label: undefined,
		labelStyle: {},
		labelShowBg: false,
		labelBgStyle: {},
		labelBgPadding: [0, 0],
		labelBgBorderRadius: 0,
		interactionWidth: 20,
		...overrides,
	} as unknown as EdgeProps;
}

// ── DataFlowEdge ──────────────────────────────────────────────────────────────

describe("DataFlowEdge", () => {
	beforeEach(() => {
		mockUseReducedMotion.mockReturnValue(false);
	});
	afterEach(() => {
		mockUseReducedMotion.mockReset();
	});

	it("renders a solid line (strokeDasharray: none, strokeWidth: 2)", () => {
		render(<DataFlowEdge {...makeEdgeProps()} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ strokeDasharray: "none", strokeWidth: "2" });
	});

	it("renders the animated dot when reduced motion is not active", () => {
		mockUseReducedMotion.mockReturnValue(false);
		const { container } = render(<DataFlowEdge {...makeEdgeProps()} />);
		const circle = container.querySelector("circle");
		expect(circle).not.toBeNull();
	});

	it("omits the animated dot when reduced motion is active", () => {
		mockUseReducedMotion.mockReturnValue(true);
		const { container } = render(<DataFlowEdge {...makeEdgeProps()} />);
		const circle = container.querySelector("circle");
		expect(circle).toBeNull();
	});

	it("uses the default slate stroke color when not selected", () => {
		render(<DataFlowEdge {...makeEdgeProps({ selected: false })} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ stroke: "#64748b" });
	});

	it("uses the selection blue stroke color when selected", () => {
		render(<DataFlowEdge {...makeEdgeProps({ selected: true })} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ stroke: "#3b82f6" });
	});

	it("renders the label when data.label is present", () => {
		render(<DataFlowEdge {...makeEdgeProps({ data: { label: "HTTP" } })} />);
		expect(screen.getByText("HTTP")).toBeInTheDocument();
	});

	it("does not render a label element when data.label is absent", () => {
		render(<DataFlowEdge {...makeEdgeProps({ data: {} })} />);
		expect(screen.queryByText("HTTP")).not.toBeInTheDocument();
	});
});

// ── BindingEdge ───────────────────────────────────────────────────────────────

describe("BindingEdge", () => {
	it("renders a dashed line (strokeDasharray: 8 4, strokeWidth: 2)", () => {
		render(<BindingEdge {...makeEdgeProps()} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ strokeDasharray: "8 4", strokeWidth: "2" });
	});

	it("uses the default purple stroke color when not selected", () => {
		render(<BindingEdge {...makeEdgeProps({ selected: false })} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ stroke: "#8b5cf6" });
	});

	it("uses the selection blue stroke color when selected", () => {
		render(<BindingEdge {...makeEdgeProps({ selected: true })} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ stroke: "#3b82f6" });
	});

	it("renders the label when data.label is present", () => {
		render(<BindingEdge {...makeEdgeProps({ data: { label: "KV" } })} />);
		expect(screen.getByText("KV")).toBeInTheDocument();
	});

	it("does not render a label element when data.label is absent", () => {
		const { container } = render(<BindingEdge {...makeEdgeProps({ data: {} })} />);
		// Only the <path> from BaseEdge should be in the container; no label div.
		const divs = container.querySelectorAll("div");
		expect(divs).toHaveLength(0);
	});
});

// ── TriggerEdge ───────────────────────────────────────────────────────────────

describe("TriggerEdge", () => {
	it("renders a dotted line (strokeDasharray: 3 3, strokeWidth: 2)", () => {
		render(<TriggerEdge {...makeEdgeProps()} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ strokeDasharray: "3 3", strokeWidth: "2" });
	});

	it("includes an arrowhead marker reference in markerEnd", () => {
		render(<TriggerEdge {...makeEdgeProps({ id: "e1" })} />);
		const path = screen.getByTestId("base-edge");
		const markerEnd = path.getAttribute("data-marker-end") ?? "";
		expect(markerEnd).toMatch(/url\(#trigger-arrow-e1-/);
	});

	it("uses the default amber stroke color when not selected", () => {
		render(<TriggerEdge {...makeEdgeProps({ selected: false })} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ stroke: "#f59e0b" });
	});

	it("uses the selection blue stroke color when selected", () => {
		render(<TriggerEdge {...makeEdgeProps({ selected: true })} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ stroke: "#3b82f6" });
	});

	it("renders the label when data.label is present", () => {
		render(<TriggerEdge {...makeEdgeProps({ data: { label: "cron" } })} />);
		expect(screen.getByText("cron")).toBeInTheDocument();
	});

	it("does not render a label element when data.label is absent", () => {
		const { container } = render(<TriggerEdge {...makeEdgeProps({ data: {} })} />);
		const divs = container.querySelectorAll("div");
		expect(divs).toHaveLength(0);
	});
});

// ── DependencyEdge ────────────────────────────────────────────────────────────

describe("DependencyEdge", () => {
	it("renders a thin solid line (strokeDasharray: none, strokeWidth: 1)", () => {
		render(<DependencyEdge {...makeEdgeProps()} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ strokeDasharray: "none", strokeWidth: "1" });
	});

	it("uses the default light slate stroke color when not selected", () => {
		render(<DependencyEdge {...makeEdgeProps({ selected: false })} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ stroke: "#94a3b8" });
	});

	it("uses the selection blue stroke color when selected", () => {
		render(<DependencyEdge {...makeEdgeProps({ selected: true })} />);
		const path = screen.getByTestId("base-edge");
		expect(path).toHaveStyle({ stroke: "#3b82f6" });
	});

	it("renders the label when data.label is present", () => {
		render(<DependencyEdge {...makeEdgeProps({ data: { label: "npm" } })} />);
		expect(screen.getByText("npm")).toBeInTheDocument();
	});

	it("does not render a label element when data.label is absent", () => {
		const { container } = render(<DependencyEdge {...makeEdgeProps({ data: {} })} />);
		const divs = container.querySelectorAll("div");
		expect(divs).toHaveLength(0);
	});
});
