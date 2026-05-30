import type { CatalogService } from "@architect/shared";
import { getValueOrDefault } from "@architect/shared";
import { useMemo } from "react";
import { useCatalog } from "@/api";
import PaletteCategory from "./PaletteCategory";

/**
 * The service palette sidebar for the architecture editor.
 *
 * Fetches the Cloudflare service catalog via the `useCatalog` TanStack Query
 * hook and renders all services grouped by category. Each category is
 * displayed as a collapsible section headed by the category's colored dot and
 * label.
 *
 * Categories are rendered in the order they appear in the catalog response.
 * Categories with no services are silently omitted. The service list is
 * scrollable when the catalog is large enough to overflow the available height.
 *
 * Search (F4-US2) is deferred and not implemented here. The palette currently
 * shows all services at all times.
 *
 * @returns The full palette sidebar, or a loading/error state when the catalog
 *   is not yet available.
 *
 * @example
 * ```tsx
 * // Rendered inside the Editor page as a fixed-width sidebar.
 * <aside className="w-60 shrink-0 border-r bg-background">
 *   <ServicePalette />
 * </aside>
 * ```
 */
export function ServicePalette() {
	const { data: catalog, isLoading } = useCatalog();

	/**
	 * Groups catalog services by their category ID, then pairs each category
	 * definition with its services in catalog order.
	 *
	 * The result is memoized so re-renders caused by unrelated state changes
	 * (e.g. a different node being selected) do not recompute the grouping.
	 */
	const groupedServices = useMemo(() => {
		if (!catalog) return [];

		const servicesByCategory = new Map<string, CatalogService[]>();
		for (const service of catalog.services) {
			const existing = servicesByCategory.get(service.category) ?? [];
			existing.push(service);
			servicesByCategory.set(service.category, existing);
		}

		// Return categories in catalog order, filtering out empty ones.
		return catalog.categories
			.filter((cat) => servicesByCategory.has(cat.id))
			.map((cat) => ({
				category: cat,
				// The filter above guarantees this entry exists.
				services: getValueOrDefault(servicesByCategory.get(cat.id), []),
			}));
	}, [catalog]);

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center p-4">
				<span className="text-sm text-muted-foreground">Loading catalog…</span>
			</div>
		);
	}

	if (!catalog) {
		return (
			<div className="flex h-full items-center justify-center p-4">
				<span className="text-sm text-destructive">Failed to load catalog</span>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="border-b px-3 py-2">
				<h2 className="text-sm font-semibold">Services</h2>
			</div>
			<div className="flex-1 overflow-y-auto p-2">
				{groupedServices.map(({ category, services }) => (
					<PaletteCategory key={category.id} category={category} services={services} />
				))}
			</div>
		</div>
	);
}
