import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Props for `AdminRoute`.
 */
interface AdminRouteProps {
	/** The content to render when the user holds the `admin` role. */
	children: ReactNode;
}

/**
 * Route guard that restricts access to users with the `admin` role.
 *
 * This component must be nested inside a `ProtectedRoute` — it assumes that
 * authentication has already been verified and `user` is non-null.
 *
 * Behaviour by role:
 * - **Non-admin** — renders a centred "Forbidden" message with a short
 *   explanation. No redirect so the user understands why the page is
 *   inaccessible.
 * - **Admin** — renders `children` as-is.
 *
 * @param props - Component props.
 * @param props.children - Content to render when the user is an admin.
 * @returns A "Forbidden" message or the admin-only children.
 *
 * @example
 * ```tsx
 * <Route
 *   path="/admin"
 *   element={
 *     <AdminRoute>
 *       <Admin />
 *     </AdminRoute>
 *   }
 * />
 * ```
 */
export function AdminRoute({ children }: AdminRouteProps) {
	const { user } = useAuth();

	if (user?.role !== "admin") {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-destructive">Forbidden</h1>
					<p className="mt-2 text-muted-foreground">You do not have permission to access this page.</p>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
