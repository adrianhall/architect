import type { CatalogService } from "@architect/shared";
import { type DragEvent, memo } from "react";

/**
 * Props for `PaletteItem`.
 */
interface PaletteItemProps {
	/** The catalog service this item represents. */
	service: CatalogService;
}

/**
 * A single draggable service item in the service palette sidebar.
 *
 * Renders the service's SVG icon and short name. When the user begins dragging
 * the item, it writes two drag-data entries:
 *
 * - `"application/cf-architect-service"` → the service `typeId` (read by the
 *   Editor's `onDrop` handler to look up catalog details and create a node).
 * - `"text/plain"` → the `shortName` (fallback for debugging / accessibility).
 *
 * The `<img>` element is marked `draggable={false}` to prevent the browser
 * from attempting to drag the image independently of the container.
 *
 * The item renders as a `<button>` with `draggable` set so that it satisfies
 * both accessibility requirements (focusable, semantic) and HTML5 drag-and-drop.
 * The `onKeyDown` handler is a no-op because drag-and-drop is pointer-based;
 * keyboard activation of drag is deferred (F4-US14 is post-MVP).
 *
 * @param props - Component props.
 * @param props.service - The catalog service to render.
 *
 * @example
 * ```tsx
 * <PaletteItem service={catalogService} />
 * ```
 */
function PaletteItem({ service }: PaletteItemProps) {
	/**
	 * Populates the drag transfer data when a drag begins.
	 *
	 * @param event - The native HTML drag event.
	 */
	const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
		// Custom MIME type carries the typeId that the drop handler reads.
		event.dataTransfer.setData("application/cf-architect-service", service.typeId);
		// Fallback plain-text value for debugging and accessibility tools.
		event.dataTransfer.setData("text/plain", service.shortName);
		event.dataTransfer.effectAllowed = "move";
	};

	return (
		<button
			type="button"
			draggable
			onDragStart={handleDragStart}
			className="flex w-full cursor-grab items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent active:cursor-grabbing"
			title={service.officialName}
		>
			<img
				src={`/catalog/icons/${service.iconPath}`}
				alt={`${service.shortName} icon`}
				className="size-5 shrink-0 object-contain"
				// Prevent the browser from starting an image drag independently.
				draggable={false}
			/>
			<span className="truncate text-sm">{service.shortName}</span>
		</button>
	);
}

export default memo(PaletteItem);
