import { createContext, type ReactNode, useContext } from "react";
import type { ApiError } from "@/api/client";
import type { ApiUser } from "@/api/hooks/useMe";
import { useMe } from "@/api/hooks/useMe";

/**
 * Re-export `ApiUser` so components that previously imported it from this
 * module continue to work without path changes.
 */
export type { ApiUser } from "@/api/hooks/useMe";

/**
 * Snapshot of the authentication state managed by `AuthProvider`.
 *
 * - `user` — the authenticated user's profile, or `null` while loading or when
 *   unauthenticated.
 * - `isLoading` — `true` until the first `/api/me` response is received.
 * - `error` — `"unauthorized"` for 401 responses; an error message string
 *   for other failures; `null` when authenticated successfully.
 */
interface AuthState {
	user: ApiUser | null;
	isLoading: boolean;
	error: string | null;
}

/**
 * Full value exposed by the `AuthContext`.
 *
 * Extends `AuthState` with a `refetch` callback that can be used to
 * re-fetch the current user profile (e.g. after an admin role promotion).
 */
interface AuthContextValue extends AuthState {
	/**
	 * Re-fetches `/api/me` and updates the auth state.
	 *
	 * Delegates to TanStack Query's `refetch` internally.
	 * Useful when the caller knows the user's session or role may have changed.
	 */
	refetch: () => void;
}

/**
 * React context that holds the current authentication state.
 *
 * `null` when accessed outside an `AuthProvider` — the `useAuth()` hook
 * throws in that case so the null is never visible to consumers.
 */
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provides authentication state to the component tree below it.
 *
 * Delegates entirely to the `useMe` TanStack Query hook so that the auth
 * state benefits from caching, deduplication, and stale-while-revalidate
 * semantics. **Must be rendered inside a `QueryClientProvider`.**
 *
 * Error mapping:
 * - `error === "unauthorized"` — returned when `useMe` fails with an
 *   `ApiError` whose `status === 401`. Downstream components use this to
 *   redirect the user to the login page.
 * - Other non-empty `error` strings — network or server errors.
 *
 * @param props - Component props.
 * @param props.children - The subtree that will have access to `useAuth()`.
 *
 * @example
 * ```tsx
 * // Must be wrapped in QueryClientProvider:
 * <QueryClientProvider client={queryClient}>
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 * </QueryClientProvider>
 * ```
 */
export function AuthProvider({ children }: { children: ReactNode }) {
	const { data: user, isLoading, error, refetch } = useMe();

	const errorMessage = error ? ((error as ApiError).status === 401 ? "unauthorized" : (error as Error).message) : null;

	return (
		<AuthContext.Provider
			value={{
				user: user ?? null,
				isLoading,
				error: errorMessage,
				refetch,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

/**
 * Returns the current authentication context value.
 *
 * Must be called from within a component that is a descendant of `AuthProvider`.
 * Throws a descriptive error if called outside of that tree.
 *
 * @returns The `AuthContextValue` containing `user`, `isLoading`, `error`, and
 *   `refetch`.
 *
 * @throws If called outside an `AuthProvider`.
 *
 * @example
 * ```tsx
 * function Header() {
 *   const { user, isLoading } = useAuth();
 *   if (isLoading) return <Spinner />;
 *   return <span>{user?.email}</span>;
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
