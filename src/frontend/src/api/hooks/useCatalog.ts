import type { CatalogData } from "@architect/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";

/**
 * Stable query key for the service catalog.
 *
 * Exported so other code can prefetch or inspect the catalog cache entry.
 */
export const CATALOG_QUERY_KEY = ["catalog"] as const;

/**
 * TanStack Query hook that fetches the Cloudflare service catalog from
 * `GET /api/catalog`.
 *
 * `staleTime: Infinity` prevents TanStack Query from ever marking the catalog
 * as stale during a session. The catalog is a static dataset that only changes
 * on a new deployment; background refetching would waste bandwidth and cause
 * unnecessary re-renders of the service palette.
 *
 * The returned `CatalogData` includes all services (with icon paths and doc
 * URLs), categories (with accent colors), and edge type definitions.
 *
 * @returns A TanStack Query result containing `CatalogData` data,
 *   loading state, and error state.
 *
 * @example
 * ```tsx
 * function ServicePalette() {
 *   const { data: catalog, isLoading } = useCatalog();
 *   if (isLoading) return <Spinner />;
 *   return <ul>{catalog?.services.map(renderService)}</ul>;
 * }
 * ```
 */
export function useCatalog() {
	return useQuery<CatalogData>({
		queryKey: CATALOG_QUERY_KEY,
		queryFn: () => apiClient<CatalogData>("catalog"),
		staleTime: Number.POSITIVE_INFINITY,
	});
}
