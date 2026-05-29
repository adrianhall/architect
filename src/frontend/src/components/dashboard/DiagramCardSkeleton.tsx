import { Card, CardContent, CardFooter } from "@/components/ui/card";

/**
 * Loading skeleton placeholder for a `DiagramCard`.
 *
 * Renders an animated pulse skeleton that mirrors the layout of a real
 * `DiagramCard` — a coloured header block and two lines of metadata text —
 * so that the grid retains its shape while diagram data is being fetched.
 *
 * Shown in an 8-card grid on the dashboard while `useListDiagrams` is loading.
 *
 * @returns A single skeleton card element.
 *
 * @example
 * ```tsx
 * // Render 8 skeletons while loading:
 * {isLoading && Array.from({ length: 8 }).map((_, i) => (
 *   <DiagramCardSkeleton key={`skeleton-${i}`} />
 * ))}
 * ```
 */
export function DiagramCardSkeleton() {
	return (
		<Card className="flex flex-col">
			<CardContent className="p-0">
				<div className="h-36 animate-pulse rounded-t-lg bg-muted" />
			</CardContent>
			<CardFooter className="p-3">
				<div className="w-full space-y-2">
					<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
					<div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
				</div>
			</CardFooter>
		</Card>
	);
}
