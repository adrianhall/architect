import type { CatalogCategory, CatalogService } from "@architect/shared";
import { ChevronRight } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import PaletteItem from "./PaletteItem";

/**
 * Props for `PaletteCategory`.
 */
interface PaletteCategoryProps {
	/** The catalog category to render as a collapsible section header. */
	category: CatalogCategory;
	/** All services that belong to this category. */
	services: CatalogService[];
}

/**
 * A collapsible category section within the service palette sidebar.
 *
 * Renders a clickable header that includes:
 * - A colored dot whose background matches the category's accent color.
 * - The category label.
 * - A chevron icon that rotates 90° when the section is expanded.
 *
 * Clicking the header toggles the section between collapsed and expanded.
 * The collapsed/expanded state is stored in the `useUIStore` Zustand store
 * (keyed by `category.id`) so it persists across palette re-renders without
 * hitting the API.
 *
 * The service list is animated with a CSS `max-height` transition:
 * `max-h-0` when collapsed, `max-h-[2000px]` when expanded. The 2000 px
 * upper bound is a generous ceiling — the transition speed is governed by
 * the CSS `duration-200` and the actual content height determines the visible
 * result.
 *
 * @param props - Component props.
 * @param props.category - The catalog category definition (id, label, color).
 * @param props.services - Services to render inside this category section.
 *
 * @example
 * ```tsx
 * <PaletteCategory category={cat} services={catServices} />
 * ```
 */
function PaletteCategory({ category, services }: PaletteCategoryProps) {
	const isCollapsed = useUIStore((s) => s.collapsedCategories.has(category.id));
	const toggleCategory = useUIStore((s) => s.toggleCategory);

	return (
		<div className="mb-1">
			{/* Category header — clickable to toggle collapse */}
			<button
				type="button"
				className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent"
				onClick={() => toggleCategory(category.id)}
				aria-expanded={!isCollapsed}
				aria-controls={`palette-category-${category.id}`}
			>
				{/* Color dot matching the category accent color */}
				<span
					className="size-2.5 shrink-0 rounded-full"
					style={{ backgroundColor: category.color }}
					aria-hidden="true"
				/>

				{/* Category display label */}
				<span className="flex-1 text-left">{category.label}</span>

				{/* Chevron rotates 90° when expanded */}
				<ChevronRight
					className={cn("size-4 shrink-0 transition-transform duration-200", !isCollapsed && "rotate-90")}
					aria-hidden="true"
				/>
			</button>

			{/* Collapsible service list with animated max-height.
			    Using <section> satisfies the a11y requirement for a landmark region. */}
			<section
				id={`palette-category-${category.id}`}
				className={cn(
					"overflow-hidden transition-[max-height] duration-200 ease-in-out",
					isCollapsed ? "max-h-0" : "max-h-[2000px]",
				)}
				aria-label={`${category.label} services`}
			>
				<div className="py-1 pl-2">
					{services.map((service) => (
						<PaletteItem key={service.typeId} service={service} />
					))}
				</div>
			</section>
		</div>
	);
}

export default memo(PaletteCategory);
