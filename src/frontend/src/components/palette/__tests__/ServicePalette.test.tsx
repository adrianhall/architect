import type { CatalogData } from "@architect/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-wrapper";
import { ServicePalette } from "../ServicePalette";

// ── Mock useCatalog ────────────────────────────────────────────────────────────

// Mock the entire @/api barrel so we can control `useCatalog` return values.
vi.mock("@/api", () => ({
	useCatalog: vi.fn(),
}));

// Import the mocked function AFTER vi.mock is hoisted so we get the mock version.
import { useCatalog } from "@/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Minimal catalog data with two categories and three services. */
const mockCatalog: CatalogData = {
	categories: [
		{ id: "developer-platform", label: "Developer Platform", color: "#2563eb" },
		{ id: "storage", label: "Storage", color: "#16a34a" },
	],
	services: [
		{
			typeId: "workers",
			officialName: "Cloudflare Workers",
			shortName: "Workers",
			category: "developer-platform",
			iconPath: "workers.svg",
			docUrl: "https://developers.cloudflare.com/workers/",
		},
		{
			typeId: "pages",
			officialName: "Cloudflare Pages",
			shortName: "Pages",
			category: "developer-platform",
			iconPath: "pages.svg",
			docUrl: "https://developers.cloudflare.com/pages/",
		},
		{
			typeId: "r2",
			officialName: "Cloudflare R2",
			shortName: "R2",
			category: "storage",
			iconPath: "r2.svg",
			docUrl: "https://developers.cloudflare.com/r2/",
		},
	],
	edgeTypes: [],
};

/** Renders `ServicePalette` inside all required providers. */
function renderPalette() {
	const { queryClient } = createQueryWrapper();
	return render(
		<QueryClientProvider client={queryClient}>
			<ServicePalette />
		</QueryClientProvider>,
	);
}

describe("ServicePalette", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows a loading indicator while the catalog is loading", () => {
		vi.mocked(useCatalog).mockReturnValue({
			data: undefined,
			isLoading: true,
		} as unknown as ReturnType<typeof useCatalog>);

		renderPalette();

		expect(screen.getByText("Loading catalog…")).toBeInTheDocument();
	});

	it("shows an error message when the catalog fails to load", () => {
		vi.mocked(useCatalog).mockReturnValue({
			data: undefined,
			isLoading: false,
		} as unknown as ReturnType<typeof useCatalog>);

		renderPalette();

		expect(screen.getByText("Failed to load catalog")).toBeInTheDocument();
	});

	it("renders a category header for each category in the catalog", () => {
		vi.mocked(useCatalog).mockReturnValue({
			data: mockCatalog,
			isLoading: false,
		} as unknown as ReturnType<typeof useCatalog>);

		renderPalette();

		expect(screen.getByText("Developer Platform")).toBeInTheDocument();
		expect(screen.getByText("Storage")).toBeInTheDocument();
	});

	it("renders all services from the catalog", () => {
		vi.mocked(useCatalog).mockReturnValue({
			data: mockCatalog,
			isLoading: false,
		} as unknown as ReturnType<typeof useCatalog>);

		renderPalette();

		expect(screen.getByText("Workers")).toBeInTheDocument();
		expect(screen.getByText("Pages")).toBeInTheDocument();
		expect(screen.getByText("R2")).toBeInTheDocument();
	});

	it("groups services under their correct category", () => {
		vi.mocked(useCatalog).mockReturnValue({
			data: mockCatalog,
			isLoading: false,
		} as unknown as ReturnType<typeof useCatalog>);

		renderPalette();

		// The "storage" category region should contain R2 but not Workers/Pages.
		const storageRegion = screen.getByRole("region", { name: "Storage services" });
		expect(storageRegion).toHaveTextContent("R2");
		expect(storageRegion).not.toHaveTextContent("Workers");
		expect(storageRegion).not.toHaveTextContent("Pages");
	});

	it("omits categories that have no services", () => {
		const catalogWithEmptyCat: CatalogData = {
			...mockCatalog,
			categories: [
				{ id: "developer-platform", label: "Developer Platform", color: "#2563eb" },
				{ id: "empty-cat", label: "Empty Category", color: "#999" },
			],
			// Only developer-platform services; "empty-cat" has none.
			services: mockCatalog.services.filter((s) => s.category === "developer-platform"),
		};

		vi.mocked(useCatalog).mockReturnValue({
			data: catalogWithEmptyCat,
			isLoading: false,
		} as unknown as ReturnType<typeof useCatalog>);

		renderPalette();

		expect(screen.queryByText("Empty Category")).not.toBeInTheDocument();
		expect(screen.getByText("Developer Platform")).toBeInTheDocument();
	});

	it("renders a 'Services' heading in the palette header", () => {
		vi.mocked(useCatalog).mockReturnValue({
			data: mockCatalog,
			isLoading: false,
		} as unknown as ReturnType<typeof useCatalog>);

		renderPalette();

		expect(screen.getByRole("heading", { name: "Services" })).toBeInTheDocument();
	});
});
