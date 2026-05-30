import type { CatalogCategory, CatalogService } from "@architect/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "@/stores/ui";
import PaletteCategory from "../PaletteCategory";

/** Resets the UI store to its initial state between tests. */
function resetStore() {
	useUIStore.setState({
		collapsedCategories: new Set(),
		selectedNodeId: null,
		selectedEdgeId: null,
		panelVisible: true,
	});
}

/** Minimal mock category used across tests. */
const mockCategory: CatalogCategory = {
	id: "developer-platform",
	label: "Developer Platform",
	color: "#2563eb",
};

/** Two minimal mock services belonging to `mockCategory`. */
const mockServices: CatalogService[] = [
	{
		typeId: "workers",
		officialName: "Cloudflare Workers",
		shortName: "Workers",
		category: "developer-platform",
		iconPath: "workers.svg",
		docUrl: "https://developers.cloudflare.com/workers/",
	},
	{
		typeId: "d1",
		officialName: "Cloudflare D1",
		shortName: "D1",
		category: "developer-platform",
		iconPath: "d1.svg",
		docUrl: "https://developers.cloudflare.com/d1/",
	},
];

/**
 * Finds the category toggle button (not a service item) by its `aria-controls`
 * attribute. This is necessary because service items also render as `<button>`
 * elements, so `getByRole("button")` would be ambiguous.
 */
function getToggleButton() {
	return screen.getByRole("button", { name: /developer platform/i });
}

describe("PaletteCategory", () => {
	beforeEach(resetStore);
	afterEach(resetStore);

	it("renders the category label in the header", () => {
		render(<PaletteCategory category={mockCategory} services={mockServices} />);
		expect(screen.getByText("Developer Platform")).toBeInTheDocument();
	});

	it("renders a color dot with the category accent color", () => {
		const { container } = render(<PaletteCategory category={mockCategory} services={mockServices} />);

		// The color dot is the `span[aria-hidden="true"]` with a backgroundColor style.
		const dot = container.querySelector("span[aria-hidden='true']") as HTMLElement;
		expect(dot).toBeTruthy();
		expect(dot.style.backgroundColor).toBe("rgb(37, 99, 235)");
	});

	it("renders all service items when the category is expanded (default)", () => {
		render(<PaletteCategory category={mockCategory} services={mockServices} />);

		// Both service short names should be visible.
		expect(screen.getByText("Workers")).toBeInTheDocument();
		expect(screen.getByText("D1")).toBeInTheDocument();
	});

	it("applies max-h-0 to the service list container when the category is collapsed", () => {
		// Pre-collapse by seeding the store before render.
		useUIStore.setState({
			collapsedCategories: new Set(["developer-platform"]),
		});

		const { container } = render(<PaletteCategory category={mockCategory} services={mockServices} />);

		const region = container.querySelector(`#palette-category-${mockCategory.id}`) as HTMLElement;
		expect(region.className).toContain("max-h-0");
	});

	it("applies max-h-[2000px] to the service list container when expanded", () => {
		render(<PaletteCategory category={mockCategory} services={mockServices} />);

		const region = screen.getByRole("region", { name: "Developer Platform services" });
		expect(region.className).toContain("max-h-[2000px]");
	});

	it("clicking the header button collapses the category", () => {
		render(<PaletteCategory category={mockCategory} services={mockServices} />);

		fireEvent.click(getToggleButton());

		expect(useUIStore.getState().collapsedCategories.has("developer-platform")).toBe(true);
	});

	it("clicking the header button again expands the category", () => {
		// Start collapsed.
		useUIStore.setState({ collapsedCategories: new Set(["developer-platform"]) });
		render(<PaletteCategory category={mockCategory} services={mockServices} />);

		fireEvent.click(getToggleButton());

		expect(useUIStore.getState().collapsedCategories.has("developer-platform")).toBe(false);
	});

	it("button has aria-expanded=true when expanded", () => {
		render(<PaletteCategory category={mockCategory} services={mockServices} />);
		expect(getToggleButton()).toHaveAttribute("aria-expanded", "true");
	});

	it("button has aria-expanded=false when collapsed", () => {
		useUIStore.setState({ collapsedCategories: new Set(["developer-platform"]) });
		render(<PaletteCategory category={mockCategory} services={mockServices} />);
		expect(getToggleButton()).toHaveAttribute("aria-expanded", "false");
	});

	it("button has aria-controls pointing to the region id", () => {
		render(<PaletteCategory category={mockCategory} services={mockServices} />);
		expect(getToggleButton()).toHaveAttribute("aria-controls", `palette-category-${mockCategory.id}`);
	});
});
