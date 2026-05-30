import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AuthProvider } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Lazy-loaded page modules.
// Each `lazy()` call produces a separate code-split chunk at build time.
// The `.then((m) => ({ default: m.X }))` adapter is required because
// `React.lazy` expects a module with a default export, but our pages use
// named exports (`export function Dashboard()`).
// ---------------------------------------------------------------------------

/**
 * Lazy-loaded Dashboard page.
 * Loaded on first navigation to `/`.
 */
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));

/**
 * Lazy-loaded Editor page.
 * Loaded on first navigation to `/editor/:id`.
 * Brings in `@xyflow/react` (~220 kB) and `zustand` as transitive imports,
 * which are isolated into their own vendor chunks (`vendor-flow`,
 * `vendor-zustand`) so they are never downloaded for other routes.
 */
const Editor = lazy(() => import("@/pages/Editor").then((m) => ({ default: m.Editor })));

/**
 * Lazy-loaded Admin page.
 * Loaded on first navigation to `/admin`.
 */
const Admin = lazy(() => import("@/pages/Admin").then((m) => ({ default: m.Admin })));

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
 * Fallback shown by the `<Suspense>` boundary while a lazy page chunk loads.
 *
 * Renders a centred animated spinner with an accessible `role="status"` and
 * a visually hidden label for screen readers. Uses the same spinner style as
 * `ProtectedRoute`'s auth-loading state so the loading experience is
 * visually consistent regardless of which page is being fetched.
 *
 * @returns A full-height flex container with a centred spin animation.
 *
 * @example
 * ```tsx
 * <Suspense fallback={<RouteFallback />}>
 *   <Outlet />
 * </Suspense>
 * ```
 */
function RouteFallback() {
	return (
		<div className="flex h-full items-center justify-center" role="status">
			<span className="sr-only">Loading…</span>
			<div className="size-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
		</div>
	);
}

/**
 * Root application component for CF-Architect.
 *
 * Establishes the full provider stack in correct nesting order:
 * 1. `QueryClientProvider` — must wrap everything because `AuthProvider` uses
 *    the `useMe` TanStack Query hook internally.
 * 2. `BrowserRouter` — React Router v7 route context.
 * 3. `AuthProvider` — provides `useAuth()` to the entire route tree.
 *
 * All three page components are **lazy-loaded** via `React.lazy` so that
 * the canvas engine (`@xyflow/react`) is not downloaded until the user
 * navigates to `/editor/:id`. A `<Suspense>` layout route provides a
 * spinner fallback while the page chunk fetches.
 *
 * Route layout:
 * - A pathless layout route applies `ProtectedRoute` + `AppShell` to all
 *   children, requiring authentication and rendering the shared header.
 * - A nested `<Suspense>` layout route wraps all page routes so that the
 *   spinner appears inside the app chrome (not as a blank full-screen state).
 * - `/` → `Dashboard` (lazy, protected)
 * - `/editor/:id` → `Editor` (lazy, protected; triggers `vendor-flow` download)
 * - `/admin` → `Admin` (lazy, protected + admin role required via `AdminRoute`)
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
							{/* Suspense boundary: shown while a lazy page chunk fetches */}
							<Route
								element={
									<Suspense fallback={<RouteFallback />}>
										<Outlet />
									</Suspense>
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
						</Route>
					</Routes>
				</AuthProvider>
			</BrowserRouter>
		</QueryClientProvider>
	);
}
