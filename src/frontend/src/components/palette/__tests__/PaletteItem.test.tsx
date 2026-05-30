import type { CatalogService } from "@architect/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PaletteItem from "../PaletteItem";

/** Minimal mock service used across tests. */
const mockService: CatalogService = {
	typeId: "workers",
	officialName: "Cloudflare Workers",
	shortName: "Workers",
	category: "developer-platform",
	iconPath: "workers.svg",
	docUrl: "https://developers.cloudflare.com/workers/",
};

describe("PaletteItem", () => {
	afterEach(() => {
		// cleanup is handled automatically by the test setup file
	});

	it("renders the service short name as text", () => {
		render(<PaletteItem service={mockService} />);
		expect(screen.getByText("Workers")).toBeInTheDocument();
	});

	it("renders an icon with src pointing to the service iconPath", () => {
		render(<PaletteItem service={mockService} />);
		const img = screen.getByRole("img");
		expect(img).toHaveAttribute("src", "/catalog/icons/workers.svg");
	});

	it("renders the icon with an accessible alt text containing the short name", () => {
		render(<PaletteItem service={mockService} />);
		const img = screen.getByRole("img");
		expect(img).toHaveAttribute("alt", "Workers icon");
	});

	it("root button element has draggable attribute set to true", () => {
		render(<PaletteItem service={mockService} />);
		const button = screen.getByRole("button");
		// The `draggable` attribute is serialised as the string "true" in the DOM.
		expect(button.getAttribute("draggable")).toBe("true");
	});

	it("icon element has draggable attribute set to false", () => {
		render(<PaletteItem service={mockService} />);
		const img = screen.getByRole("img");
		expect(img.getAttribute("draggable")).toBe("false");
	});

	it("shows the official name as a tooltip (title attribute)", () => {
		render(<PaletteItem service={mockService} />);
		const button = screen.getByRole("button");
		expect(button).toHaveAttribute("title", "Cloudflare Workers");
	});

	it("sets application/cf-architect-service drag data with the typeId on dragstart", () => {
		render(<PaletteItem service={mockService} />);
		const button = screen.getByRole("button");

		// Build a synthetic drag event with a spy on setData.
		const setDataSpy = new Map<string, string>();
		const dragEvent = new Event("dragstart", { bubbles: true }) as DragEvent;
		Object.defineProperty(dragEvent, "dataTransfer", {
			value: {
				setData: (type: string, data: string) => setDataSpy.set(type, data),
				effectAllowed: null,
			},
			writable: true,
		});

		fireEvent(button, dragEvent);

		expect(setDataSpy.get("application/cf-architect-service")).toBe("workers");
	});

	it("sets text/plain drag data with the shortName on dragstart", () => {
		render(<PaletteItem service={mockService} />);
		const button = screen.getByRole("button");

		const setDataSpy = new Map<string, string>();
		const dragEvent = new Event("dragstart", { bubbles: true }) as DragEvent;
		Object.defineProperty(dragEvent, "dataTransfer", {
			value: {
				setData: (type: string, data: string) => setDataSpy.set(type, data),
				effectAllowed: null,
			},
			writable: true,
		});

		fireEvent(button, dragEvent);

		expect(setDataSpy.get("text/plain")).toBe("Workers");
	});
});
