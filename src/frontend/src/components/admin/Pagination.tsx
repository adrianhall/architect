import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Props for the `Pagination` component.
 */
interface PaginationProps {
	/** The current 1-based page number. */
	page: number;
	/** Total number of pages. Prev/Next buttons are disabled at boundaries. */
	totalPages: number;
	/** Currently selected items-per-page value (10, 20, or 50). */
	limit: number;
	/**
	 * Called when the user clicks a page number, the previous button, or the
	 * next button.
	 *
	 * @param page - The requested 1-based page number.
	 */
	onPageChange: (page: number) => void;
	/**
	 * Called when the user selects a different items-per-page value.
	 *
	 * @param limit - The requested items per page (10, 20, or 50).
	 */
	onLimitChange: (limit: number) => void;
}

/**
 * Generates a compact list of page numbers with ellipsis for the given
 * current page and total number of pages.
 *
 * For seven or fewer pages, every page number is returned. For larger ranges,
 * a window of three pages centred on `current` is returned, with `"..."` as
 * a placeholder when the window does not immediately follow 1 or immediately
 * precede `total`.
 *
 * @param current - The currently active 1-based page number.
 * @param total - The total number of pages.
 * @returns An array of page numbers and `"..."` ellipsis placeholders.
 *
 * @example
 * ```ts
 * getPageNumbers(5, 10); // => [1, "...", 4, 5, 6, "...", 10]
 * getPageNumbers(2, 5);  // => [1, 2, 3, 4, 5]
 * ```
 */
function getPageNumbers(current: number, total: number): (number | "...")[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}
	const pages: (number | "...")[] = [1];
	if (current > 3) pages.push("...");
	for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
		pages.push(i);
	}
	if (current < total - 2) pages.push("...");
	pages.push(total);
	return pages;
}

/**
 * Pagination controls for the admin user table.
 *
 * Renders a row with an items-per-page `Select` on the left and page navigation
 * (previous button, numbered page buttons with ellipsis, next button) on the
 * right. Previous/Next buttons are disabled when the user is already at the
 * boundary.
 *
 * @param props - See `PaginationProps`.
 * @returns A pagination control bar.
 *
 * @example
 * ```tsx
 * <Pagination
 *   page={currentPage}
 *   totalPages={data.pagination.totalPages}
 *   limit={limit}
 *   onPageChange={setPage}
 *   onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
 * />
 * ```
 */
export function Pagination({ page, totalPages, limit, onPageChange, onLimitChange }: PaginationProps) {
	const pages = getPageNumbers(page, totalPages);

	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<span className="text-sm text-muted-foreground">Rows per page</span>
				<Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
					<SelectTrigger className="w-20" aria-label="Rows per page">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="10">10</SelectItem>
						<SelectItem value="20">20</SelectItem>
						<SelectItem value="50">50</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-center gap-1">
				<Button
					variant="outline"
					size="icon"
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
					aria-label="Previous page"
				>
					<ChevronLeft className="h-4 w-4" />
				</Button>
				{pages.map((p, i) =>
					p === "..." ? (
						<span
							key={`ellipsis-${
								// biome-ignore lint/suspicious/noArrayIndexKey: positional ellipsis placeholders have no stable id
								i
							}`}
							className="px-2 text-muted-foreground"
						>
							...
						</span>
					) : (
						<Button
							key={p}
							variant={p === page ? "default" : "outline"}
							size="icon"
							onClick={() => onPageChange(p as number)}
							aria-label={`Page ${p}`}
							aria-current={p === page ? "page" : undefined}
						>
							{p}
						</Button>
					),
				)}
				<Button
					variant="outline"
					size="icon"
					disabled={page >= totalPages}
					onClick={() => onPageChange(page + 1)}
					aria-label="Next page"
				>
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
