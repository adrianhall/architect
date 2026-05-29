/**
 * Barrel export for the typed API client and all TanStack Query hooks.
 *
 * Import from `@/api` in components and hooks rather than from the individual
 * module paths. This keeps imports stable if internal file locations change.
 *
 * @example
 * ```ts
 * import { useListDiagrams, useCreateDiagram, ApiError } from "@/api";
 * ```
 */

// ── Core client ───────────────────────────────────────────────────────────────
export { ApiError, apiClient } from "./client";
// ── Admin ─────────────────────────────────────────────────────────────────────
export {
	ADMIN_USERS_QUERY_KEY,
	useAdminUsers,
	useDeleteUser,
	useDemoteUser,
	usePromoteUser,
} from "./hooks/useAdmin";
// ── Catalog ──────────────────────────────────────────────────────────────────
export { CATALOG_QUERY_KEY, useCatalog } from "./hooks/useCatalog";

// ── Diagrams ─────────────────────────────────────────────────────────────────
export {
	DIAGRAMS_QUERY_KEY,
	diagramQueryKey,
	useCreateDiagram,
	useDeleteDiagram,
	useDiagram,
	useDuplicateDiagram,
	useListDiagrams,
	useRenameDiagram,
	useUpdateDiagram,
} from "./hooks/useDiagrams";
export type { ApiUser } from "./hooks/useMe";
// ── Auth / user ──────────────────────────────────────────────────────────────
export { ME_QUERY_KEY, useMe } from "./hooks/useMe";
