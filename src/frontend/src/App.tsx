import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AuthProvider } from "@/hooks/useAuth";
import { Admin } from "@/pages/Admin";
import { Dashboard } from "@/pages/Dashboard";
import { Editor } from "@/pages/Editor";

/**
 * Shared `QueryClient` instance for the application.
 *
 * Defined outside the component so it is created once and never re-instantiated
 * on renders. Default options:
 * - `refetchOnWindowFocus: false` — prevents unnecessary refetches when the
 *   user switches browser tabs; the app uses explicit cache invalidation after
 *   mutations instead.
 * - `retry: 1` — one retry for transient network failures; avoids hammering the
 *   API on persistent errors (e.g. auth failures).
 */
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

/**
 * Root application component for CF-Architect.
 *
 * Establishes the full provider stack in correct nesting order:
 * 1. `QueryClientProvider` — must wrap everything because `AuthProvider` uses
 *    the `useMe` TanStack Query hook internally.
 * 2. `BrowserRouter` — React Router v7 route context.
 * 3. `AuthProvider` — provides `useAuth()` to the entire route tree.
 *
 * Route layout:
 * - A pathless layout route applies `ProtectedRoute` + `AppShell` to all
 *   children, requiring authentication and rendering the shared header.
 * - `/` → `Dashboard` (protected)
 * - `/editor/:id` → `Editor` (protected)
 * - `/admin` → `Admin` (protected + admin role required via `AdminRoute`)
 *
 * @returns The fully configured application with providers, routing, and auth.
 *
 * @example
 * ```tsx
 * // Entry point (main.tsx):
 * import { App } from "./App";
 * createRoot(document.getElementById("root")!).render(<App />);
 * ```
 */
export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<AuthProvider>
					<Routes>
						{/* Layout route: requires auth; renders AppShell for all children */}
						<Route
							element={
								<ProtectedRoute>
									<AppShell />
								</ProtectedRoute>
							}
						>
							<Route path="/" element={<Dashboard />} />
							<Route path="/editor/:id" element={<Editor />} />
							<Route
								path="/admin"
								element={
									<AdminRoute>
										<Admin />
									</AdminRoute>
								}
							/>
						</Route>
					</Routes>
				</AuthProvider>
			</BrowserRouter>
		</QueryClientProvider>
	);
}
