import type { DiagramResponse } from "@architect/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../client";

/**
 * Stable query key for the complete list of the current user's diagrams.
 *
 * All mutation hooks invalidate this key on success so that the dashboard
 * list is always up to date after a create/update/delete/duplicate.
 */
export const DIAGRAMS_QUERY_KEY = ["diagrams"] as const;

/**
 * Returns the per-diagram query key for a specific diagram ID.
 *
 * Use this to invalidate or prefetch a single diagram's cache entry.
 *
 * @param id - The ULID of the diagram.
 * @returns A readonly tuple `["diagrams", id]`.
 */
export const diagramQueryKey = (id: string) => ["diagrams", id] as const;

/**
 * Fetches the list of all diagrams owned by the current user.
 *
 * The result is cached under `DIAGRAMS_QUERY_KEY`. All mutation hooks
 * (create, update, rename, delete, duplicate) invalidate this cache entry
 * on success so the dashboard stays fresh.
 *
 * @returns A TanStack Query result containing `DiagramResponse[]` (or `undefined`
 *   while loading) and loading/error state.
 */
export function useListDiagrams() {
	return useQuery<DiagramResponse[]>({
		queryKey: DIAGRAMS_QUERY_KEY,
		queryFn: () => apiClient<DiagramResponse[]>("diagrams"),
	});
}

/**
 * Fetches a single diagram by its ID.
 *
 * The query is disabled when `id` is an empty string or falsy value so it
 * does not fire on routes that don't have a diagram ID yet.
 *
 * @param id - The ULID of the diagram to fetch.
 * @returns A TanStack Query result containing the `DiagramResponse` data.
 */
export function useDiagram(id: string) {
	return useQuery<DiagramResponse>({
		queryKey: diagramQueryKey(id),
		queryFn: () => apiClient<DiagramResponse>(`diagrams/${id}`),
		enabled: !!id,
	});
}

/**
 * Mutation hook to create a new blank diagram.
 *
 * Returns the newly created `DiagramResponse` object directly from
 * `mutationResult.data` so the caller can navigate to `/editor/:id`
 * immediately after the mutation succeeds.
 *
 * Invalidates `DIAGRAMS_QUERY_KEY` on success.
 *
 * @returns A TanStack Query mutation result. Call `mutateAsync({ title })` to
 *   trigger the creation and await the new diagram.
 *
 * @example
 * ```tsx
 * const create = useCreateDiagram();
 * const handleCreate = async () => {
 *   const diagram = await create.mutateAsync({ title: "New Diagram" });
 *   navigate(`/editor/${diagram.id}`);
 * };
 * ```
 */
export function useCreateDiagram() {
	const queryClient = useQueryClient();

	return useMutation<DiagramResponse, Error, { title: string }>({
		mutationFn: ({ title }) =>
			apiClient<DiagramResponse>("diagrams", {
				method: "POST",
				body: JSON.stringify({ title }),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
		},
	});
}

/**
 * Mutation hook to fully update a diagram (graph data, title, and version).
 *
 * Sends the current `version` for optimistic concurrency control. The server
 * returns HTTP 409 if the version does not match the stored value, indicating
 * that another session saved changes while this one was editing.
 *
 * Invalidates both the specific diagram key and `DIAGRAMS_QUERY_KEY` on success.
 *
 * @returns A TanStack Query mutation result. Call `mutateAsync({ id, title, graph_data, version })`.
 */
export function useUpdateDiagram() {
	const queryClient = useQueryClient();

	return useMutation<
		DiagramResponse,
		Error,
		{
			id: string;
			title: string;
			graph_data: unknown;
			version: number;
		}
	>({
		mutationFn: ({ id, ...data }) =>
			apiClient<DiagramResponse>(`diagrams/${id}`, {
				method: "PUT",
				body: JSON.stringify(data),
			}),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: diagramQueryKey(variables.id) });
			queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
		},
	});
}

/**
 * Mutation hook to rename a diagram (PATCH — title only, no version check).
 *
 * Uses PATCH instead of PUT so the caller does not need to supply `graph_data`
 * or `version`. Invalidates both the specific diagram key and `DIAGRAMS_QUERY_KEY`.
 *
 * @returns A TanStack Query mutation result. Call `mutateAsync({ id, title })`.
 */
export function useRenameDiagram() {
	const queryClient = useQueryClient();

	return useMutation<DiagramResponse, Error, { id: string; title: string }>({
		mutationFn: ({ id, title }) =>
			apiClient<DiagramResponse>(`diagrams/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ title }),
			}),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: diagramQueryKey(variables.id) });
			queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
		},
	});
}

/**
 * Mutation hook to duplicate an existing diagram.
 *
 * Returns the newly created duplicate as `mutationResult.data` so callers
 * can navigate to `/editor/:newId` after the mutation succeeds.
 *
 * Invalidates `DIAGRAMS_QUERY_KEY` on success.
 *
 * @returns A TanStack Query mutation result. Call `mutateAsync({ id })` where
 *   `id` is the source diagram to clone.
 *
 * @example
 * ```tsx
 * const duplicate = useDuplicateDiagram();
 * const handleDuplicate = async (sourceId: string) => {
 *   const copy = await duplicate.mutateAsync({ id: sourceId });
 *   navigate(`/editor/${copy.id}`);
 * };
 * ```
 */
export function useDuplicateDiagram() {
	const queryClient = useQueryClient();

	return useMutation<DiagramResponse, Error, { id: string }>({
		mutationFn: ({ id }) =>
			apiClient<DiagramResponse>(`diagrams/${id}/duplicate`, {
				method: "POST",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
		},
	});
}

/**
 * Mutation hook to permanently delete a diagram.
 *
 * On success, removes the specific diagram's cache entry (since the resource
 * no longer exists) and invalidates `DIAGRAMS_QUERY_KEY` to update the list.
 *
 * @returns A TanStack Query mutation result. Call `mutateAsync({ id })`.
 */
export function useDeleteDiagram() {
	const queryClient = useQueryClient();

	return useMutation<void, Error, { id: string }>({
		mutationFn: ({ id }) =>
			apiClient<void>(`diagrams/${id}`, {
				method: "DELETE",
			}),
		onSuccess: (_data, variables) => {
			// Remove the entry — it no longer exists rather than being stale.
			queryClient.removeQueries({ queryKey: diagramQueryKey(variables.id) });
			queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
		},
	});
}
