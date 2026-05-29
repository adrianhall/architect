import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Props for `ProtectedRoute`.
 */
interface ProtectedRouteProps {
	/** The content to render when the user is authenticated. */
	children: ReactNode;
}

/**
 * Route guard that requires a valid authenticated session.
 *
 * Behaviour by auth state:
 * - **Loading** — renders a centred CSS spinner (`role="status"`) while the
 *   `/api/me` response is in flight. The protected content is not shown yet.
 * - **Unauthenticated** — redirects to `/_auth/login` (the Cloudflare Access
 *   or dev-mode PIN login page) using `<Navigate replace>` so the redirect
 *   does not pollute browser history.
 * - **Authenticated** — renders `children` as-is.
 *
 * This component renders `children` directly (not `<Outlet />`) so it can
 * wrap route elements in the route config alongside `AppShell` (which uses
 * `<Outlet />`).
 *
 * @param props - Component props.
 * @param props.children - Content to render when authenticated.
 * @returns A spinner, a redirect, or the protected children.
 *
 * @example
 * ```tsx
 * <Route
 *   element={
 *     <ProtectedRoute>
 *       <AppShell />
 *     </ProtectedRoute>
 *   }
 * >
 *   <Route path="/" element={<Dashboard />} />
 * </Route>
 * ```
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
	const { user, isLoading, error } = useAuth();

	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center" role="status">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
				<span className="sr-only">Loading...</span>
			</div>
		);
	}

	if (error === "unauthorized" || user === null) {
		// Redirect to the cloudflare-auth login page (PIN in dev, Access in prod).
		return <Navigate to="/_auth/login" replace />;
	}

	return <>{children}</>;
}
