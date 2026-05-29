import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../client";

/**
 * Parameters accepted by `useAdminUsers` for filtering and paginating the
 * user list on the admin dashboard.
 */
interface AdminUsersParams {
	/** Page number (1-based, default 1). */
	page?: number;
	/** Number of results per page (1–100, default 20). */
	limit?: number;
	/** Column to sort by: `"email"` | `"name"` | `"role"` | `"created_at"`. */
	sort?: string;
	/** Sort direction. */
	order?: "asc" | "desc";
	/** Case-insensitive substring match on email and name. */
	search?: string;
}

/**
 * A single user row as returned by `GET /api/admin/users`.
 *
 * Uses snake_case to match the API wire format produced by `serializeAdminUser`
 * in the worker. Includes `diagram_count` (absent from the shared `User` type)
 * which is computed server-side via a LEFT JOIN.
 */
interface AdminUser {
	/** ULID primary key. */
	id: string;
	/** Email address. */
	email: string;
	/** Display name; `null` when not set. */
	name: string | null;
	/** Avatar URL; `null` when not provided by the IdP. */
	avatar_url: string | null;
	/** Current role. */
	role: string;
	/** Number of diagrams owned by this user. */
	diagram_count: number;
	/** Unix timestamp (ms) of account creation. */
	created_at: number;
	/** Unix timestamp (ms) of last profile update. */
	updated_at: number;
}

/**
 * Paginated response envelope from `GET /api/admin/users`.
 */
interface AdminUsersResponse {
	/** User records for the current page. */
	users: AdminUser[];
	/** Pagination metadata. */
	pagination: {
		/** Current page number (1-based). */
		page: number;
		/** Results per page. */
		limit: number;
		/** Total matching user count (for computing total pages). */
		total: number;
		/** Total number of pages. */
		totalPages: number;
	};
}

/**
 * Stable base query key for all admin user queries.
 *
 * Per-page queries are keyed as `[...ADMIN_USERS_QUERY_KEY, params]`.
 * Mutations invalidate using this base key so all page variants are refreshed.
 */
export const ADMIN_USERS_QUERY_KEY = ["admin", "users"] as const;

/**
 * TanStack Query hook that fetches a paginated, filterable list of all users
 * (admin-only endpoint: `GET /api/admin/users`).
 *
 * Query parameters are appended as a URL search string. The full `params`
 * object is included in the query key so different parameter combinations
 * are cached separately.
 *
 * @param params - Optional filter and pagination parameters.
 * @returns A TanStack Query result containing `AdminUsersResponse`.
 *
 * @example
 * ```tsx
 * const { data } = useAdminUsers({ page: 1, limit: 20, search: "alice" });
 * const users = data?.users ?? [];
 * ```
 */
export function useAdminUsers(params: AdminUsersParams = {}) {
	const searchParams = new URLSearchParams();
	if (params.page) searchParams.set("page", String(params.page));
	if (params.limit) searchParams.set("limit", String(params.limit));
	if (params.sort) searchParams.set("sort", params.sort);
	if (params.order) searchParams.set("order", params.order);
	if (params.search) searchParams.set("search", params.search);

	const queryString = searchParams.toString();
	const path = queryString ? `admin/users?${queryString}` : "admin/users";

	return useQuery<AdminUsersResponse>({
		queryKey: [...ADMIN_USERS_QUERY_KEY, params],
		queryFn: () => apiClient<AdminUsersResponse>(path),
	});
}

/**
 * Mutation hook to promote a user to the `"admin"` role.
 *
 * Sends `PATCH /api/admin/users/:userId/role` with `{ role: "admin" }`.
 * Invalidates `ADMIN_USERS_QUERY_KEY` on success so the admin user list
 * reflects the updated role.
 *
 * @returns A TanStack Query mutation result. Call `mutateAsync({ userId })`.
 */
export function usePromoteUser() {
	const queryClient = useQueryClient();

	return useMutation<AdminUser, Error, { userId: string }>({
		mutationFn: ({ userId }) =>
			apiClient<AdminUser>(`admin/users/${userId}/role`, {
				method: "PATCH",
				body: JSON.stringify({ role: "admin" }),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
		},
	});
}

/**
 * Mutation hook to demote a user back to the `"user"` role.
 *
 * Sends `PATCH /api/admin/users/:userId/role` with `{ role: "user" }`.
 * Invalidates `ADMIN_USERS_QUERY_KEY` on success.
 *
 * @returns A TanStack Query mutation result. Call `mutateAsync({ userId })`.
 */
export function useDemoteUser() {
	const queryClient = useQueryClient();

	return useMutation<AdminUser, Error, { userId: string }>({
		mutationFn: ({ userId }) =>
			apiClient<AdminUser>(`admin/users/${userId}/role`, {
				method: "PATCH",
				body: JSON.stringify({ role: "user" }),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
		},
	});
}

/**
 * Mutation hook to permanently delete a user (admin-only).
 *
 * Sends `DELETE /api/admin/users/:userId`. The server also deletes all
 * diagrams owned by the user before removing the user record. Invalidates
 * `ADMIN_USERS_QUERY_KEY` on success.
 *
 * @returns A TanStack Query mutation result. Call `mutateAsync({ userId })`.
 */
export function useDeleteUser() {
	const queryClient = useQueryClient();

	return useMutation<void, Error, { userId: string }>({
		mutationFn: ({ userId }) =>
			apiClient<void>(`admin/users/${userId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
		},
	});
}
