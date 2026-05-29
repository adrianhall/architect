import { useAuth } from "@/hooks/useAuth";

/**
 * Dashboard page — the default landing page after login.
 *
 * Displays a "Dashboard" heading and the signed-in user's email address.
 * This is a placeholder implementation; the full card grid and diagram CRUD
 * actions are added in ISSUE-12.
 *
 * Must be rendered within an `AuthProvider` and a `ProtectedRoute` so that
 * `useAuth()` is guaranteed to return a non-null user.
 *
 * @returns The dashboard placeholder page.
 *
 * @example
 * ```tsx
 * <Route path="/" element={<Dashboard />} />
 * ```
 */
export function Dashboard() {
	const { user } = useAuth();

	return (
		<div>
			<h1 className="text-2xl font-bold">Dashboard</h1>
			{user !== null && <p className="mt-2 text-muted-foreground">Logged in as {user.email}</p>}
		</div>
	);
}
