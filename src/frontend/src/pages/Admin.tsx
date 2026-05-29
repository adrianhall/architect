import { useAuth } from "@/hooks/useAuth";

/**
 * Admin page — user management and system administration.
 *
 * Displays an "Admin" heading and the signed-in admin user's email address.
 * This page is only reachable when the user holds the `admin` role; the
 * `AdminRoute` guard in `App.tsx` renders a "Forbidden" message for other
 * users.
 *
 * This is a placeholder implementation; the full user management UI and audit
 * log are added in ISSUE-20.
 *
 * Must be rendered within an `AuthProvider`, a `ProtectedRoute`, and an
 * `AdminRoute` to guarantee that `user` is non-null and has role `"admin"`.
 *
 * @returns The admin placeholder page.
 *
 * @example
 * ```tsx
 * <Route
 *   path="/admin"
 *   element={<AdminRoute><Admin /></AdminRoute>}
 * />
 * ```
 */
export function Admin() {
	const { user } = useAuth();

	return (
		<div>
			<h1 className="text-2xl font-bold">Admin</h1>
			{user !== null && <p className="mt-2 text-muted-foreground">Admin user: {user.email}</p>}
		</div>
	);
}
