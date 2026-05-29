import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";

/**
 * User profile as returned directly by the `/api/me` endpoint.
 *
 * This type mirrors the API wire format (snake_case properties), which differs
 * from the shared `User` type in `@architect/shared` (camelCase). A future
 * issue should reconcile these by either updating the API to return camelCase
 * or adding a mapping layer in the client. For now, consumers of `useMe` and
 * `useAuth` receive this snake_case shape.
 */
export interface ApiUser {
	/** ULID primary key. */
	id: string;
	/** Email address from the Cloudflare Access JWT `email` claim. */
	email: string;
	/** Display name sourced from the IdP; `null` when not provided. */
	name: string | null;
	/** Avatar URL sourced from the IdP; `null` when not provided. */
	avatar_url: string | null;
	/** The user's current role in the system. */
	role: "user" | "admin";
	/** Unix timestamp (ms) when the user record was created. */
	created_at: number;
	/** Unix timestamp (ms) when the user record was last updated. */
	updated_at: number;
}

/**
 * Stable query key for the current user's profile.
 *
 * Exported so other code can invalidate or prefetch the `"me"` query
 * without importing the hook itself.
 */
export const ME_QUERY_KEY = ["me"] as const;

/**
 * TanStack Query hook that fetches the current user's profile from `GET /api/me`.
 *
 * Used internally by `AuthProvider` and can also be called directly anywhere
 * the current user's data is needed. The result is cached for 5 minutes; after
 * that TanStack Query will background-refetch on the next mount.
 *
 * The query does **not** retry on failure (`retry: false`) because a failed
 * `/api/me` request almost always indicates the user is not authenticated
 * and retrying would produce repeated 401 responses.
 *
 * @returns A TanStack Query `UseQueryResult` containing the `ApiUser` data,
 *   loading state, and error state. Use `result.data`, `result.isLoading`,
 *   and `result.error` in consumers.
 *
 * @example
 * ```tsx
 * function ProfileBadge() {
 *   const { data: user, isLoading } = useMe();
 *   if (isLoading) return <Spinner />;
 *   return <span>{user?.email}</span>;
 * }
 * ```
 */
export function useMe() {
	return useQuery<ApiUser>({
		queryKey: ME_QUERY_KEY,
		queryFn: () => apiClient<ApiUser>("me"),
		retry: false,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}
