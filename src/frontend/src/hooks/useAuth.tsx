import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

/**
 * User profile as returned directly by the `/api/me` endpoint.
 *
 * This type uses snake_case property names to match the API wire format.
 * The backend Drizzle schema stores columns as snake_case SQL names and the
 * route handler explicitly maps them back to snake_case before returning.
 *
 * Note: The shared `User` type from `@architect/shared` uses camelCase
 * (`avatarUrl`, `createdAt`, `updatedAt`). ISSUE-11 will introduce a typed API
 * client that performs the mapping. For now, components consume this type.
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
 * Snapshot of the authentication state managed by `AuthProvider`.
 *
 * - `user` — the authenticated user's profile, or `null` while loading or when
 *   unauthenticated.
 * - `isLoading` — `true` until the first `/api/me` response is received.
 * - `error` — `"unauthorized"` for 401/302 responses; an error message string
 *   for network failures; `null` when authenticated successfully.
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
	 * Useful when the caller knows the user's session or role may have changed
	 * (e.g. after an admin promotes the currently signed-in user).
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
 * On mount it calls `GET /api/me` to determine whether the current session is
 * authenticated and retrieves the user's profile. All components that need the
 * current user must be rendered inside this provider.
 *
 * Error codes:
 * - `error === "unauthorized"` — returned for 401 and 302 responses, which
 *   downstream components use to redirect the user to the login page.
 * - Other non-empty `error` strings — network or server errors.
 *
 * @param props - Component props.
 * @param props.children - The subtree that will have access to `useAuth()`.
 *
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AuthState>({
		user: null,
		isLoading: true,
		error: null,
	});

	/**
	 * Fetches the current user from `/api/me` and updates state.
	 * Wrapped in useCallback so it is stable across renders and can be safely
	 * listed as a useEffect dependency.
	 */
	const fetchUser = useCallback(async () => {
		setState((prev) => ({ ...prev, isLoading: true, error: null }));
		try {
			const res = await fetch("/api/me");
			if (!res.ok) {
				if (res.status === 401 || res.status === 302) {
					setState({ user: null, isLoading: false, error: "unauthorized" });
					return;
				}
				throw new Error(`Failed to fetch user: ${res.status}`);
			}
			const body = (await res.json()) as { data: ApiUser };
			setState({ user: body.data, isLoading: false, error: null });
		} catch (err) {
			setState({
				user: null,
				isLoading: false,
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}
	}, []);

	useEffect(() => {
		fetchUser();
	}, [fetchUser]);

	return <AuthContext.Provider value={{ ...state, refetch: fetchUser }}>{children}</AuthContext.Provider>;
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
