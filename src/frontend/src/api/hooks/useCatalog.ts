import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";

/**
 * Shape of the response from `GET /api/catalog`.
 *
 * Full typing will align with `CatalogData` from `@architect/shared` once
 * the frontend catalog components are implemented (ISSUE-15). For now,
 * `unknown[]` accommodates the raw service/category/edge-type objects without
 * requiring consumers to import catalog types they don't yet use.
 */
interface CatalogResponse {
	/** All Cloudflare service definitions. */
	services: unknown[];
	/** Service category groups. */
	categories: unknown[];
	/** Available diagram edge types. */
	edgeTypes: unknown[];
}

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
 * @returns A TanStack Query result containing `CatalogResponse` data,
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
	return useQuery<CatalogResponse>({
		queryKey: CATALOG_QUERY_KEY,
		queryFn: () => apiClient<CatalogResponse>("catalog"),
		staleTime: Number.POSITIVE_INFINITY,
	});
}
